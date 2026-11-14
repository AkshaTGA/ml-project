"""Profile, onboarding, and the user-facing memory manager."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import db, memory, profiles
from ..auth import current_user

router = APIRouter()


@router.get("/profile")
async def get_profile(user_id: str = Depends(current_user)):
    profile = await profiles.get(user_id)
    return {"profile": profile, "onboarded": bool(profile and profile.get("onboarded_at"))}


@router.put("/profile")
async def update_profile(fields: dict[str, Any], user_id: str = Depends(current_user)):
    return await profiles.upsert(user_id, fields)


@router.post("/onboarding")
async def onboarding(fields: dict[str, Any], user_id: str = Depends(current_user)):
    profile = await profiles.upsert(user_id, fields, onboarded=True)
    if goals := (fields.get("goals") or "").strip():
        await memory.add_memory(user_id, f"Goals and challenges shared at signup: {goals}", category="onboarding")
    return profile


# ---------- Memory manager ----------

@router.get("/memory")
async def get_memory(user_id: str = Depends(current_user)):
    profile = await profiles.get(user_id)
    facts = await memory.list_memories(user_id)
    threads = await db.fetch(
        "SELECT id, title, summary, updated_at FROM threads WHERE user_id = %s AND summary <> '' "
        "ORDER BY updated_at DESC LIMIT 50", user_id)
    return {"profile": profile, "facts": facts, "threads": threads}


class MemoryEdit(BaseModel):
    text: Any


Kind = Literal["fact", "thread", "profile"]


@router.patch("/memory/{kind}/{item_id}")
async def edit_memory(kind: Kind, item_id: str, body: MemoryEdit, user_id: str = Depends(current_user)):
    if kind == "fact":
        updated = await memory.update_memory(user_id, item_id, str(body.text))
        if updated is None:
            raise HTTPException(404, "Memory not found")
        return updated
    if kind == "thread":
        if not await memory.owns_thread(user_id, item_id):
            raise HTTPException(404, "Conversation not found")
        await memory.save_thread_summary(user_id, item_id, None, str(body.text))
        return {"id": item_id, "summary": body.text}
    if item_id not in profiles.EDITABLE:
        raise HTTPException(400, "Field cannot be edited")
    return await profiles.upsert(user_id, {item_id: body.text})


@router.delete("/memory/{kind}/{item_id}")
async def forget(kind: Kind, item_id: str, user_id: str = Depends(current_user)):
    if kind == "fact":
        await memory.delete_memory(user_id, item_id)
    elif kind == "thread":
        if not await memory.owns_thread(user_id, item_id):
            raise HTTPException(404, "Conversation not found")
        await db.execute("UPDATE threads SET summary = '' WHERE id = %s", item_id)
        await memory.delete_thread_memory(user_id, item_id)
    else:
        if item_id not in profiles.EDITABLE:
            raise HTTPException(400, "Field cannot be removed")
        empty = [] if item_id == "crops" else {} if item_id in ("livestock", "voice_settings") else None
        await profiles.upsert(user_id, {item_id: empty})
    return {"deleted": item_id}


@router.delete("/memory")
async def clear_all(user_id: str = Depends(current_user)):
    """Forgets learned facts and conversation summaries. The farm profile and chats are kept."""
    count = await memory.clear_memories(user_id)
    threads = await db.fetch("SELECT id FROM threads WHERE user_id = %s AND summary <> ''", user_id)
    await db.execute("UPDATE threads SET summary = '' WHERE user_id = %s", user_id)
    for thread in threads:
        await memory.delete_thread_memory(user_id, thread["id"])
    return {"facts_deleted": count, "summaries_cleared": len(threads)}
