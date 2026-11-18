"""Feature vector shared by all five biomass models.

This follows the inference block in ``Biomass_prediciton/run.py`` exactly.

The model input is one RGB pasture photo. Nothing else (no height, NDVI, species,
or state) is required at inference time. From that photo the script builds a
2052-d vector:

* 2048 numbers: ResNet-50 embedding. The photo is converted to RGB, resized to
  224x224, scaled to 0..1 by ``ToTensor``, then normalized with ImageNet mean
  ``(0.485, 0.456, 0.406)`` and std ``(0.229, 0.224, 0.225)``. The network's
  classification layer is ``Identity``, so the vector is the global average pool
  of the last convolutional block (2048 channels).
* 4 numbers, computed on the original pixels in 0..255, not on the resized or
  normalized tensor:
  - mean of excess green, ``2G - R - B``
  - population standard deviation of excess green
  - mean of excess-green pixels at or above the 90th percentile
  - mean of a GNDVI proxy, ``(G - R) / (G + R + 1e-6)``

``hstack([embedding, green])`` is the matrix every XGBoost model was trained on.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

EMBEDDING_DIM = 2048
GREEN_NAMES = ("exg_mean", "exg_std", "exg_top10", "gndvi_mean")
FEATURE_DIM = EMBEDDING_DIM + len(GREEN_NAMES)

IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)
IMAGE_SIZE = 224


def green_features(image: Image.Image) -> np.ndarray:
    """Four vegetation statistics from the original RGB image. Shape ``(4,)`` float32."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    if rgb.ndim != 3 or rgb.shape[2] != 3 or rgb.shape[0] < 1 or rgb.shape[1] < 1:
        raise ValueError("Expected a non-empty RGB image")
    red = rgb[..., 0]
    green = rgb[..., 1]
    blue = rgb[..., 2]
    excess_green = 2 * green - red - blue
    top = excess_green[excess_green >= np.percentile(excess_green, 90)]
    gndvi = (green - red) / (green + red + 1e-6)
    return np.array(
        [excess_green.mean(), excess_green.std(), top.mean(), gndvi.mean()],
        dtype=np.float32,
    )


def green_feature_dict(values: np.ndarray) -> dict[str, float]:
    return {name: float(values[index]) for index, name in enumerate(GREEN_NAMES)}


def stack_features(embedding: np.ndarray, green: np.ndarray) -> np.ndarray:
    """Return shape ``(1, 2052)`` float32, embedding columns first."""
    vector = np.concatenate([np.asarray(embedding, dtype=np.float32).reshape(-1),
                             np.asarray(green, dtype=np.float32).reshape(-1)])
    if vector.shape != (FEATURE_DIM,):
        raise ValueError(f"Expected {FEATURE_DIM} features, got shape {vector.shape}")
    return vector.reshape(1, -1)
