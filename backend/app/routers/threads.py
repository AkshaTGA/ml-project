from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from langchain_core.messages import AIMessage, HumanMessage, RemoveMessage, ToolMessage
from langgraph.graph.message import REMOVE_ALL_MESSAGES
from pydantic import BaseModel, Field

from .. import db, files, memory
from ..auth import current_user
from ..llm import extract_text

router = APIRouter()


@router.get("/threads")
async def list_threads(user_id: str = Depends(current_user)):
    return await db.fetch(
        "SELECT id, title, summary, parent_id, created_at, updated_at FROM threads WHERE user_id = %s "
        "ORDER BY updated_at DESC LIMIT 200", user_id)


async def _owned(user_id: str, thread_id: str):
    if not await memory.owns_thread(user_id, thread_id):
        raise HTTPException(404, "Conversation not found")


@router.get("/threads/{thread_id}/messages")
async def thread_messages(thread_id: str, request: Request, user_id: str = Depends(current_user)):
    """Conversation history in the same shape the frontend renders."""
    await _owned(user_id, thread_id)
    state = await request.app.state.graph.aget_state({"configurable": {"thread_id": thread_id}})
    result, current = [], None
    for message in state.values.get("messages", []) if state else []:
        if isinstance(message, HumanMessage):
            attachments = await files.get_many(user_id, message.additional_kwargs.get("attachments", []))
            result.append({"id": message.id, "role": "user",
                           "content": message.additional_kwargs.get("display_text", ""),
                           "attachments": [files.public(m) for m in attachments],
                           "context": message.additional_kwargs.get("context") or []})
            current = None
            continue
        if current is None:
            current = {"id": None, "role": "assistant", "content": "", "steps": []}
            result.append(current)
        if isinstance(message, AIMessage):
            current["id"] = message.id
            text = extract_text(message.content)
            if message.tool_calls:
                if text:
                    current["steps"].append({"type": "note", "content": text})
                for call in message.tool_calls:
                    current["steps"].append({"type": "tool", "id": call["id"], "name": call["name"],
                                             "args": call["args"], "output": None})
            else:
                current["content"] += text
        elif isinstance(message, ToolMessage):
            for step in current["steps"]:
                if step.get("id") == message.tool_call_id:
                    step["output"] = message.content
    return result


class Rename(BaseModel):
    title: str


@router.patch("/threads/{thread_id}")
async def rename_thread(thread_id: str, body: Rename, user_id: str = Depends(current_user)):
    await _owned(user_id, thread_id)
    await db.execute("UPDATE threads SET title = %s WHERE id = %s", body.title[:80], thread_id)
    return {"id": thread_id, "title": body.title[:80]}


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, request: Request, user_id: str = Depends(current_user)):
    await _owned(user_id, thread_id)
    await request.app.state.graph.checkpointer.adelete_thread(thread_id)
    await memory.delete_thread_memory(user_id, thread_id)
    await db.execute("DELETE FROM threads WHERE id = %s", thread_id)
    return {"deleted": thread_id}


# ---------- Rewind & branch ----------
# A "turn" is one user message plus everything the agent did to answer it.

class TurnRequest(BaseModel):
    keep_turns: int = Field(ge=0, description="How many turns from the start of the chat to keep")


def _config(thread_id: str, checkpoint_id: str | None = None) -> dict:
    configurable = {"thread_id": thread_id}
    if checkpoint_id:
        configurable["checkpoint_id"] = checkpoint_id
    return {"configurable": configurable}


def _cut(messages: list, keep_turns: int) -> int:
    """Index of the first message after the first `keep_turns` turns."""
    starts = [i for i, m in enumerate(messages) if isinstance(m, HumanMessage)]
    return starts[keep_turns] if keep_turns < len(starts) else len(messages)


@router.post("/threads/{thread_id}/rewind")
async def rewind_thread(thread_id: str, body: TurnRequest, request: Request, user_id: str = Depends(current_user)):
    """Drops every turn after the first `keep_turns`. Returns what is needed to undo it."""
    await _owned(user_id, thread_id)
    graph = request.app.state.graph
    state = await graph.aget_state(_config(thread_id))
    messages = state.values.get("messages", []) if state else []
    removed = messages[_cut(messages, body.keep_turns):]
    if not removed:
        return {"removed": 0, "checkpoint_id": None, "summary": None}
    thread = await db.fetchrow("SELECT summary FROM threads WHERE id = %s", thread_id)
    # Cutting at a user message means the remaining history always ends with a complete answer.
    await graph.aupdate_state(_config(thread_id), {"messages": [RemoveMessage(id=m.id) for m in removed]},
                              as_node="agent")
    # The old summary describes turns that no longer exist; reflection rebuilds it after the next answer.
    await db.execute("UPDATE threads SET summary = '', updated_at = now() WHERE id = %s", thread_id)
    await memory.delete_thread_memory(user_id, thread_id)
    return {"removed": sum(isinstance(m, HumanMessage) for m in removed),
            "checkpoint_id": state.config["configurable"]["checkpoint_id"], "summary": thread["summary"]}


class RestoreRequest(BaseModel):
    checkpoint_id: str
    summary: str = ""


@router.post("/threads/{thread_id}/restore")
async def restore_thread(thread_id: str, body: RestoreRequest, request: Request, user_id: str = Depends(current_user)):
    """Undo a rewind: put the conversation back exactly as it was at `checkpoint_id`."""
    await _owned(user_id, thread_id)
    graph = request.app.state.graph
    old = await graph.aget_state(_config(thread_id, body.checkpoint_id))
    if not old or not old.values.get("messages"):
        raise HTTPException(404, "That version of the conversation no longer exists")
    await graph.aupdate_state(_config(thread_id),
                              {"messages": [RemoveMessage(id=REMOVE_ALL_MESSAGES), *old.values["messages"]]},
                              as_node="agent")
    if body.summary:
        await memory.save_thread_summary(user_id, thread_id, None, body.summary)
    return {"restored": True}


@router.post("/threads/{thread_id}/branch")
async def branch_thread(thread_id: str, body: TurnRequest, request: Request, user_id: str = Depends(current_user)):
    """Starts a new conversation containing the first `keep_turns` turns of this one."""
    await _owned(user_id, thread_id)
    graph = request.app.state.graph
    state = await graph.aget_state(_config(thread_id))
    messages = state.values.get("messages", []) if state else []
    kept = messages[:_cut(messages, body.keep_turns)]
    if not kept:
        raise HTTPException(400, "Nothing to branch from")
    parent = await db.fetchrow("SELECT title FROM threads WHERE id = %s", thread_id)
    new_id = str(uuid.uuid4())
    title = f"↳ {parent['title']}"[:80]
    await db.execute(
        "INSERT INTO threads (id, user_id, title, parent_id, branched_at_turn) VALUES (%s, %s, %s, %s, %s)",
        new_id, user_id, title, thread_id, body.keep_turns)
    await graph.aupdate_state(_config(new_id), {"messages": kept, "context": {}}, as_node="agent")
    return {"id": new_id, "title": title, "parent_id": thread_id}
