"""Streaming chat. Emits Server-Sent Events describing everything the agent does:

status, memory_recalled, thinking, token, tool_start, tool_end, answer_done (+timing),
then (from background reflection) memory_saved, title, suggestions, and finally done.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage
from pydantic import BaseModel

from .. import memory
from ..agent import build_user_message
from ..auth import current_user
from ..config import LLM_API_KEY
from ..llm import fast_llm

log = logging.getLogger("agriassist.chat")
router = APIRouter()
background_tasks: set[asyncio.Task] = set()
# The run currently answering in each thread, so the Stop button can cancel it.
running: dict[str, asyncio.Task] = {}


class ChatRequest(BaseModel):
    thread_id: str
    message: str = ""
    attachments: list[str] = []
    voice: bool = False
    # Off by default: skip reasoning text and tool arguments.
    # The answer, tool results and a short status still stream.
    verbose: bool = False


def sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"


def _reasoning(message) -> str:
    value = (getattr(message, "additional_kwargs", None) or {}).get("reasoning_content")
    return value if isinstance(value, str) else ""


@router.post("/chat")
async def chat(body: ChatRequest, request: Request, user_id: str = Depends(current_user)):
    if not await memory.ensure_thread(user_id, body.thread_id, body.message):
        raise HTTPException(403, "This conversation belongs to another user")
    graph = request.app.state.graph
    config = {"configurable": {"thread_id": body.thread_id, "user_id": user_id, "voice": body.voice,
                               "verbose": body.verbose},
              "recursion_limit": 30}

    async def run(emit):
        if not LLM_API_KEY:
            emit({"type": "error", "message": "LLM_API_KEY is not set in backend/.env"})
            emit({"type": "done"})
            return
        started = time.perf_counter()
        ms = lambda: round((time.perf_counter() - started) * 1000)  # noqa: E731
        timing = {}
        emit({"type": "status", "step": "context", "label": "Looking at your farm"})
        try:
            user_message = await build_user_message(user_id, body.message, body.attachments)
            async for mode, chunk in graph.astream({"messages": [user_message]}, config,
                                                   stream_mode=["messages", "updates", "custom"]):
                if mode == "custom":
                    emit({**chunk, "at_ms": ms()})
                    continue
                if mode == "messages":
                    message, meta = chunk
                    if meta.get("langgraph_node") != "agent" or not isinstance(message, AIMessage):
                        continue
                    if body.verbose and (thinking := _reasoning(message)):
                        emit({"type": "thinking", "content": thinking})
                    if isinstance(message.content, str) and message.content:
                        timing.setdefault("first_token_ms", ms())
                        emit({"type": "token", "content": message.content})
                    continue
                for node, update in chunk.items():
                    update = update or {}
                    if node == "load_context":
                        timing["context_ms"] = ms()
                        context = update.get("context") or {}
                        memories = context.get("memories", [])
                        emit({"type": "memory_recalled", "count": len(memories),
                              "recent_threads": len(context.get("recent_threads", []))})
                    for message in update.get("messages", []):
                        if node == "agent" and isinstance(message, AIMessage):
                            for call in message.tool_calls:
                                event = {"type": "tool_start", "id": call["id"], "name": call["name"], "at_ms": ms()}
                                if body.verbose:
                                    event["args"] = call["args"]
                                emit(event)
        except Exception as exc:
            log.exception("Agent run failed")
            emit({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
            emit({"type": "done"})
            return

        timing["total_ms"] = ms()
        emit({"type": "answer_done", "timing": timing})

        # Memory work happens after the answer, in the same background task.
        result = await _reflect(graph, config, user_id, body.thread_id)
        if result:
            for saved in result["saved"]:
                emit({"type": "memory_saved", "memory": saved})
            emit({"type": "title", "title": result["title"]})
            emit({"type": "suggestions", "suggestions": result["suggestions"]})
        emit({"type": "done"})

    # The agent runs in its own task and the response only relays its events. If the client goes away
    # (tab closed, phone locked, network blip) the answer and memories are still completed and saved.
    queue: asyncio.Queue = asyncio.Queue()

    async def runner():
        try:
            await run(queue.put_nowait)
        except Exception as exc:
            log.exception("Chat run crashed")
            queue.put_nowait({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
            queue.put_nowait({"type": "done"})
        finally:
            queue.put_nowait(None)

    task = asyncio.create_task(runner())
    background_tasks.add(task)
    running[body.thread_id] = task

    def finished(t: asyncio.Task):
        background_tasks.discard(t)
        if running.get(body.thread_id) is t:
            running.pop(body.thread_id)

    task.add_done_callback(finished)

    async def events():
        while (event := await queue.get()) is not None:
            yield sse(event)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/chat/{thread_id}/stop")
async def stop(thread_id: str, user_id: str = Depends(current_user)):
    """Stops the answer being generated in this thread (the Stop button)."""
    if not await memory.owns_thread(user_id, thread_id):
        raise HTTPException(404, "Conversation not found")
    task = running.get(thread_id)
    if task and not task.done():
        task.cancel()
        return {"stopped": True}
    return {"stopped": False}


async def _reflect(graph, config, user_id: str, thread_id: str):
    try:
        state = await graph.aget_state(config)
        return await memory.reflect(fast_llm(), user_id, thread_id, state.values["messages"],
                                    state.values.get("context") or {})
    except Exception:
        log.exception("Reflection failed")
        return None
