from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres.aio import AsyncPostgresStore

from . import db, memory
from .agent import build_graph
from .clients import http
from .config import (
    ACTIVE_LLM_MODEL,
    ACTIVE_PROVIDER,
    CLERK_PUBLISHABLE_KEY,
    CORS_ORIGINS,
    DATA_DIR,
    EMBEDDING_DIMS,
    IS_LLM_CONFIGURED,
    LLM_API_KEY,
    LLM_MODEL,
    MODEL_URLS,
    SARVAM_API_KEY,
)
from .embeddings import LocalEmbeddings
from .routers import chat, dashboard, files, models, profile, threads, voice

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    embeddings, pool = await asyncio.gather(asyncio.to_thread(LocalEmbeddings), db.open_pool())
    checkpointer = AsyncPostgresSaver(pool)
    store = AsyncPostgresStore(pool, index={"dims": EMBEDDING_DIMS, "embed": embeddings, "fields": ["text"]})
    await checkpointer.setup()
    await store.setup()
    memory.store = store
    app.state.graph = build_graph(checkpointer, store, llm=getattr(app.state, "test_llm", None))
    yield
    await asyncio.gather(*chat.background_tasks, return_exceptions=True)
    await http.aclose()
    await db.close_pool()


app = FastAPI(title="AgriAssist API", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

for module in (chat, threads, files, models, profile, voice, dashboard):
    app.include_router(module.router, prefix="/api")


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "provider": ACTIVE_PROVIDER,
        "llm_model": ACTIVE_LLM_MODEL,
        "llm_configured": IS_LLM_CONFIGURED,
        "auth_configured": bool(CLERK_PUBLISHABLE_KEY),
        "voice_configured": bool(SARVAM_API_KEY),
        "models": {model_id: "connected" if url else "mock" for model_id, url in MODEL_URLS.items()},
    }
