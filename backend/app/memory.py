"""Agent memory, in three tiers:

- Session memory: the thread's messages, kept by the LangGraph Postgres checkpointer.
- Short-term memory: the summary of this conversation, plus summaries of recent chats.
  New details live here first.
- Long-term memory: one summary of what has proved lasting, like a person's gist of someone
  they know. A detail is written into it only after it shows up in a second conversation,
  or the user explicitly asks to remember it. The farm profile stays the structured record.
"""
from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.store.postgres.aio import AsyncPostgresStore
from pydantic import BaseModel, Field

from . import db, profiles

DUPLICATE_SCORE = 0.82
UPDATE_SCORE = 0.74
RECALL_LIMIT = 5
RECALL_MIN_SCORE = 0.35
RECENT_THREADS = 3
MAX_CANDIDATES = 2
SUMMARY_KEY = "summary"
PROMOTE_AFTER_THREADS = 2
SUMMARY_CHAR_LIMIT = 900

log = logging.getLogger(__name__)

# Words that carry no farm-specific meaning when comparing a fact with the profile.
_STOP = {
    "a", "an", "the", "and", "or", "of", "on", "in", "at", "to", "for", "with", "from",
    "is", "are", "was", "has", "have", "had", "grows", "grow", "growing", "owns", "own",
    "user", "farmer", "farm", "their", "his", "her", "this", "that", "also", "about",
    "located", "lives", "based", "uses", "using", "keeps",
}

# One-off details. These belong in the chat summary, not in long-term memory.
_EPHEMERAL = re.compile(
    r"\b(today|tomorrow|tonight|yesterday|this week|next week|right now|currently|"
    r"weather|forecast|rain(?:ing|fall)?|temperature|mandi|market price|price|priced|"
    r"rupee|quintal|grad-?cam|biomass|quadrat|prediction|diagnos(?:is|ed)|"
    r"advised|recommended|should spray|spray today|this morning|this season's quote)\b",
    re.I,
)
# A fact can mention "today" and still be durable if it states a standing practice.
_DURABLE = re.compile(
    r"\b(always|never|prefers|prefer|every year|each year|each season|every season|"
    r"breed|allergic|allergy|cannot|can't|does not|doesn't)\b",
    re.I,
)

store: AsyncPostgresStore | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _item(item) -> dict:
    return {"id": item.key, **item.value, "score": getattr(item, "score", None)}


# ---------- What is allowed into long-term memory ----------

def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _significant(text: str) -> set[str]:
    return {token for token in _tokens(text) if token not in _STOP and len(token) > 1}


def _numbers(text: str) -> set[str]:
    return set(re.findall(r"\d+(?:\.\d+)?", text))


def _singular(token: str) -> str:
    return token[:-1] if token.endswith("s") and len(token) > 3 else token


def is_ephemeral(text: str) -> bool:
    """True when a sentence is about this conversation, not a lasting fact."""
    return bool(_EPHEMERAL.search(text)) and not _DURABLE.search(text)


def covered_by_profile(text: str, profile_text: str) -> bool:
    """True when the fact only repeats fields already on the farm profile."""
    significant = _significant(text)
    if not significant or not profile_text:
        return False
    profile = _tokens(profile_text)
    profile |= {_singular(token) for token in profile}
    return all(_singular(token) in profile for token in significant)


def _overlap(left: str, right: str) -> float:
    a, b = _significant(left), _significant(right)
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def _cap_summary(text: str) -> str:
    text = " ".join(text.split())
    if len(text) <= SUMMARY_CHAR_LIMIT:
        return text
    cut = text[:SUMMARY_CHAR_LIMIT].rsplit(". ", 1)[0]
    return (cut or text[:SUMMARY_CHAR_LIMIT]).rstrip(" ,;") + "."


def _clean_note(text: str) -> str:
    return " ".join((text or "").split())


# ---------- Long-term summary and unproven notes ----------

async def get_summary(user_id: str) -> dict | None:
    item = await store.aget(("memories", user_id), SUMMARY_KEY)
    if item is None or not (item.value.get("text") or "").strip():
        return None
    return _item(item)


async def save_summary(user_id: str, text: str) -> dict | None:
    text = _cap_summary(text)
    if not text:
        await store.adelete(("memories", user_id), SUMMARY_KEY)
        return None
    value = {"text": text, "category": "summary", "updated_at": _now(), "created_at": _now()}
    await store.aput(("memories", user_id), SUMMARY_KEY, value)
    return {"id": SUMMARY_KEY, **value}


async def list_memories(user_id: str) -> list[dict]:
    """The long-term summary, if one has been earned. Older scattered facts are not listed."""
    summary = await get_summary(user_id)
    return [summary] if summary else []


async def list_candidates(user_id: str) -> list[dict]:
    items = await store.asearch(("candidates", user_id), limit=100)
    rows = []
    for item in items:
        value = item.value or {}
        threads = value.get("threads") or []
        rows.append({
            "id": item.key,
            "text": value.get("text") or "",
            "seen": len(threads),
            "created_at": value.get("created_at"),
        })
    return sorted(rows, key=lambda row: row.get("created_at") or "", reverse=True)


