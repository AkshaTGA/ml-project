from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader

from model import BiomassModel
from utils import BiomassDataset, load_checkpoint


@torch.inference_mode()
def predict(model, loader, device):
    model.eval()
    sample_ids, predictions = [], []
    for batch in loader:
        output = model(batch["image"].to(device), batch["target_name"].to(device))
        predictions.extend(output["biomass"].clamp_min(0).cpu().numpy().tolist())
        sample_ids.extend(batch["sample_id"])
    return pd.DataFrame({"sample_id": sample_ids, "target": np.asarray(predictions, dtype=np.float32)})


def main():
    parser = argparse.ArgumentParser(description="Generate long-format biomass predictions")
    parser.add_argument("--test-csv", type=Path, default=Path("data/test.csv"))
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument("--checkpoint", type=Path, default=Path("artifacts/latest.pt"))
    parser.add_argument("--dino-checkpoint", type=Path, default=Path("checkpoints/dino_deitsmall16_pretrain.pth"))
    parser.add_argument("--output", type=Path, default=Path("submission.csv"))
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--num-workers", type=int, default=0)
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    checkpoint = load_checkpoint(args.checkpoint, device)
    frame = pd.read_csv(args.test_csv)
    if not {"image_path", "target_name", "sample_id"}.issubset(frame.columns):
        raise ValueError("Test CSV must contain image_path, target_name, and sample_id")
    from utils import TARGET_NAME_TO_ID
    frame["target_name"] = frame["target_name"].map(TARGET_NAME_TO_ID)
    if frame["target_name"].isna().any():
        raise ValueError("Test CSV contains an unknown target_name")
    frame["target_name"] = frame["target_name"].astype("int64")
    model = BiomassModel(
        int(checkpoint["num_species"]), int(checkpoint["num_states"]), args.dino_checkpoint
    ).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    loader = DataLoader(
        BiomassDataset(frame, args.data_root, training=False), batch_size=args.batch_size,
        shuffle=False, num_workers=args.num_workers, pin_memory=device.type == "cuda",
    )
    result = predict(model, loader, device)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(args.output, index=False)
    print(f"Wrote {len(result)} predictions to {args.output}")


if __name__ == "__main__":
    main()
