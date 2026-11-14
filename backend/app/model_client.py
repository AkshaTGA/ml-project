"""Calls the deployed model APIs. Used both by the agent's tools and the direct /api/models routes.

Image models get the uploaded image as multipart form data; other models get their inputs as JSON.
Until a model's API URL is configured, a hardcoded mock response is returned instead.
"""
from __future__ import annotations

import asyncio

import httpx

from . import files
from .clients import http
from .config import BIOMASS_IMAGE_FIELD, MODEL_URLS
from .registry import MODELS_BY_ID

MOCK_NOTE = "Mock response: this model's API is not connected yet."

MOCK_RESPONSES = {
    "biomass": {
        "predictions": {"Dry_Clover_g": 6.4, "Dry_Dead_g": 18.2, "Dry_Green_g": 32.5,
                        "Dry_Total_g": 57.1, "GDM_g": 38.9},
        "units": "grams of dry matter per sample quadrat",
    },
    "crop": {
        "recommendations": [{"crop": "wheat", "confidence": 0.46}, {"crop": "mustard", "confidence": 0.31},
                            {"crop": "chickpea", "confidence": 0.23}],
    },
    "livestock": {
        "risk_level": "medium",
        "possible_conditions": [{"condition": "Respiratory infection", "match": 0.5},
                                {"condition": "Parasitic / digestive infection", "match": 0.25}],
    },
}


class ModelError(Exception):
    pass


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
    if not url:
        return {**MOCK_RESPONSES[model_id], "mode": "mock", "note": MOCK_NOTE}

    try:
        if image:
            response = await http.post(url, files={BIOMASS_IMAGE_FIELD: image}, timeout=120)
        else:
            response = await http.post(url, json=inputs, timeout=120)
    except httpx.HTTPError as exc:
        raise ModelError(f"Model API '{model_id}' is unreachable at {url}: {exc}") from exc
    if response.status_code >= 400:
        raise ModelError(f"Model API '{model_id}' returned {response.status_code}: {response.text[:500]}")
    return response.json()