async def delete_candidate(user_id: str, key: str) -> None:
    await store.adelete(("candidates", user_id), key)


def _same_memory(score: float | None, left: str, right: str) -> bool:
    score = score or 0
    return score >= DUPLICATE_SCORE or (score >= UPDATE_SCORE and _overlap(left, right) >= 0.5)


async def _rewrite_summary(llm, profile_text: str, current: str, additions: list[str]) -> str:
    added = "\n".join(f"- {line}" for line in additions if line.strip()) or "(none)"
    prompt = (
        "Rewrite this person's long-term memory as one short summary, the way you would remember a farmer you know.\n"
        "At most 120 words, plain sentences, no bullet list and no headings.\n"
        "Keep only standing truths that will still matter months from now.\n"
        "Drop weather, prices, one-off problems, advice, model results, and anything already in the profile.\n"
        "If the new notes change an older detail, keep the newer detail only.\n"
        "If nothing lasting remains, return an empty summary.\n\n"
        f"Profile, already stored, do not repeat it:\n{profile_text}\n\n"
        f"Current long-term summary:\n{current or '(empty)'}\n\n"
        f"Notes that have proved worth keeping:\n{added}"
    )

    class Rewrite(BaseModel):
        summary: str = Field(description="The revised long-term summary, or an empty string")

    result = await llm.with_structured_output(Rewrite).ainvoke(prompt)
    return _cap_summary(result.summary)


async def promote(llm, user_id: str, text: str, profile_text: str = "") -> dict | None:
    """Fold one proved note into the single long-term summary."""
    text = _clean_note(text)
    if not text or is_ephemeral(text) or covered_by_profile(text, profile_text):
        return None
    current = await get_summary(user_id)
    current_text = current["text"] if current else ""
    if current_text and covered_by_profile(text, current_text):
        return current
    try:
        revised = await _rewrite_summary(llm, profile_text, current_text, [text])
    except Exception:
        log.exception("Could not rewrite long-term summary")
        revised = _cap_summary(f"{current_text} {text}".strip())
    if not revised:
        return current
    return await save_summary(user_id, revised)


async def _legacy_notes(user_id: str) -> list:
    items = await store.asearch(("memories", user_id), limit=500)
    return [item for item in items if item.key != SUMMARY_KEY and (item.value or {}).get("text")]


async def fold_legacy(llm, user_id: str, profile_text: str) -> None:
    """Turn an old pile of facts into one summary, then remove the pile."""
    notes = await _legacy_notes(user_id)
    if not notes:
        return
    texts = [item.value.get("text") for item in notes]
    current = await get_summary(user_id)
    try:
        revised = await _rewrite_summary(llm, profile_text, current["text"] if current else "", texts)
    except Exception:
        log.exception("Could not fold old memories")
        return
    await save_summary(user_id, revised)
    await asyncio.gather(*(store.adelete(("memories", user_id), item.key) for item in notes))


async def observe(llm, user_id: str, text: str, thread_id: str | None, profile_text: str = "") -> dict:
    """Hold a possible lasting note until a later conversation confirms it."""
    text = _clean_note(text)
    if not text or len(text) < 12:
        return {"status": "empty", "memory": None}
    if is_ephemeral(text):
        return {"status": "ephemeral", "memory": None}
    if covered_by_profile(text, profile_text):
        return {"status": "profile", "memory": None}
    current = await get_summary(user_id)
    if current and covered_by_profile(text, current["text"]):
        return {"status": "known", "memory": None}

    hits = await store.asearch(("candidates", user_id), query=text, limit=3)
    match = next((hit for hit in hits if _same_memory(hit.score, text, hit.value.get("text") or "")), None)
    if match is None:
        key = uuid.uuid4().hex
        threads = [thread_id] if thread_id else []
        await store.aput(("candidates", user_id), key, {
            "text": text, "threads": threads, "created_at": _now(), "updated_at": _now(),
        })
        return {"status": "waiting", "memory": None}

    threads = list(dict.fromkeys([*(match.value.get("threads") or []), *([thread_id] if thread_id else [])]))
    await store.aput(("candidates", user_id), match.key, {
        **match.value, "text": text, "threads": threads, "updated_at": _now(),
    })
    if len(threads) < PROMOTE_AFTER_THREADS:
        return {"status": "waiting", "memory": None}
    saved = await promote(llm, user_id, text, profile_text)
    await store.adelete(("candidates", user_id), match.key)
    return {"status": "promoted", "memory": {"id": SUMMARY_KEY, "text": text} if saved else None}


