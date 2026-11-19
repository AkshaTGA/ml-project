"""Paths for the soil-profile clustering model."""
from __future__ import annotations

import os
from pathlib import Path

AGRIASSIST = Path(__file__).resolve().parents[3]
DEFAULT_DIR = AGRIASSIST / "ML Models" / "soil_profile_model"

MODEL_DIR = Path(os.getenv("SOIL_MODEL_DIR", DEFAULT_DIR))
PIPELINE_PATH = MODEL_DIR / "soil_profile_pipeline.joblib"
PROFILES_PATH = MODEL_DIR / "cluster_profiles.csv"
METADATA_PATH = MODEL_DIR / "model_metadata.json"
