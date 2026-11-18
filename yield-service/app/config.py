"""Paths for the district crop-yield service."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIR = ROOT.parent / "ML Models" / "crop_yield_model"

MODEL_DIR = Path(os.getenv("YIELD_MODEL_DIR", DEFAULT_DIR))
PIPELINE_PATH = MODEL_DIR / "crop_yield_pipeline.joblib"
HISTORY_PATH = MODEL_DIR / "yield_history.csv"