async def remember_explicitly(llm, user_id: str, text: str, thread_id: str | None, profile_text: str = "") -> dict:
    """The user asked to keep this, which is enough proof for the long-term summary."""
    text = _clean_note(text)
    if not text:
        return {"status": "empty", "memory": None, "note": "Nothing to remember"}
    if is_ephemeral(text):
        return {"status": "ephemeral", "memory": None, "note": "Kept in this chat only"}
    if covered_by_profile(text, profile_text):
        return {"status": "profile", "memory": None, "note": "Already in the farm profile"}
    current = await get_summary(user_id)
    if current and covered_by_profile(text, current["text"]):
        return {"status": "known", "memory": current, "note": "Already in long-term memory"}
    saved = await promote(llm, user_id, text, profile_text)
    hits = await store.asearch(("candidates", user_id), query=text, limit=3)
    for hit in hits:
        if _same_memory(hit.score, text, hit.value.get("text") or ""):
            await store.adelete(("candidates", user_id), hit.key)
    if saved is None:
        return {"status": "ephemeral", "memory": None, "note": "Kept in this chat only"}
    return {"status": "promoted", "memory": {"id": SUMMARY_KEY, "text": text}, "note": None}


async def search_memories(user_id: str, query: str, limit: int = RECALL_LIMIT) -> list[dict]:
    summary = await get_summary(user_id)
    return [summary] if summary else []


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
    memories = await store.asearch(("memories", user_id), limit=500)
    candidates = await store.asearch(("candidates", user_id), limit=200)
    await asyncio.gather(
        *(store.adelete(("memories", user_id), item.key) for item in memories),
        *(store.adelete(("candidates", user_id), item.key) for item in candidates),
    )
    return len(memories) + len(candidates)


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
    profile, summary, recent, thread = await asyncio.gather(
        profiles.get(user_id),
        get_summary(user_id),
        recent_threads(user_id, exclude=thread_id),
        db.fetchrow("SELECT summary FROM threads WHERE id = %s", thread_id),
    )
    return {
        "profile": profile,
        "memories": [{"id": "summary", "text": summary["text"]}] if summary else [],
        "recent_threads": [{"title": t["title"], "summary": t["summary"]} for t in recent],
        "thread_summary": (thread or {}).get("summary", ""),
    }


# ---------- Reflection (runs in the background after each answer) ----------

class Reflection(BaseModel):
    candidates: list[str] = Field(
        default_factory=list,
        description="Possible lasting notes. Usually empty. These are NOT written into long-term memory yet. "
                    "Include one only if it could still matter months later and is not already in the profile "
                    "or the long-term summary. Never include weather, prices, today's problem, model results, "
                    "or advice. One short third-person English sentence, or an empty list.")
    title: str = Field(description="3-6 word title for the whole conversation, in the user's language")
    summary: str = Field(description="2-4 sentence summary of THIS conversation: the problem, numbers, "
                                     "prices, weather and advice. This is short-term memory.")
    suggestions: list[str] = Field(
        default_factory=list,
        description="3 short follow-up questions the user might ask next, in the user's language")


def transcript(messages, limit_chars: int = 6000) -> str:
    lines = []
    for m in messages:
        if isinstance(m, HumanMessage):
            text = m.additional_kwargs.get("display_text") or (m.content if isinstance(m.content, str) else "")
            lines.append(f"User: {text}")
        elif isinstance(m, AIMessage):
            from .llm import extract_text
            content_str = extract_text(m.content)
            if content_str:
                # Visual ```ui blocks are JSON for the screen; keep the summary to the words.
                lines.append("Assistant: " + re.sub(
                    r"```(?:ui|json|jsonc|javascript)?[\s\S]*?(```|$)",
                    lambda match: "[visual]" if '"type"' in match.group(0) else match.group(0),
                    content_str,
                ))
        elif isinstance(m, ToolMessage):
            lines.append(f"[tool {m.name} ran; its output stays in this chat, do not store it as a fact]")
    return "\n".join(lines)[-limit_chars:]


async def reflect(llm, user_id: str, thread_id: str, messages, context: dict) -> dict:
    profile = context.get("profile") or await profiles.get(user_id)
    profile_text = profiles.describe(profile)
    try:
        await fold_legacy(llm, user_id, profile_text)
    except Exception:
        log.exception("Could not fold old memories into a summary")
    summary = await get_summary(user_id)
    prompt = (
        "File this conversation. Long-term memory is one summary and is not updated from a single chat.\n"
        "Put the problem, numbers, weather, prices and advice in the conversation summary.\n"
        "candidates must be empty unless the user revealed a standing truth that is missing from the profile "
        "and the long-term summary. A candidate is only a note for later. Do not restate what is already known.\n\n"
        f"Farm profile:\n{profile_text}\n\n"
        f"Long-term summary:\n{(summary or {}).get('text') or '(none yet)'}\n\n"
        f"Summary of this conversation so far:\n{context.get('thread_summary') or '(new conversation)'}\n\n"
        f"Latest messages:\n{transcript(messages[-8:])}"
    )
    result: Reflection = await llm.with_structured_output(Reflection).ainvoke(prompt)
    decisions = await asyncio.gather(*(
        observe(llm, user_id, note, thread_id, profile_text) for note in result.candidates[:MAX_CANDIDATES]
    ))
    saved = [decision["memory"] for decision in decisions if decision["status"] == "promoted" and decision.get("memory")]
    await save_thread_summary(user_id, thread_id, result.title[:80], result.summary)
    return {"saved": saved, "title": result.title[:80], "suggestions": result.suggestions[:3]}
