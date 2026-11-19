"""Cattle liveweight from heart girth and body length.

The fitted pipeline is a LinearRegression (scikit-learn 1.6.1) on 517 Indian
cattle rows. It is not a certified scale, and it is not for calves, goats or buffaloes.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import joblib
import pandas as pd

from . import config

FEATURES = ["HeartGirth", "BLBodylengthcm"]
ALIASES = {
    "heartgirth": "HeartGirth",
    "heart_girth": "HeartGirth",
    "girth": "HeartGirth",
    "hg": "HeartGirth",
    "blbodylengthcm": "BLBodylengthcm",
    "body_length": "BLBodylengthcm",
    "bodylength": "BLBodylengthcm",
    "length": "BLBodylengthcm",
    "bl": "BLBodylengthcm",
}
DISPLAY = {"HeartGirth": "heart_girth", "BLBodylengthcm": "body_length"}
RANGES = {"HeartGirth": (171.0, 233.0), "BLBodylengthcm": (177.0, 246.0)}
WEIGHT_RANGE = (379.0, 824.0)
NOTE = (
    "Estimate from heart girth and body length, in kilograms. "
    "Not a scale reading. Not for calves, goats or buffaloes."
)


class CattleError(Exception):
    pass


@dataclass
class CattleEngine:
    ready: bool = False

    def load(self) -> None:
        if not config.PIPELINE_PATH.is_file():
            raise FileNotFoundError(f"Cattle pipeline not found: {config.PIPELINE_PATH}")
        self.pipeline = joblib.load(config.PIPELINE_PATH)
        meta = json.loads(config.METADATA_PATH.read_text()) if config.METADATA_PATH.is_file() else {}
        self.ranges = dict(RANGES)
        for name, bounds in (meta.get("feature_ranges_in_dataset") or {}).items():
            if name in self.ranges and "min" in bounds and "max" in bounds:
                self.ranges[name] = (float(bounds["min"]), float(bounds["max"]))
        recorded = meta.get("recorded_weight_range") or {}
        if "min" in recorded and "max" in recorded:
            self.weight_range = (float(recorded["min"]), float(recorded["max"]))
        else:
            self.weight_range = WEIGHT_RANGE
        model = self.pipeline.named_steps.get("model", self.pipeline)
        self.coefficients = {
            name: float(coef)
            for name, coef in zip(FEATURES, getattr(model, "coef_", [0, 0]))
        }
        self.intercept = float(getattr(model, "intercept_", 0.0))
        self.ready = True

    def predict(self, values: dict) -> dict:
        if not self.ready:
            raise CattleError("Cattle model is not loaded")
        row = {}
        for key, value in values.items():
            name = ALIASES.get(str(key).strip().lower().replace(" ", "_"), None)
            if name is None:
                continue
            try:
                row[name] = float(value)
            except (TypeError, ValueError) as exc:
                raise CattleError(f"{DISPLAY[name]} must be a number") from exc
        missing = [DISPLAY[name] for name in FEATURES if name not in row]
        if missing:
            raise CattleError("Missing " + ", ".join(missing))
        for name, amount in row.items():
            if amount <= 0:
                raise CattleError(f"{DISPLAY[name]} must be greater than 0")
        frame = pd.DataFrame([{name: row[name] for name in FEATURES}])
        prediction = float(self.pipeline.predict(frame)[0])
        if prediction < 0:
            prediction = 0.0
        outside = [
            DISPLAY[name]
            for name in FEATURES
            if not (self.ranges[name][0] <= row[name] <= self.ranges[name][1])
        ]
        if not (self.weight_range[0] <= prediction <= self.weight_range[1]):
            outside.append("weight")
        unusual = bool(outside)
        note = NOTE
        if unusual:
            girth = self.ranges["HeartGirth"]
            length = self.ranges["BLBodylengthcm"]
            note = (
                "One or more measurements sit outside the training range "
                f"(heart girth {girth[0]:.0f}–{girth[1]:.0f} cm, "
                f"body length {length[0]:.0f}–{length[1]:.0f} cm). "
            ) + note
        return {
            "mode": "live",
            "prediction": round(prediction, 1),
            "units": "kg",
            "label": "Cattle liveweight",
            "heart_girth": round(row["HeartGirth"], 1),
            "body_length": round(row["BLBodylengthcm"], 1),
            "unusual": unusual,
            "outside": outside,
            "ranges": {
                "heart_girth": list(self.ranges["HeartGirth"]),
                "body_length": list(self.ranges["BLBodylengthcm"]),
                "weight": list(self.weight_range),
            },
            "note": note,
        }
