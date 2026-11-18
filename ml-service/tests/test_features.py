"""Locks the vegetation features to the formula in Biomass_prediciton/run.py."""

from __future__ import annotations

import numpy as np
from PIL import Image

from app.features import FEATURE_DIM, green_features, stack_features


def test_green_features_match_the_inference_script():
    rgb = np.zeros((4, 5, 3), dtype=np.uint8)
    rgb[..., 0] = 10
    rgb[..., 1] = 40
    rgb[..., 2] = 5
    rgb[0, 0] = (255, 0, 0)
    image = Image.fromarray(rgb, mode="RGB")

    pixels = np.asarray(image, dtype=np.float32)
    red, green, blue = pixels[..., 0], pixels[..., 1], pixels[..., 2]
    excess = 2 * green - red - blue
    expected = np.array([
        excess.mean(),
        excess.std(),
        excess[excess >= np.percentile(excess, 90)].mean(),
        ((green - red) / (green + red + 1e-6)).mean(),
    ], dtype=np.float32)

    np.testing.assert_allclose(green_features(image), expected, rtol=1e-6, atol=1e-6)


def test_stack_puts_embedding_before_green_features():
    embedding = np.arange(2048, dtype=np.float32)
    green = np.array([1, 2, 3, 4], dtype=np.float32)
    stacked = stack_features(embedding, green)
    assert stacked.shape == (1, FEATURE_DIM)
    assert stacked[0, 0] == 0
    assert stacked[0, 2047] == 2047
    np.testing.assert_array_equal(stacked[0, 2048:], green)
