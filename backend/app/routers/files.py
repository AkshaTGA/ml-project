from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .. import files
from ..auth import current_user
from ..config import MAX_UPLOAD_MB

router = APIRouter()


@router.post("/upload")
async def upload(uploads: list[UploadFile] = File(...), user_id: str = Depends(current_user)):
    saved = []
    for upload in uploads:
        content = await upload.read()
        if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(413, f"{upload.filename} is larger than {MAX_UPLOAD_MB} MB")
        saved.append(await files.save_upload(user_id, upload.filename or "file", content, upload.content_type))
    return saved


@router.get("/files/{file_id}")
async def get_file(file_id: str, user_id: str = Depends(current_user)):
    meta = await files.get_meta(user_id, file_id)
    if meta is None:
        raise HTTPException(404, "File not found")
    return FileResponse(files.path_of(meta), media_type=meta["content_type"], filename=meta["name"],
                        headers={"Cache-Control": "private, max-age=86400"})
