from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import runs
from ..auth import current_user
from ..config import MODEL_URLS
from ..model_client import ModelError, run_model
from ..registry import MODELS, MODELS_BY_ID

router = APIRouter()


@router.get("/models")
async def list_models(user_id: str = Depends(current_user)):
    return [{**m, "status": "connected" if MODEL_URLS[m["id"]] else "mock"} for m in MODELS]


class PredictRequest(BaseModel):
    inputs: dict


@router.post("/models/{model_id}/predict")
async def predict(model_id: str, body: PredictRequest, user_id: str = Depends(current_user)):
    if model_id not in MODELS_BY_ID:
        raise HTTPException(404, "Unknown model")
    try:
        result = await run_model(user_id, model_id, body.inputs)
    except ModelError as exc:
        raise HTTPException(502, str(exc))
    image_id = body.inputs.get("image") or body.inputs.get("file_id")
    inputs = {key: value for key, value in body.inputs.items() if key not in {"image", "file_id"}}
    saved = await runs.save_run(user_id, model_id, result, inputs=inputs, image_id=image_id)
    if saved:
        result = {**result, "run_id": saved["id"]}
    return result
