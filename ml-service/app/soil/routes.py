"""Soil-profile routes. Mounted at /soil."""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request

from .engine import SoilEngine, SoilError

logger = logging.getLogger(__name__)
router = APIRouter()


def _engine(request: Request) -> SoilEngine:
    engine = getattr(request.app.state, "soil_engine", None)
    if engine is None or not engine.ready:
        raise HTTPException(503, "Soil model is not loaded")
    return engine


@router.get("/health")
def health(request: Request):
    engine: SoilEngine | None = getattr(request.app.state, "soil_engine", None)
    if engine is None or not engine.ready:
        return {"status": "unavailable"}
    return {"status": "ok", "clusters": len(engine.profiles), "scope": engine.scope}


@router.post("/predict")
async def predict(body: dict, request: Request):
    try:
        return await asyncio.to_thread(_engine(request).predict, body)
    except SoilError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Soil prediction failed")
        raise HTTPException(500, f"Prediction failed: {exc}") from exc
