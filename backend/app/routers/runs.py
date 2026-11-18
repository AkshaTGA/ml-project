from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import runs
from ..auth import current_user

router = APIRouter()


@router.get("/runs")
async def list_runs(tool: str | None = None, user_id: str = Depends(current_user)):
    return await runs.list_runs(user_id, tool)


@router.delete("/runs")
async def delete_runs(tool: str, user_id: str = Depends(current_user)):
    if runs.MODEL_OF.get(tool) is None:
        raise HTTPException(404, "Unknown tool")
    return {"deleted": await runs.delete_tool_runs(user_id, tool)}


@router.get("/runs/{run_id}")
async def get_run(run_id: str, user_id: str = Depends(current_user)):
    row = await runs.get_run(user_id, run_id)
    if row is None:
        raise HTTPException(404, "Check not found")
    return row


@router.delete("/runs/{run_id}")
async def delete_run(run_id: str, user_id: str = Depends(current_user)):
    if not await runs.delete_run(user_id, run_id):
        raise HTTPException(404, "Check not found")
    return {"deleted": 1}
