"""Postgres: one connection pool shared by the LangGraph checkpointer, the memory store and our tables."""
from __future__ import annotations

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import DATABASE_URL

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY,
    name TEXT,
    language TEXT DEFAULT 'en-IN',
    role TEXT,
    location_name TEXT,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    land_area DOUBLE PRECISION,
    land_unit TEXT DEFAULT 'acre',
    crops TEXT[] DEFAULT '{}',
    livestock JSONB DEFAULT '{}',
    irrigation TEXT,
    soil TEXT,
    goals TEXT,
    custom_instructions TEXT DEFAULT '',
    voice_settings JSONB DEFAULT '{}',
    onboarded_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT DEFAULT 'New chat',
    summary TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS threads_user_updated ON threads (user_id, updated_at DESC);
ALTER TABLE threads ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS branched_at_turn INTEGER;
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER NOT NULL,
    path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS files_user ON files (user_id);
"""

pool: AsyncConnectionPool | None = None


async def open_pool() -> AsyncConnectionPool:
    global pool
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set in backend/.env")
    pool = AsyncConnectionPool(
        DATABASE_URL, min_size=1, max_size=10, open=False,
        kwargs={"autocommit": True, "prepare_threshold": None, "row_factory": dict_row},
    )
    await pool.open()
    async with pool.connection() as conn:
        for statement in filter(str.strip, SCHEMA.split(";")):
            await conn.execute(statement)
    return pool


async def close_pool():
    if pool is not None:
        await pool.close()


async def fetch(query: str, *params) -> list[dict]:
    async with pool.connection() as conn:
        cur = await conn.execute(query, params)
        return await cur.fetchall() if cur.description else []


async def fetchrow(query: str, *params) -> dict | None:
    rows = await fetch(query, *params)
    return rows[0] if rows else None


async def execute(query: str, *params) -> None:
    async with pool.connection() as conn:
        await conn.execute(query, params)
