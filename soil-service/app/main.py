"""Soil-profile API. One model: assign a test to one of four descriptive clusters."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from .engine import SoilEngine, SoilError

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def _engine() -> SoilEngine:
    engine = getattr(app.state, "engine", None)
    if engine is None or not engine.ready:
        raise HTTPException(503, "Soil model is not loaded")
    return engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = SoilEngine()
    await asyncio.to_thread(engine.load)
    app.state.engine = engine
    logger.info("Soil service ready (%s clusters)", len(engine.profiles))
    yield


app = FastAPI(
    title="AgriAssist soil profile",
    version="1.0.0",
    summary="Groups a soil test with similar Bareilly samples.",
    lifespan=lifespan,
)


@app.get("/health")
def health():
    engine: SoilEngine | None = getattr(app.state, "engine", None)
    if engine is None or not engine.ready:
        return {"status": "loading"}
    return {"status": "ok", "clusters": len(engine.profiles), "scope": engine.scope}


@app.post("/predict")
async def predict(body: dict):
    try:
        return await asyncio.to_thread(_engine().predict, body)
    except SoilError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Soil prediction failed")
        raise HTTPException(500, f"Prediction failed: {exc}") from exc
