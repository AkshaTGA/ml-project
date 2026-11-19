"""Paths for the district crop-yield model."""
from __future__ import annotations

import os
from pathlib import Path

AGRIASSIST = Path(__file__).resolve().parents[3]
DEFAULT_DIR = AGRIASSIST / "ML Models" / "crop_yield_model"

MODEL_DIR = Path(os.getenv("YIELD_MODEL_DIR", DEFAULT_DIR))
PIPELINE_PATH = MODEL_DIR / "crop_yield_pipeline.joblib"
HISTORY_PATH = MODEL_DIR / "yield_history.csv"
