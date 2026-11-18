from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from utils import weighted_r2


def main():
    parser = argparse.ArgumentParser(description="Evaluate long-format biomass predictions")
    parser.add_argument("--truth", type=Path, required=True, help="Long-format training CSV")
    parser.add_argument("--predictions", type=Path, required=True, help="CSV with sample_id and target")
    args = parser.parse_args()
    truth = pd.read_csv(args.truth)
    pred = pd.read_csv(args.predictions)
    if "sample_id" not in truth and {"image_path", "target_name", "target"}.issubset(truth.columns):
        truth = truth.copy()
        image_id = truth["image_path"].astype(str).str.replace(r"^.*[/\\]", "", regex=True)
        image_id = image_id.str.replace(r"\.[^.]+$", "", regex=True)
        truth["sample_id"] = image_id + "__" + truth["target_name"].astype(str)
    for name, frame in (("truth", truth), ("predictions", pred)):
        if not {"sample_id", "target"}.issubset(frame.columns):
            raise ValueError(f"{name} CSV must contain sample_id and target")
        if frame["sample_id"].duplicated().any():
            raise ValueError(f"{name} CSV contains duplicate sample_id values")
    merged = truth[["sample_id", "target"]].merge(
        pred[["sample_id", "target"]], on="sample_id", how="inner", suffixes=("_true", "_pred"), validate="one_to_one"
    )
    if len(merged) != len(truth) or len(merged) != len(pred):
        raise ValueError(f"Rows or sample IDs differ: truth={len(truth)}, predictions={len(pred)}, matched={len(merged)}")
    print(f"overall_r2={weighted_r2(merged.target_true, merged.target_pred):.6f}")
    names = truth.set_index("sample_id")["target_name"] if "target_name" in truth else None
    if names is not None:
        merged["target_name"] = merged["sample_id"].map(names)
        for target_name, group in merged.groupby("target_name", sort=False):
            score = weighted_r2(group.target_true, group.target_pred)
            print(f"{target_name}_r2={score:.6f} n={len(group)}")
    rmse = float(np.sqrt(np.mean((merged.target_true - merged.target_pred) ** 2)))
    print(f"rmse={rmse:.6f}")


if __name__ == "__main__":
    main()
