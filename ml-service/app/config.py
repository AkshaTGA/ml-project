"""Paths and runtime settings for the biomass model service."""

from __future__ import annotations

import os
from pathlib import Path

# app/config.py -> app -> ml-service -> AgriAssist -> ML_Project
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_WEIGHTS_DIR = PROJECT_ROOT / "Biomass_prediciton"

WEIGHTS_DIR = Path(os.getenv("BIOMASS_WEIGHTS_DIR", DEFAULT_WEIGHTS_DIR)).expanduser()

# Torch can read the zipped checkpoint directly. The download name includes " (1)".
_BACKBONE_NAMES = (
    "backbone_full.pt",
    "backbone_full.pt.zip",
    "backbone_full (1).pt.zip",
)


def resolve_backbone(weights_dir: Path) -> Path:
    override = os.getenv("BIOMASS_BACKBONE")
    if override:
        return Path(override).expanduser()
    for name in _BACKBONE_NAMES:
        path = weights_dir / name
        if path.is_file():
            return path
    found = sorted(weights_dir.glob("backbone*.pt")) + sorted(weights_dir.glob("backbone*.zip"))
    return found[0] if found else weights_dir / "backbone_full.pt"


BACKBONE_PATH = resolve_backbone(WEIGHTS_DIR)
DEVICE = os.getenv("BIOMASS_DEVICE", "cpu")
GRADCAM_MAX_SIDE = int(os.getenv("GRADCAM_MAX_SIDE", "768"))
HOST = os.getenv("ML_HOST", "127.0.0.1")
PORT = int(os.getenv("ML_PORT", "8100"))
