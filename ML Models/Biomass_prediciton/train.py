from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader

from model import BiomassModel
from utils import BiomassDataset, encode_metadata, load_checkpoint, prepare_training_table, set_seed


def train_one_epoch(model, loader, optimizer, device):
    model.train()
    totals = 0.0
    for batch in loader:
        image = batch["image"].to(device)
        target_name = batch["target_name"].to(device)
        output = model(image, target_name)
        loss = (
            F.mse_loss(output["biomass"], batch["target"].to(device))
            + 0.2 * F.mse_loss(output["height"], batch["height"].to(device))
            + 0.2 * F.mse_loss(output["aux"], batch["aux"].to(device))
            + 0.1 * F.cross_entropy(output["species"], batch["species"].to(device))
            + 0.1 * F.cross_entropy(output["state"], batch["state"].to(device))
        )
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()
        totals += loss.item()
    return totals / max(1, len(loader))


def main():
    parser = argparse.ArgumentParser(description="Train the biomass prediction model")
    parser.add_argument("--train-csv", type=Path, default=Path("data/train.csv"))
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument("--dino-checkpoint", type=Path, default=Path("checkpoints/dino_deitsmall16_pretrain.pth"))
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts"))
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--resume", type=Path)
    args = parser.parse_args()

    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    raw = pd.read_csv(args.train_csv)
    raw, encoders = encode_metadata(raw)
    frame = prepare_training_table(raw)
    species_count = len(encoders["Species"].classes_)
    state_count = len(encoders["State"].classes_)
    loader = DataLoader(
        BiomassDataset(frame, args.data_root), batch_size=args.batch_size, shuffle=True,
        num_workers=args.num_workers, pin_memory=device.type == "cuda",
    )
    model = BiomassModel(species_count, state_count, args.dino_checkpoint).to(device)
    optimizer = torch.optim.AdamW((p for p in model.parameters() if p.requires_grad), lr=args.learning_rate)
    start_epoch = 0
    if args.resume:
        checkpoint = load_checkpoint(args.resume, device)
        model.load_state_dict(checkpoint["model_state_dict"])
        if "optimizer_state_dict" in checkpoint:
            optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        start_epoch = int(checkpoint.get("epoch", 0))

    args.output_dir.mkdir(parents=True, exist_ok=True)
    for epoch in range(start_epoch, args.epochs):
        loss = train_one_epoch(model, loader, optimizer, device)
        print(f"epoch={epoch + 1}/{args.epochs} loss={loss:.6f}")
        state = {
            "epoch": epoch + 1,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "loss": loss,
            "num_species": species_count,
            "num_states": state_count,
            "seed": args.seed,
        }
        torch.save(state, args.output_dir / "latest.pt")
        if (epoch + 1) % 10 == 0 or epoch + 1 == args.epochs:
            torch.save(state, args.output_dir / f"epoch_{epoch + 1}.pt")


if __name__ == "__main__":
    main()
