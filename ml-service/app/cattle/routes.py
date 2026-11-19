"""Cattle liveweight routes. Mounted at /cattle."""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request

from .engine import CattleEngine, CattleError

logger = logging.getLogger(__name__)
router = APIRouter()


def _engine(request: Request) -> CattleEngine:
    engine = getattr(request.app.state, "cattle_engine", None)
    if engine is None or not engine.ready:
        raise HTTPException(503, "Cattle model is not loaded")
    return engine


@router.get("/health")
def health(request: Request):
    engine: CattleEngine | None = getattr(request.app.state, "cattle_engine", None)
    if engine is None or not engine.ready:
        return {"status": "unavailable"}
    return {
        "status": "ok",
        "model": "Linear Regression",
        "features": ["heart_girth", "body_length"],
        "units": "kg",
    }


@router.post("/predict")
async def predict(body: dict, request: Request):
    try:
        return await asyncio.to_thread(_engine(request).predict, body)
    except CattleError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Cattle prediction failed")
        raise HTTPException(500, f"Prediction failed: {exc}") from exc
