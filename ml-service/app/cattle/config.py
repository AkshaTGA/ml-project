"""Paths for the cattle liveweight model."""
from __future__ import annotations

import os
from pathlib import Path

AGRIASSIST = Path(__file__).resolve().parents[3]
DEFAULT_DIR = AGRIASSIST / "ML Models" / "cattle_weight_model"

MODEL_DIR = Path(os.getenv("CATTLE_MODEL_DIR", DEFAULT_DIR))
PIPELINE_PATH = MODEL_DIR / "cattle_weight_pipeline.joblib"
METADATA_PATH = MODEL_DIR / "evaluation_metrics.json"
