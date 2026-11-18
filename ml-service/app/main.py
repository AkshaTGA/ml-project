"""HTTP API: one router per biomass model, all sharing the ResNet backbone."""

from __future__ import annotations

import asyncio
import base64
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from . import config
from .engine import BiomassEngine, InferenceError, open_image
from .targets import TARGETS, UNITS, Target

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


class GreenFeatures(BaseModel):
    exg_mean: float
    exg_std: float
    exg_top10: float
    gndvi_mean: float


class BackboneInfo(BaseModel):
    architecture: str
    embedding_dim: int
    source: str
    path: str | None = None
    warning: str | None = None


class GradCam(BaseModel):
    method: str
    layer: str
    score: str
    summary: str
    content_type: str
    image_base64: str


class Prediction(BaseModel):
    target: str
    target_slug: str
    label: str
    prediction: float
    units: str
    green_features: GreenFeatures
    embedding_dim: int
    feature_dim: int
    image_size: list[int]
    backbone: BackboneInfo
    gradcam: GradCam
    note: str | None = None


class TargetInfo(BaseModel):
    target: str
    target_slug: str
    label: str
    units: str
    predict: str
    inputs: str = Field(
        default="One RGB pasture photo. The service resizes it to 224x224 for the ResNet "
                "embedding and computes four vegetation statistics on the original pixels."
    )


def _engine() -> BiomassEngine:
    engine = getattr(app.state, "engine", None)
    if engine is None or not engine.ready:
        raise HTTPException(503, "Biomass models are not loaded")
    return engine


def _to_prediction(result: dict) -> Prediction:
    gradcam = result["gradcam"]
    return Prediction(
        target=result["target"],
        target_slug=result["target_slug"],
        label=result["label"],
        prediction=result["prediction"],
        units=result["units"],
        green_features=GreenFeatures(**result["green_features"]),
        embedding_dim=result["embedding_dim"],
        feature_dim=result["feature_dim"],
        image_size=result["image_size"],
        backbone=BackboneInfo(**result["backbone"]),
        gradcam=GradCam(
            method=gradcam["method"],
            layer=gradcam["layer"],
            score=gradcam["score"],
            summary=gradcam["summary"],
            content_type=gradcam["content_type"],
            image_base64=base64.b64encode(gradcam["image_jpeg"]).decode("ascii"),
        ),
        note=result.get("note"),
    )


async def _predict(slug: str, image: UploadFile) -> Prediction:
    content = await image.read()
    try:
        photo = open_image(content)
        result = await asyncio.to_thread(_engine().predict, photo, slug)
    except InferenceError as exc:
        raise HTTPException(400, str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Prediction failed for %s", slug)
        raise HTTPException(500, f"Prediction failed: {exc}") from exc
    return _to_prediction(result)


def _describe(target: Target) -> TargetInfo:
    return TargetInfo(
        target=target.name,
        target_slug=target.slug,
        label=target.label,
        units=UNITS,
        predict=f"/targets/{target.slug}/predict",
    )


def _build_router(target: Target):
    from fastapi import APIRouter

    router = APIRouter(prefix=f"/targets/{target.slug}", tags=[target.name])

    slug_id = target.slug.replace("-", "_")

    @router.get("", response_model=TargetInfo, summary=f"{target.label} model", operation_id=f"describe_{slug_id}")
    def describe() -> TargetInfo:
        return _describe(target)

    @router.post(
        "/predict",
        response_model=Prediction,
        summary=f"Predict {target.label}",
        operation_id=f"predict_{slug_id}",
    )
    async def predict(image: UploadFile = File(..., description="RGB pasture photo")) -> Prediction:
        return await _predict(target.slug, image)

    return router


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = BiomassEngine()
    await asyncio.to_thread(engine.load)
    app.state.engine = engine
    logger.info("Biomass service ready on %s models (%s)", len(engine.models), engine.backbone_info.get("source"))
    yield


app = FastAPI(
    title="AgriAssist biomass models",
    version="1.0.0",
    summary="One API per XGBoost biomass model, sharing a ResNet-50 backbone.",
    lifespan=lifespan,
)

for _target in TARGETS:
    app.include_router(_build_router(_target))


@app.get("/health")
def health():
    engine: BiomassEngine | None = getattr(app.state, "engine", None)
    if engine is None or not engine.ready:
        return {"status": "loading"}
    return {
        "status": "ok",
        "device": str(engine.device),
        "backbone": engine.backbone_info,
        "targets": [_describe(target).model_dump() for target in TARGETS],
    }


@app.get("/targets", response_model=list[TargetInfo])
def list_targets():
    return [_describe(target) for target in TARGETS]
