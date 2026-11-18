"""District crop-yield API. One model: rice, wheat and maize."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .engine import YieldEngine, YieldError

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


class PredictRequest(BaseModel):
    state: str
    district: str
    crop: str
    season: str
    year: int = Field(ge=1900, le=2100)


def _engine() -> YieldEngine:
    engine = getattr(app.state, "engine", None)
    if engine is None or not engine.ready:
        raise HTTPException(503, "Yield model is not loaded")
    return engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = YieldEngine()
    await asyncio.to_thread(engine.load)
    app.state.engine = engine
    logger.info(
        "Yield service ready (%s–%s, %s states)",
        engine.year_min, engine.year_max, len(engine.catalog()["states"]),
    )
    yield


app = FastAPI(
    title="AgriAssist crop yield",
    version="1.0.0",
    summary="District yield for rice, wheat and maize from earlier recorded harvests.",
    lifespan=lifespan,
)


@app.get("/health")
def health():
    engine: YieldEngine | None = getattr(app.state, "engine", None)
    if engine is None or not engine.ready:
        return {"status": "loading"}
    catalog = engine.catalog()
    return {
        "status": "ok",
        "crops": [item["value"] for item in catalog["crops"]],
        "year_min": catalog["year_min"],
        "year_max": catalog["year_max"],
        "states": len(catalog["states"]),
    }


@app.get("/catalog")
def catalog():
    return _engine().catalog()


@app.post("/predict")
async def predict(body: PredictRequest):
    try:
        return await asyncio.to_thread(
            _engine().predict, body.state, body.district, body.crop, body.season, body.year,
        )
    except YieldError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Yield prediction failed")
        raise HTTPException(500, f"Prediction failed: {exc}") from exc
