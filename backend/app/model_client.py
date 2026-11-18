"""Calls the deployed model APIs. Used both by the agent's tools and the direct /api/models routes.

Image models get the uploaded image as multipart form data; other models get their inputs as JSON.
Until a model's API URL is configured, a hardcoded mock response is returned instead.

Biomass is a separate service. Each measurement has its own URL under that service:
POST {BIOMASS_API_URL}/targets/{slug}/predict. Slugs must match ml-service/app/targets.py.
"""
from __future__ import annotations

import asyncio
import base64
import logging

import httpx

from . import files
from .clients import http
from .config import BIOMASS_IMAGE_FIELD, MODEL_URLS
from .registry import MODELS_BY_ID

logger = logging.getLogger(__name__)

MOCK_NOTE = "Mock response: this model's API is not connected yet."

# Canonical target name -> path slug on the biomass service.
BIOMASS_TARGETS = {
    "Dry_Clover_g": "dry-clover",
    "Dry_Dead_g": "dry-dead",
    "Dry_Green_g": "dry-green",
    "Dry_Total_g": "dry-total",
    "GDM_g": "gdm",
}
_BIOMASS_ALIASES = {
    "dry-clover": "Dry_Clover_g",
    "dry-clover-g": "Dry_Clover_g",
    "clover": "Dry_Clover_g",
    "dry-dead": "Dry_Dead_g",
    "dry-dead-g": "Dry_Dead_g",
    "dead": "Dry_Dead_g",
    "dry-green": "Dry_Green_g",
    "dry-green-g": "Dry_Green_g",
    "green": "Dry_Green_g",
    "green-vegetation": "Dry_Green_g",
    "dry-total": "Dry_Total_g",
    "dry-total-g": "Dry_Total_g",
    "total": "Dry_Total_g",
    "total-dry-matter": "Dry_Total_g",
    "gdm": "GDM_g",
    "gdm-g": "GDM_g",
    "green-dry-matter": "GDM_g",
}

MOCK_RESPONSES = {
    "biomass": {
        "predictions": {"Dry_Clover_g": 6.4, "Dry_Dead_g": 18.2, "Dry_Green_g": 32.5,
                        "Dry_Total_g": 57.1, "GDM_g": 38.9},
        "units": "grams of dry matter per sample quadrat",
    },
}


class ModelError(Exception):
    pass


def resolve_biomass_target(value: str) -> str:
    """Map a user or agent choice onto one of the five trained target names."""
    text = (value or "").strip()
    if text in BIOMASS_TARGETS:
        return text
    key = "-".join(text.lower().replace("_", " ").split())
    if key in _BIOMASS_ALIASES:
        return _BIOMASS_ALIASES[key]
    names = ", ".join(BIOMASS_TARGETS)
    if not text:
        raise ModelError(f"Choose which biomass to predict: {names}")
    raise ModelError(f"Unknown biomass measurement '{value}'. Choose one of: {names}")


async def _store_gradcam(user_id: str, slug: str, payload: dict) -> str | None:
    encoded = (payload.get("gradcam") or {}).get("image_base64")
    if not encoded:
        return None
    try:
        saved = await files.save_upload(user_id, f"gradcam-{slug}.jpg", base64.b64decode(encoded), "image/jpeg")
    except Exception:
        logger.exception("Could not store Grad-CAM image")
        return None
    return saved["id"]


async def _run_biomass(user_id: str, url: str, image, inputs: dict) -> dict:
    target = resolve_biomass_target(str(inputs.get("target") or ""))
    slug = BIOMASS_TARGETS[target]
    endpoint = f"{url.rstrip('/')}/targets/{slug}/predict"
    try:
        response = await http.post(endpoint, files={BIOMASS_IMAGE_FIELD: image}, timeout=180)
    except httpx.HTTPError as exc:
        raise ModelError(f"Biomass model '{target}' is unreachable at {endpoint}: {exc}") from exc
    if response.status_code >= 400:
        raise ModelError(f"Biomass model '{target}' returned {response.status_code}: {response.text[:500]}")
    body = response.json()
    name = body.get("target", target)
    value = float(body["prediction"])
    gradcam = body.get("gradcam") or {}
    return {
        "mode": "live",
        "target": name,
        "label": body.get("label"),
        "prediction": value,
        "predictions": {name: value},
        "units": body.get("units"),
        "gradcam_file_id": await _store_gradcam(user_id, slug, body),
        "gradcam_summary": gradcam.get("summary"),
        "green_features": body.get("green_features"),
        "backbone": body.get("backbone"),
        "note": body.get("note"),
    }


async def run_model(user_id: str, model_id: str, inputs: dict) -> dict:
    spec = MODELS_BY_ID.get(model_id)
    if spec is None:
        raise ModelError(f"Unknown model '{model_id}'")

    image = None
    if spec["input_type"] == "image":
        file_id = inputs.get("image") or inputs.get("file_id") or ""
        meta = await files.get_meta(user_id, file_id)
        if meta is None or meta["kind"] != "image":
            raise ModelError("Image not found. Upload an image first.")
        content = await asyncio.to_thread(files.path_of(meta).read_bytes)
        image = (meta["name"], content, meta["content_type"])

    url = MODEL_URLS[model_id]
    if model_id == "biomass":
        if not url:
            return {**MOCK_RESPONSES[model_id], "mode": "mock", "note": MOCK_NOTE}
        if image is None:
            raise ModelError("Image not found. Upload an image first.")
        return await _run_biomass(user_id, url, image, inputs)

    if model_id == "yield" and not url:
        raise ModelError("Crop yield service is not configured. Set YIELD_API_URL and start yield-service.")
    if model_id == "soil" and not url:
        raise ModelError("Soil profile service is not configured. Set SOIL_API_URL and start soil-service.")
    if not url:
        return {**MOCK_RESPONSES[model_id], "mode": "mock", "note": MOCK_NOTE}

    endpoint = f"{url.rstrip('/')}/predict" if model_id in {"yield", "soil"} else url
    try:
        response = await http.post(endpoint, json=inputs, timeout=120)
    except httpx.HTTPError as exc:
        raise ModelError(f"Model API '{model_id}' is unreachable at {endpoint}: {exc}") from exc
    if response.status_code >= 400:
        detail = response.text[:500]
        try:
            body = response.json()
            if isinstance(body.get("detail"), str):
                detail = body["detail"]
        except ValueError:
            pass
        if model_id in {"yield", "soil"}:
            raise ModelError(detail)
        raise ModelError(f"Model API '{model_id}' returned {response.status_code}: {detail}")
    return response.json()
