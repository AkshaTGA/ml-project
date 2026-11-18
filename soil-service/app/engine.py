"""Group a soil test with similar Bareilly samples.

The fitted pipeline is a StandardScaler and a 4-cluster KMeans (scikit-learn 1.6.1).
Cluster numbers are arbitrary labels, not fertility grades.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import joblib
import pandas as pd

from . import config

FEATURES = ["pH", "EC", "OC", "N", "P", "K"]
ALIASES = {
    "ph": "pH", "ec": "EC", "oc": "OC", "n": "N", "p": "P", "k": "K",
    "nitrogen": "N", "phosphorus": "P", "potassium": "K",
}

# Descriptions compare the four group medians with each other. They are not grades.
SUMMARIES = {
    0: "Near-neutral pH, low salinity, modest organic carbon, and very low phosphorus.",
    1: "Slightly acidic, with higher nitrogen and phosphorus than the other groups.",
    2: "Lower pH, higher salinity, and the highest organic carbon, nitrogen and potassium.",
    3: "Slightly alkaline, with the lowest organic carbon, nitrogen and potassium, and higher phosphorus.",
}


class SoilError(Exception):
    pass


@dataclass
class SoilEngine:
    ready: bool = False

    def load(self) -> None:
        if not config.PIPELINE_PATH.is_file():
            raise FileNotFoundError(f"Soil pipeline not found: {config.PIPELINE_PATH}")
        self.pipeline = joblib.load(config.PIPELINE_PATH)
        profiles = pd.read_csv(config.PROFILES_PATH)
        self.profiles = {
            int(row.cluster): {
                "sample_count": int(row.sample_count),
                **{name: float(getattr(row, name)) for name in FEATURES},
            }
            for row in profiles.itertuples(index=False)
        }
        meta = json.loads(config.METADATA_PATH.read_text())
        self.units = meta["units"]
        self.threshold = float(meta["distance_warning_threshold"])
        self.scope = meta["scope"]
        self.ready = True

    def predict(self, values: dict) -> dict:
        if not self.ready:
            raise SoilError("Soil model is not loaded")
        row = {}
        for key, value in values.items():
            name = ALIASES.get(str(key).strip().lower(), key)
            if name not in FEATURES:
                continue
            try:
                row[name] = float(value)
            except (TypeError, ValueError) as exc:
                raise SoilError(f"{name} must be a number") from exc
        missing = [name for name in FEATURES if name not in row]
        if missing:
            raise SoilError("Missing " + ", ".join(missing))
        frame = pd.DataFrame([{name: row[name] for name in FEATURES}])
        cluster = int(self.pipeline.predict(frame)[0])
        scaled = self.pipeline.named_steps["scaler"].transform(frame)
        distance = float(self.pipeline.named_steps["kmeans"].transform(scaled).min())
        profile = self.profiles[cluster]
        unusual = distance > self.threshold
        return {
            "mode": "live",
            "cluster": cluster,
            "label": f"Cluster {cluster}",
            "summary": SUMMARIES[cluster],
            "sample_count": profile["sample_count"],
            "distance": round(distance, 3),
            "distance_threshold": round(self.threshold, 3),
            "unusual": unusual,
            "inputs": {name: row[name] for name in FEATURES},
            "group_medians": {name: round(profile[name], 3) for name in FEATURES},
            "units": self.units,
            "note": (
                "This sample sits farther from every group than most of the training rows. "
                if unusual else ""
            ) + "A descriptive group from soil samples in Bareilly, Uttar Pradesh. "
            "Not a fertility grade and not a fertilizer dose.",
        }
