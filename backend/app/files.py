"""Uploaded files: bytes on disk, metadata in Postgres scoped to the owner."""
from __future__ import annotations

import asyncio
import base64
import io
import mimetypes
import uuid
from pathlib import Path

from PIL import Image

from . import db
from .config import UPLOAD_DIR

TEXT_EXTENSIONS = {".txt", ".csv", ".md", ".json", ".tsv"}
MAX_TEXT_CHARS = 12000
PUBLIC_FIELDS = ("id", "name", "content_type", "kind", "size")


async def save_upload(user_id: str, filename: str, content: bytes, content_type: str | None) -> dict:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_id = uuid.uuid4().hex[:16]
    suffix = Path(filename).suffix.lower()[:10]
    path = f"{file_id}{suffix}"
    await asyncio.to_thread((UPLOAD_DIR / path).write_bytes, content)
    content_type = content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    kind = "image" if content_type.startswith("image/") else "document"
    await db.execute(
        "INSERT INTO files (id, user_id, name, content_type, kind, size, path) VALUES (%s,%s,%s,%s,%s,%s,%s)",
        file_id, user_id, filename, content_type, kind, len(content), path,
    )
    return {"id": file_id, "name": filename, "content_type": content_type, "kind": kind, "size": len(content)}


def public(meta: dict) -> dict:
    return {k: meta[k] for k in PUBLIC_FIELDS}


async def get_meta(user_id: str, file_id: str) -> dict | None:
    return await db.fetchrow("SELECT * FROM files WHERE id = %s AND user_id = %s", file_id, user_id)


async def get_many(user_id: str, file_ids: list[str]) -> list[dict]:
    if not file_ids:
        return []
    rows = await db.fetch("SELECT * FROM files WHERE user_id = %s AND id = ANY(%s)", user_id, file_ids)
    order = {fid: i for i, fid in enumerate(file_ids)}
    return sorted(rows, key=lambda r: order[r["id"]])


def path_of(meta: dict) -> Path:
    return UPLOAD_DIR / meta["path"]


def _image_data_url(path: Path, max_side: int) -> str:
    with Image.open(path) as img:
        img = img.convert("RGB")
        img.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


async def image_data_url(meta: dict, max_side: int = 1024) -> str:
    """Downscaled JPEG data URL, small enough to send to the vision LLM."""
    return await asyncio.to_thread(_image_data_url, path_of(meta), max_side)


def _extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        from pypdf import PdfReader

        text = "\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
    elif suffix in TEXT_EXTENSIONS:
        text = path.read_text(errors="replace")
    else:
        return "(binary file, contents not readable)"
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS] + f"\n... [truncated, {len(text)} chars total]"
    return text


async def extract_text(meta: dict) -> str:
    return await asyncio.to_thread(_extract_text, path_of(meta))
