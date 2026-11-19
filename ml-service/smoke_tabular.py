"""Load the yield, soil and cattle engines and check known cases."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from app.cattle.engine import CattleEngine, CattleError
from app.soil.engine import SoilEngine
from app.yield_model.engine import YieldEngine, YieldError

HISTORY = Path(__file__).resolve().parents[1] / "ML Models" / "crop_yield_model"


def main() -> None:
    yield_engine = YieldEngine()
    yield_engine.load()
    result = yield_engine.predict("Odisha", "Anugul", "maize", "autumn", 2015)
    sheet = pd.read_csv(HISTORY / "test_predictions.csv")
    row = sheet.iloc[0]
    print(
        f"Anugul maize autumn 2015: model {result['prediction']:.3f} t/ha, "
        f"held-out forest {row.model_prediction:.3f}"
    )
    assert result["prediction"] > 0
    assert abs(result["historical_mean_3"] - float(row.baseline_prediction)) < 1e-3
    try:
        yield_engine.predict("Odisha", "Anugul", "wheat", "autumn", 2015)
        raise SystemExit("expected a missing wheat/autumn history error")
    except YieldError as exc:
        print("missing history:", exc)

    soil = SoilEngine()
    soil.load()
    for cluster, profile in soil.profiles.items():
        grouped = soil.predict(profile)
        assert grouped["cluster"] == cluster
        print(f"soil cluster {cluster}: distance {grouped['distance']}")
    far = soil.predict({"pH": 4.0, "EC": 2.5, "OC": 1.5, "N": 400, "P": 80, "K": 500})
    print("soil far", far["cluster"], far["unusual"])

    cattle = CattleEngine()
    cattle.load()
    body = cattle.predict({"heart_girth": 188, "body_length": 197})
    print("cattle", body["prediction"], "kg")
    assert abs(body["prediction"] - 493.7) < 0.2
    assert body["unusual"] is False
    try:
        cattle.predict({"heart_girth": 188})
        raise SystemExit("missing body_length should fail")
    except CattleError as exc:
        print("missing", exc)

    print("tabular models ok")


if __name__ == "__main__":
    main()
