"""Agent memory, in three tiers:

- Session memory: the thread's messages, kept by the LangGraph Postgres checkpointer. Long threads
  are trimmed for the LLM and the older part is covered by the thread summary.
- Short-term memory: summaries of the user's recent threads (Postgres `threads` table, plus the
  store namespace ("threads", user) for semantic search over past conversations).
- Long-term memory: the farm profile (profiles.py) and semantic facts in the store namespace
  ("memories", user), recalled by similarity to the current message.
"""
from __future__ import annotations

import asyncio
import re
import uuid
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.store.postgres.aio import AsyncPostgresStore
from pydantic import BaseModel, Field

from . import db, profiles

DUPLICATE_SCORE = 0.9
RECALL_LIMIT = 5
RECALL_MIN_SCORE = 0.35
RECENT_THREADS = 3

store: AsyncPostgresStore | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _item(item) -> dict:
    return {"id": item.key, **item.value, "score": getattr(item, "score", None)}


# ---------- Long-term facts ----------

async def search_memories(user_id: str, query: str, limit: int = RECALL_LIMIT) -> list[dict]:
    items = await store.asearch(("memories", user_id), query=query, limit=limit)
    return [_item(i) for i in items if i.score is None or i.score >= RECALL_MIN_SCORE]


async def add_memory(user_id: str, text: str, source_thread: str | None = None,
                     category: str = "fact") -> dict | None:
    """Stores a fact unless a near-duplicate already exists. Returns the new memory or None."""
    text = text.strip()
    if not text:
        return None
    similar = await store.asearch(("memories", user_id), query=text, limit=1)
    if similar and similar[0].score is not None and similar[0].score >= DUPLICATE_SCORE:
        return None
    key = uuid.uuid4().hex
    value = {"text": text, "category": category, "source_thread": source_thread, "created_at": _now()}
    await store.aput(("memories", user_id), key, value)
    return {"id": key, **value}


async def list_memories(user_id: str) -> list[dict]:
    items = await store.asearch(("memories", user_id), limit=500)
    return sorted((_item(i) for i in items), key=lambda m: m.get("created_at") or "", reverse=True)


async def update_memory(user_id: str, key: str, text: str) -> dict | None:
    item = await store.aget(("memories", user_id), key)
    if item is None:
        return None
    value = {**item.value, "text": text.strip(), "edited_at": _now()}
    await store.aput(("memories", user_id), key, value)  # re-embeds the new text
    return {"id": key, **value}


async def delete_memory(user_id: str, key: str) -> None:
    await store.adelete(("memories", user_id), key)


async def clear_memories(user_id: str) -> int:
    items = await list_memories(user_id)
    await asyncio.gather(*(delete_memory(user_id, m["id"]) for m in items))
    return len(items)


# ---------- Threads (short-term memory) ----------

