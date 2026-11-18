"""End-to-end check: five model routes, feature vector, and a Grad-CAM JPEG on the photo."""

from __future__ import annotations

import base64
import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.targets import TARGETS


def pasture_photo() -> bytes:
    rng = np.random.default_rng(0)
    canvas = np.zeros((240, 320, 3), dtype=np.int16)
    canvas[:, :160] = (30, 150, 45)
    canvas[:, 160:] = (130, 85, 40)
    canvas += rng.integers(-12, 13, size=canvas.shape)
    image = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), mode="RGB")
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    return buffer.getvalue()


def main() -> None:
    photo = pasture_photo()
    predictions = {}
    with TestClient(app) as client:
        health = client.get("/health")
        health.raise_for_status()
        print("health", health.json()["status"], health.json()["backbone"]["source"])
        listed = client.get("/targets")
        listed.raise_for_status()
        assert [item["target_slug"] for item in listed.json()] == [target.slug for target in TARGETS]

        empty = client.post("/targets/dry-green/predict", files={"image": ("empty.jpg", b"", "image/jpeg")})
        assert empty.status_code == 400, empty.text

        overlays = {}
        for target in TARGETS:
            response = client.post(
                f"/targets/{target.slug}/predict",
                files={"image": ("pasture.jpg", photo, "image/jpeg")},
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["target"] == target.name
            assert body["feature_dim"] == 2052
            assert set(body["green_features"]) == {"exg_mean", "exg_std", "exg_top10", "gndvi_mean"}
            assert body["gradcam"]["method"] == "grad-cam"
            jpeg = base64.b64decode(body["gradcam"]["image_base64"])
            assert jpeg[:2] == b"\xff\xd8"
            decoded = np.asarray(Image.open(io.BytesIO(jpeg)).convert("RGB"))
            assert decoded.std() > 5, "Grad-CAM overlay looks blank"
            overlays[target.slug] = decoded
            predictions[target.name] = body["prediction"]
            print(f"{target.name:16} {body['prediction']:10.3f}  exg_mean={body['green_features']['exg_mean']:.2f}")

        assert len({round(value, 3) for value in predictions.values()}) > 1, predictions
        difference = np.abs(overlays["dry-green"].astype(np.float32) - overlays["dry-dead"].astype(np.float32)).mean()
        print(f"gradcam mean abs diff (green vs dead): {difference:.3f}")
        assert difference > 0.1, "Grad-CAM did not change with the selected model"

        Image.fromarray(overlays["dry-green"]).save("/tmp/gradcam-dry-green.jpg", quality=90)
        Image.fromarray(overlays["dry-dead"]).save("/tmp/gradcam-dry-dead.jpg", quality=90)
        print("saved /tmp/gradcam-dry-green.jpg and /tmp/gradcam-dry-dead.jpg")


if __name__ == "__main__":
    main()
