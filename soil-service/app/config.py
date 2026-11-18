"""Paths for the soil-profile clustering service."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIR = ROOT.parent / "ML Models" / "soil_profile_model"

MODEL_DIR = Path(os.getenv("SOIL_MODEL_DIR", DEFAULT_DIR))
PIPELINE_PATH = MODEL_DIR / "soil_profile_pipeline.joblib"
PROFILES_PATH = MODEL_DIR / "cluster_profiles.csv"
METADATA_PATH = MODEL_DIR / "model_metadata.json"