async def ensure_thread(user_id: str, thread_id: str, first_message: str = "") -> bool:
    """Creates the thread if new (titled from its first message until reflection names it).
    Returns False if it belongs to another user."""
    row = await db.fetchrow("SELECT user_id FROM threads WHERE id = %s", thread_id)
    if row is None:
        title = " ".join(first_message.split())[:60] or "New chat"
        await db.execute("INSERT INTO threads (id, user_id, title) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                         thread_id, user_id, title)
        return True
    return row["user_id"] == user_id


async def owns_thread(user_id: str, thread_id: str) -> bool:
    return await db.fetchrow("SELECT 1 FROM threads WHERE id = %s AND user_id = %s", thread_id, user_id) is not None


async def recent_threads(user_id: str, exclude: str | None = None, limit: int = RECENT_THREADS) -> list[dict]:
    return await db.fetch(
        "SELECT id, title, summary, updated_at FROM threads WHERE user_id = %s AND id <> %s "
        "AND summary <> '' ORDER BY updated_at DESC LIMIT %s",
        user_id, exclude or "", limit,
    )


async def save_thread_summary(user_id: str, thread_id: str, title: str | None, summary: str) -> None:
    await db.execute(
        "UPDATE threads SET title = COALESCE(%s, title), summary = %s, updated_at = now() "
        "WHERE id = %s AND user_id = %s",
        title, summary, thread_id, user_id,
    )
    row = await db.fetchrow("SELECT title FROM threads WHERE id = %s", thread_id)
    await store.aput(("threads", user_id), thread_id,
                     {"text": f"{row['title']}: {summary}", "title": row["title"], "updated_at": _now()})


async def search_threads(user_id: str, query: str, limit: int = 4) -> list[dict]:
    items = await store.asearch(("threads", user_id), query=query, limit=limit)
    return [{"thread_id": i.key, "title": i.value.get("title"), "summary": i.value.get("text"),
             "score": round(i.score or 0, 2)} for i in items]


async def delete_thread_memory(user_id: str, thread_id: str) -> None:
    await store.adelete(("threads", user_id), thread_id)


# ---------- Context for one turn ----------

async def load_context(user_id: str, thread_id: str, query: str) -> dict:
    """Everything the agent should know before answering, fetched in parallel."""
    profile, recalled, recent, thread = await asyncio.gather(
        profiles.get(user_id),
        search_memories(user_id, query) if query.strip() else asyncio.sleep(0, []),
        recent_threads(user_id, exclude=thread_id),
        db.fetchrow("SELECT summary FROM threads WHERE id = %s", thread_id),
    )
    return {
        "profile": profile,
        "memories": [{"id": m["id"], "text": m["text"]} for m in recalled],
        "recent_threads": [{"title": t["title"], "summary": t["summary"]} for t in recent],
        "thread_summary": (thread or {}).get("summary", ""),
    }


# ---------- Reflection (runs in the background after each answer) ----------

class Reflection(BaseModel):
    facts: list[str] = Field(
        default_factory=list,
        description="New durable facts about the user, their farm, animals, preferences or plans that will "
                    "help in future chats. Short, third person, English (e.g. 'Grows basmati rice on 3 acres'). "
                    "Skip anything temporary, generic advice, or already known.")
    title: str = Field(description="3-6 word title for the whole conversation, in the user's language")
    summary: str = Field(description="2-4 sentence summary of the whole conversation so far, including "
                                     "the user's problem, key numbers and advice given")
    suggestions: list[str] = Field(
        default_factory=list,
        description="3 short follow-up questions the user might ask next, in the user's language")


def transcript(messages, limit_chars: int = 6000) -> str:
    lines = []
    for m in messages:
        if isinstance(m, HumanMessage):
            text = m.additional_kwargs.get("display_text") or (m.content if isinstance(m.content, str) else "")
            lines.append(f"User: {text}")
        elif isinstance(m, AIMessage) and isinstance(m.content, str) and m.content:
            # Visual ```ui blocks are JSON for the screen; keep the summary to the words.
            lines.append("Assistant: " + re.sub(r"```ui.*?(```|$)", "[visual]", m.content, flags=re.S))
        elif isinstance(m, ToolMessage):
            lines.append(f"[tool {m.name}: {str(m.content)[:300]}]")
    return "\n".join(lines)[-limit_chars:]


async def reflect(llm, user_id: str, thread_id: str, messages, context: dict) -> dict:
    known = "\n".join(f"- {m['text']}" for m in context.get("memories", [])) or "(none recalled)"
    prompt = (
        "You maintain the memory of an agriculture assistant.\n"
        f"User profile:\n{profiles.describe(context.get('profile'))}\n\n"
        f"Already known facts:\n{known}\n\n"
        f"Previous conversation summary: {context.get('thread_summary') or '(new conversation)'}\n\n"
        f"Latest part of the conversation:\n{transcript(messages[-8:])}"
    )
    result: Reflection = await llm.with_structured_output(Reflection).ainvoke(prompt)
    saved = [m for m in await asyncio.gather(
        *(add_memory(user_id, fact, source_thread=thread_id) for fact in result.facts[:5])) if m]
    await save_thread_summary(user_id, thread_id, result.title[:80], result.summary)
    return {"saved": saved, "title": result.title[:80], "suggestions": result.suggestions[:3]}
