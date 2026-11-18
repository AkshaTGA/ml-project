from __future__ import annotations

import random
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image
from sklearn.preprocessing import LabelEncoder
from torch.utils.data import Dataset
from torchvision import transforms

TARGET_NAMES = ["Dry_Clover_g", "Dry_Dead_g", "Dry_Green_g", "Dry_Total_g", "GDM_g"]
TARGET_NAME_TO_ID = {name: index for index, name in enumerate(TARGET_NAMES)}
IMAGE_SIZE = 224


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def image_transform():
    return transforms.Compose([
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize((0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
    ])


def encode_metadata(frame: pd.DataFrame, encoders=None):
    frame = frame.copy()
    encoders = encoders or {}
    for column in ("Species", "State"):
        if column in frame:
            if column not in encoders:
                encoders[column] = LabelEncoder().fit(frame[column].astype(str))
            frame[column] = encoders[column].transform(frame[column].astype(str))
    return frame, encoders


def prepare_training_table(frame: pd.DataFrame) -> pd.DataFrame:
    required = {"image_path", "target_name", "target", "Species", "State"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Training CSV is missing required columns: {sorted(missing)}")
    frame = frame.copy()
    frame["target_name"] = frame["target_name"].map(TARGET_NAME_TO_ID)
    if frame["target_name"].isna().any():
        raise ValueError("Training CSV contains an unknown target_name")
    frame["target_name"] = frame["target_name"].astype("int64")
    return frame


def resolve_image(root: Path, image_path: str) -> Path:
    path = Path(str(image_path))
    return path if path.is_absolute() else root / path


class BiomassDataset(Dataset):
    def __init__(self, frame, data_root, transform=None, training=True):
        self.frame = frame.reset_index(drop=True)
        self.data_root = Path(data_root)
        self.transform = transform or image_transform()
        self.training = training

    def __len__(self):
        return len(self.frame)

    def __getitem__(self, index):
        row = self.frame.iloc[index]
        path = resolve_image(self.data_root, row["image_path"])
        with Image.open(path) as source:
            image = self.transform(source.convert("RGB"))
        item = {
            "image": image,
            "target_name": torch.tensor(int(row["target_name"]), dtype=torch.long),
        }
        if self.training:
            item.update({
                "target": torch.tensor(float(row["target"]), dtype=torch.float32),
                "species": torch.tensor(int(row["Species"]), dtype=torch.long),
                "state": torch.tensor(int(row["State"]), dtype=torch.long),
                "height": torch.tensor(float(row.get("Height_Ave_cm", 0.0)), dtype=torch.float32),
                "aux": torch.tensor(float(row.get("Pre_GSHH_NDVI", 0.0)), dtype=torch.float32),
            })
        else:
            item["sample_id"] = str(row["sample_id"])
        return item


def weighted_r2(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=np.float64)
    y_pred = np.asarray(y_pred, dtype=np.float64)
    denominator = np.sum((y_true - y_true.mean()) ** 2)
    return float(1.0 - np.sum((y_true - y_pred) ** 2) / denominator) if denominator else float("nan")


def load_checkpoint(path, device):
    try:
        return torch.load(path, map_location=device, weights_only=False)
    except TypeError:
        return torch.load(path, map_location=device)

