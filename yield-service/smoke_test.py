"""Load the fitted forest and check one known district against the held-out sheet."""
from __future__ import annotations

import pandas as pd

from app.engine import YieldEngine, YieldError

HISTORY = __import__("pathlib").Path(__file__).resolve().parents[1] / "ML Models" / "crop_yield_model"


def main() -> None:
    engine = YieldEngine()
    engine.load()
    result = engine.predict("Odisha", "Anugul", "maize", "autumn", 2015)
    sheet = pd.read_csv(HISTORY / "test_predictions.csv")
    row = sheet.iloc[0]
    print(
        f"Anugul maize autumn 2015: model {result['prediction']:.3f} t/ha, "
        f"held-out forest {row.model_prediction:.3f}, actual {row.yield_tonnes_per_hectare:.3f}"
    )
    assert result["history_count"] >= 1
    assert result["prediction"] > 0
    # The 3-year mean feature is the baseline column on that same test row.
    assert abs(result["historical_mean_3"] - float(row.baseline_prediction)) < 1e-3
    later = engine.predict("odisha", "anugul", "Maize", "Autumn", 2016)
    assert later["previous_year"] == 2015
    try:
        engine.predict("Odisha", "Anugul", "wheat", "autumn", 2015)
    except YieldError as exc:
        print("missing history:", exc)
    else:
        raise SystemExit("expected a missing wheat/autumn history error")
    print("yield engine ok")


if __name__ == "__main__":
    main()
