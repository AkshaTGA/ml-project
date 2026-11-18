from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import runs
from ..auth import current_user
from ..clients import http
from ..config import MODEL_URLS
from ..model_client import ModelError, run_model
from ..registry import MODELS, MODELS_BY_ID

logger = logging.getLogger(__name__)

router = APIRouter()


def _apply_yield_catalog(model: dict, catalog: dict) -> dict:
    """Fill menus from the yield service, and only offer crop seasons that district recorded."""
    labels = {item["value"]: item["label"] for item in (catalog.get("crops") or []) + (catalog.get("seasons") or [])}
    districts, crops, seasons = [], [], []
    for state in catalog.get("states") or []:
        for district in state.get("districts") or []:
            districts.append({"value": district["value"], "label": district["label"], "when": state["value"]})
            seen = set()
            for pair in district.get("pairs") or []:
                place = f"{state['value']}|{district['value']}"
                if pair["crop"] not in seen:
                    seen.add(pair["crop"])
                    crops.append({
                        "value": pair["crop"],
                        "label": labels.get(pair["crop"], pair["crop"]),
                        "when": place,
                    })
                seasons.append({
                    "value": pair["season"],
                    "label": labels.get(pair["season"], pair["season"]),
                    "when": f"{place}|{pair['crop']}",
                })
    fields = []
    for field in model["fields"]:
        item = dict(field)
        if field["name"] == "state":
            item["options"] = [{"value": s["value"], "label": s["label"]} for s in catalog.get("states") or []]
        elif field["name"] == "district":
            item["options"] = districts
        elif field["name"] == "crop":
            item["depends_on"] = ["state", "district"]
            item["options"] = crops
        elif field["name"] == "season":
            item["depends_on"] = ["state", "district", "crop"]
            item["options"] = seasons
        elif field["name"] == "year":
            item["min"] = catalog.get("year_min", field.get("min"))
            # History ends at year_max - 1. Later years still run; they reuse the last recorded harvests.
            item["max"] = 2050
            item["default"] = catalog.get("year_max", field.get("default"))
        fields.append(item)
    return {**model, "fields": fields}


async def _with_yield_catalog(model: dict) -> dict:
    url = MODEL_URLS.get("yield") or ""
    if model["id"] != "yield" or not url:
        return model
    try:
        response = await http.get(f"{url.rstrip('/')}/catalog", timeout=15)
        response.raise_for_status()
    except (httpx.HTTPError, ValueError):
        logger.warning("Crop yield catalog is unavailable at %s", url)
        return model
    return _apply_yield_catalog(model, response.json())


@router.get("/models")
async def list_models(user_id: str = Depends(current_user)):
    listed = []
    for model in MODELS:
        item = {**model, "status": "connected" if MODEL_URLS[model["id"]] else "mock"}
        listed.append(await _with_yield_catalog(item))
    return listed


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
