"""District crop-yield routes. Mounted at /yield."""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .engine import YieldEngine, YieldError

logger = logging.getLogger(__name__)
router = APIRouter()


class PredictRequest(BaseModel):
    state: str
    district: str
    crop: str
    season: str
    year: int = Field(ge=1900, le=2100)


def _engine(request: Request) -> YieldEngine:
    engine = getattr(request.app.state, "yield_engine", None)
    if engine is None or not engine.ready:
        raise HTTPException(503, "Yield model is not loaded")
    return engine


@router.get("/health")
def health(request: Request):
    engine: YieldEngine | None = getattr(request.app.state, "yield_engine", None)
    if engine is None or not engine.ready:
        return {"status": "unavailable"}
    catalog = engine.catalog()
    return {
        "status": "ok",
        "crops": [item["value"] for item in catalog["crops"]],
        "year_min": catalog["year_min"],
        "year_max": catalog["year_max"],
        "states": len(catalog["states"]),
    }


@router.get("/catalog")
def catalog(request: Request):
    return _engine(request).catalog()


@router.post("/predict")
async def predict(body: PredictRequest, request: Request):
    try:
        return await asyncio.to_thread(
            _engine(request).predict, body.state, body.district, body.crop, body.season, body.year,
        )
    except YieldError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Yield prediction failed")
        raise HTTPException(500, f"Prediction failed: {exc}") from exc
