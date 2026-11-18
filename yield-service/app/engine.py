"""District rice, wheat and maize yield.

Historical features use only rows from years before the requested year, for the
same state, district, crop and season. The fitted pipeline is a one-hot encoder
plus a random forest (scikit-learn 1.6.1).
"""
from __future__ import annotations

from dataclasses import dataclass

import joblib
import pandas as pd

from . import config

COLUMNS = [
    "State_Name",
    "District_Name",
    "Crop",
    "Season",
    "Crop_Year",
    "previous_yield",
    "historical_mean_3",
    "years_since_previous",
    "history_count",
]


class YieldError(Exception):
    pass


def pretty(value: str) -> str:
    return " ".join(part.capitalize() for part in str(value).split())


def _key(value: str) -> str:
    return " ".join(str(value).strip().upper().split())


@dataclass
class YieldEngine:
    ready: bool = False

    def load(self) -> None:
        if not config.PIPELINE_PATH.is_file():
            raise FileNotFoundError(f"Yield pipeline not found: {config.PIPELINE_PATH}")
        if not config.HISTORY_PATH.is_file():
            raise FileNotFoundError(f"Yield history not found: {config.HISTORY_PATH}")
        self.pipeline = joblib.load(config.PIPELINE_PATH)
        frame = pd.read_csv(config.HISTORY_PATH)
        frame["State_Name"] = frame["State_Name"].map(_key)
        frame["District_Name"] = frame["District_Name"].map(_key)
        frame["Crop"] = frame["Crop"].map(_key)
        frame["Season"] = frame["Season"].map(_key)
        frame["Crop_Year"] = frame["Crop_Year"].astype(int)
        frame["yield_tonnes_per_hectare"] = frame["yield_tonnes_per_hectare"].astype(float)
        self.history = frame
        self.year_min = int(frame["Crop_Year"].min()) + 1
        self.year_max = int(frame["Crop_Year"].max()) + 1
        self._states: dict[str, dict[str, set[tuple[str, str]]]] = {}
        for row in frame.itertuples(index=False):
            state = self._states.setdefault(row.State_Name, {})
            state.setdefault(row.District_Name, set()).add((row.Crop, row.Season))
        self.ready = True

    def catalog(self) -> dict:
        states = []
        for state in sorted(self._states):
            states.append({
                "value": state,
                "label": pretty(state),
                "districts": [
                    {
                        "value": district,
                        "label": pretty(district),
                        "pairs": [
                            {"crop": crop, "season": season}
                            for crop, season in sorted(self._states[state][district])
                        ],
                    }
                    for district in sorted(self._states[state])
                ],
            })
        return {
            "crops": [{"value": crop, "label": pretty(crop)} for crop in ("RICE", "WHEAT", "MAIZE")],
            "seasons": [
                {"value": season, "label": pretty(season)}
                for season in ("KHARIF", "RABI", "AUTUMN", "SUMMER", "WINTER", "WHOLE YEAR")
            ],
            "year_min": self.year_min,
            "year_max": self.year_max,
            "states": states,
            "units": "tonnes per hectare",
        }

    def _match(self, value: str, choices: dict | set, kind: str) -> str:
        key = _key(value)
        if not key:
            raise YieldError(f"{kind} is required")
        if key in choices:
            return key
        raise YieldError(f"Unknown {kind.lower()} '{value}'")

    def predict(self, state: str, district: str, crop: str, season: str, year: int) -> dict:
        if not self.ready:
            raise YieldError("Yield model is not loaded")
        try:
            year = int(year)
        except (TypeError, ValueError) as exc:
            raise YieldError("Year must be a number") from exc
        state_name = self._match(state, self._states, "State")
        district_name = self._match(district, self._states[state_name], "District")
        crop_name = self._match(crop, {"RICE", "WHEAT", "MAIZE"}, "Crop")
        season_name = self._match(
            season, {"KHARIF", "RABI", "AUTUMN", "SUMMER", "WINTER", "WHOLE YEAR"}, "Season",
        )
        known = self._states[state_name][district_name]
        if (crop_name, season_name) not in known:
            raise YieldError(
                f"No {pretty(crop_name)} {pretty(season_name)} history for "
                f"{pretty(district_name)}, {pretty(state_name)}"
            )
        prior = self.history[
            (self.history["State_Name"] == state_name)
            & (self.history["District_Name"] == district_name)
            & (self.history["Crop"] == crop_name)
            & (self.history["Season"] == season_name)
            & (self.history["Crop_Year"] < year)
        ].sort_values("Crop_Year")
        if prior.empty:
            first = int(self.history.loc[
                (self.history["State_Name"] == state_name)
                & (self.history["District_Name"] == district_name)
                & (self.history["Crop"] == crop_name)
                & (self.history["Season"] == season_name),
                "Crop_Year",
            ].min())
            raise YieldError(
                f"Need a record from before {year}. The earliest year on file for this "
                f"district, crop and season is {first}."
            )
        yields = prior["yield_tonnes_per_hectare"]
        previous_year = int(prior["Crop_Year"].iloc[-1])
        features = {
            "State_Name": state_name,
            "District_Name": district_name,
            "Crop": crop_name,
            "Season": season_name,
            "Crop_Year": year,
            "previous_yield": float(yields.iloc[-1]),
            "historical_mean_3": float(yields.tail(3).mean()),
            "years_since_previous": year - previous_year,
            "history_count": int(len(prior)),
        }
        frame = pd.DataFrame([{column: features[column] for column in COLUMNS}])
        prediction = float(self.pipeline.predict(frame)[0])
        if prediction < 0:
            prediction = 0.0
        return {
            "mode": "live",
            "prediction": round(prediction, 4),
            "units": "tonnes per hectare",
            "label": f"{pretty(crop_name)} · {pretty(season_name)} · {pretty(district_name)}, {pretty(state_name)}",
            "state": state_name,
            "district": district_name,
            "crop": crop_name,
            "season": season_name,
            "year": year,
            "previous_year": previous_year,
            "previous_yield": round(features["previous_yield"], 4),
            "historical_mean_3": round(features["historical_mean_3"], 4),
            "years_since_previous": features["years_since_previous"],
            "history_count": features["history_count"],
            "note": "District-level estimate from earlier recorded yields, not a single farm.",
        }
