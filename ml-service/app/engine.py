"""ResNet-50 embedding, five XGBoost regressors, and Grad-CAM on that embedding.

Grad-CAM (Selvaraju et al.) needs a scalar score. The biomass number itself comes
from XGBoost, which is not differentiable, so the score is the dot product of the
ResNet embedding and that model's per-feature contributions for this photo
(``pred_contribs`` on the 2048 embedding columns). Backpropagation of that score
into ``layer4``, then a global average of the gradients, is standard Grad-CAM.
The heatmap therefore changes with the measurement the user asked for, and it is
painted on the input photo.
"""

from __future__ import annotations

import io
import logging
import pickle
import threading
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import xgboost as xgb
from PIL import Image, UnidentifiedImageError
from torchvision import models, transforms

from . import config
from .features import (
    EMBEDDING_DIM,
    FEATURE_DIM,
    IMAGENET_MEAN,
    IMAGENET_STD,
    IMAGE_SIZE,
    green_feature_dict,
    green_features,
    stack_features,
)
from .targets import BY_SLUG, UNITS, Target

logger = logging.getLogger(__name__)

TRANSFORM = transforms.Compose([
    transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

GRADCAM_SUMMARY = (
    "Grad-CAM on the shared ResNet-50. Brighter regions pushed the embedding "
    "in the direction this XGBoost model used for the prediction."
)


class InferenceError(ValueError):
    """The photo cannot be scored. Safe to show to the caller."""


class ResNetBackbone(nn.Module):
    """Same wrapper ``run.py`` defines: ResNet-50 with the classifier removed.

    The class has to exist under this name so a ``backbone_full.pt`` saved from
    that script (or a notebook ``__main__``) can be unpickled.
    """

    def __init__(self):
        super().__init__()
        self.model = models.resnet50(weights=None)
        self.model.fc = nn.Identity()

    def forward(self, x):
        return self.model(x)


class _CompatUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if name in {"ResNetBackbone", "CNNBackbone"}:
            return ResNetBackbone
        return super().find_class(module, name)


class _CompatPickle:
    Unpickler = _CompatUnpickler

    @staticmethod
    def load(file, **kwargs):
        accepted = {key: kwargs[key] for key in ("encoding", "errors") if key in kwargs}
        return _CompatUnpickler(file, **accepted).load()

    @staticmethod
    def dump(*_args, **_kwargs):
        raise NotImplementedError


def _disable_inplace_relu(module: nn.Module) -> None:
    for child in module.modules():
        if isinstance(child, nn.ReLU):
            child.inplace = False


def _is_state_dict(obj) -> bool:
    if not isinstance(obj, dict) or not obj:
        return False
    tensors = [value for value in obj.values() if torch.is_tensor(value)]
    return len(tensors) >= max(1, int(0.8 * len(obj)))


def _fresh_resnet(kind: str) -> nn.Module:
    if kind == "raw":
        module = models.resnet50(weights=None)
        module.fc = nn.Identity()
        return module
    return ResNetBackbone()


def _load_state_dict(state: dict) -> nn.Module:
    cleaned = {key.removeprefix("module."): value for key, value in state.items() if torch.is_tensor(value)}
    stripped = {key.removeprefix("model."): value for key, value in cleaned.items()}
    # Each attempt gets a new module so a rejected load cannot clobber an earlier one.
    attempts = (
        ("wrapper", "model", cleaned),
        ("wrapper", "inner", cleaned),
        ("wrapper", "inner", stripped),
        ("raw", "raw", cleaned),
        ("raw", "raw", stripped),
    )
    for kind, where, weights in attempts:
        module = _fresh_resnet(kind)
        destination = module.model if where == "inner" else module
        try:
            incompatible = destination.load_state_dict(weights, strict=False)
        except RuntimeError:
            continue
        missing = [key for key in incompatible.missing_keys if not key.startswith("fc.")]
        unexpected = [key for key in incompatible.unexpected_keys if not key.startswith("fc.")]
        if len(missing) + len(unexpected) <= 20:
            return module
    raise RuntimeError("Backbone state dict does not match ResNet-50")


def _load_checkpoint(path: Path):
    try:
        return torch.load(path, map_location="cpu", weights_only=False)
    except Exception as first:
        try:
            return torch.load(path, map_location="cpu", weights_only=False, pickle_module=_CompatPickle)
        except Exception:
            raise first


def load_backbone(path: Path) -> tuple[nn.Module, dict]:
    """Load ``backbone_full.pt`` when it exists, otherwise ImageNet ResNet-50.

    The XGBoost models were fit on embeddings from the saved backbone. ImageNet
    weights match the architecture in ``run.py`` (``resnet50(pretrained=True)``
    with ``fc = Identity``) but not a fine-tuned checkpoint.
    """
    if path.is_file():
        loaded = _load_checkpoint(path)
        if isinstance(loaded, nn.Module):
            module = loaded
        elif isinstance(loaded, dict):
            for key in ("state_dict", "model", "backbone"):
                if key in loaded and (isinstance(loaded[key], nn.Module) or _is_state_dict(loaded[key])):
                    loaded = loaded[key]
                    break
            module = loaded if isinstance(loaded, nn.Module) else _load_state_dict(loaded)
        else:
            raise RuntimeError(f"Unrecognised backbone checkpoint type: {type(loaded).__name__}")
        info = {
            "architecture": "resnet50",
            "embedding_dim": EMBEDDING_DIM,
            "source": "checkpoint",
            "path": str(path),
            "warning": None,
        }
        logger.info("Loaded ResNet backbone from %s", path)
        return module, info

    logger.warning("No backbone checkpoint at %s; using ImageNet ResNet-50", path)
    module = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V1)
    module.fc = nn.Identity()
    info = {
        "architecture": "resnet50",
        "embedding_dim": EMBEDDING_DIM,
        "source": "torchvision-imagenet1k-v1",
        "path": None,
        "warning": (
            f"backbone_full.pt was not found at {path}. Predictions use an ImageNet "
            "ResNet-50 with the classifier removed, which is the architecture in run.py, "
            "not a fine-tuned embedding checkpoint. Place backbone_full.pt at that path "
            "and restart the service to score photos with the backbone the XGBoost models were trained on."
        ),
    }
    return module, info


def _find_layer4(module: nn.Module) -> tuple[str, nn.Module]:
    matches = [(name, child) for name, child in module.named_modules() if name.split(".")[-1] == "layer4"]
    if not matches:
        raise RuntimeError("ResNet layer4 was not found; Grad-CAM needs the last convolutional block")
    matches.sort(key=lambda item: sum(parameter.numel() for parameter in item[1].parameters()), reverse=True)
    return matches[0]


def _jet(values: np.ndarray) -> np.ndarray:
    """Map ``values`` in 0..1 to an RGB jet colormap. Shape ``(..., 3)`` float in 0..1."""
    red = np.clip(1.5 - np.abs(4 * values - 3), 0, 1)
    green = np.clip(1.5 - np.abs(4 * values - 2), 0, 1)
    blue = np.clip(1.5 - np.abs(4 * values - 1), 0, 1)
    return np.stack((red, green, blue), axis=-1)


def render_overlay(image: Image.Image, cam: np.ndarray, max_side: int) -> bytes:
    """Draw the Grad-CAM map on the input photo and return a JPEG."""
    display = image.convert("RGB")
    display.thumbnail((max_side, max_side))
    heat = np.asarray(cam, dtype=np.float32)
    heat = np.clip(heat, 0, 1)
    if float(heat.max() - heat.min()) < 1e-8:
        blended = np.asarray(display)
    else:
        heat_image = Image.fromarray(np.uint8(heat * 255), mode="L").resize(display.size, Image.BILINEAR)
        heat_np = np.asarray(heat_image, dtype=np.float32) / 255.0
        color = _jet(heat_np) * 255.0
        alpha = (0.15 + 0.55 * heat_np)[..., None]
        base = np.asarray(display, dtype=np.float32)
        blended = np.uint8(np.clip(base * (1 - alpha) + color * alpha, 0, 255))
    buffer = io.BytesIO()
    Image.fromarray(blended, mode="RGB").save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()


def _resolve_weights(weights_dir: Path, target: Target) -> Path:
    for name in target.filenames:
        path = weights_dir / name
        if path.is_file():
            return path
    tried = ", ".join(str(weights_dir / name) for name in target.filenames)
    raise FileNotFoundError(f"No XGBoost file for {target.name}. Looked for {tried}")


class BiomassEngine:
    def __init__(self, weights_dir: Path | None = None, backbone_path: Path | None = None, device: str | None = None):
        self.weights_dir = Path(weights_dir or config.WEIGHTS_DIR)
        self.backbone_path = Path(backbone_path or config.BACKBONE_PATH)
        self.device = torch.device(device or config.DEVICE)
        self.backbone: nn.Module | None = None
        self.layer_name = ""
        self.layer4: nn.Module | None = None
        self.models: dict[str, xgb.Booster] = {}
        self.backbone_info: dict = {}
        self._lock = threading.Lock()

    def load(self) -> None:
        if not self.weights_dir.is_dir():
            raise FileNotFoundError(f"Weights directory not found: {self.weights_dir}")
        module, info = load_backbone(self.backbone_path)
        _disable_inplace_relu(module)
        module.eval()
        for parameter in module.parameters():
            parameter.requires_grad_(False)
        module.to(self.device)
        layer_name, layer4 = _find_layer4(module)
        self.backbone = module
        self.layer_name = layer_name
        self.layer4 = layer4
        self.backbone_info = info
        loaded = {}
        for target in BY_SLUG.values():
            path = _resolve_weights(self.weights_dir, target)
            # Native booster, not the sklearn wrapper: save_model writes this format
            # and the wrapper would pull scikit-learn in at import time.
            booster = xgb.Booster()
            booster.load_model(str(path))
            loaded[target.slug] = booster
            logger.info("Loaded %s from %s", target.name, path.name)
        self.models = loaded

    @property
    def ready(self) -> bool:
        return self.backbone is not None and len(self.models) == len(BY_SLUG)

    def predict(self, image: Image.Image, slug: str) -> dict:
        if not self.ready:
            raise RuntimeError("Models are not loaded")
        target = BY_SLUG.get(slug)
        if target is None:
            raise InferenceError(f"Unknown target '{slug}'")
        with self._lock:
            return self._predict_locked(image, target)

    def _predict_locked(self, image: Image.Image, target: Target) -> dict:
        try:
            rgb = image.convert("RGB")
        except Exception as exc:
            raise InferenceError("Could not read that image as RGB") from exc
        green = green_features(rgb)
        tensor = TRANSFORM(rgb).unsqueeze(0).to(self.device)
        tensor.requires_grad_(True)

        activations: dict[str, torch.Tensor] = {}

        def _capture(_module, _inputs, output):
            activations["value"] = output

        handle = self.layer4.register_forward_hook(_capture)
        try:
            with torch.enable_grad():
                embedding = self.backbone(tensor)
                if "value" not in activations:
                    raise RuntimeError("Grad-CAM hook did not see layer4 activations")
                embedding_flat = embedding.reshape(embedding.shape[0], -1)
                if embedding_flat.shape != (1, EMBEDDING_DIM):
                    raise RuntimeError(
                        f"Expected a {EMBEDDING_DIM}-d ResNet embedding, got {tuple(embedding_flat.shape)}"
                    )
                numpy_embedding = embedding_flat.detach().float().cpu().numpy().reshape(-1)
                features = stack_features(numpy_embedding, green)
                matrix = xgb.DMatrix(features)
                booster = self.models[target.slug]
                prediction = float(booster.predict(matrix)[0])
                contributions = _embedding_contributions(booster, matrix, numpy_embedding)
                weights = torch.as_tensor(contributions, device=embedding_flat.device, dtype=embedding_flat.dtype)
                score = torch.sum(embedding_flat.reshape(-1) * weights)
                gradients = torch.autograd.grad(score, activations["value"])[0]
                cam = _grad_cam(activations["value"], gradients)
        finally:
            handle.remove()

        if not np.isfinite(prediction):
            raise RuntimeError(f"{target.name} returned a non-finite prediction")
        overlay = render_overlay(rgb, cam, config.GRADCAM_MAX_SIDE)
        return {
            "target": target.name,
            "target_slug": target.slug,
            "label": target.label,
            "prediction": prediction,
            "units": UNITS,
            "green_features": green_feature_dict(green),
            "embedding_dim": EMBEDDING_DIM,
            "feature_dim": FEATURE_DIM,
            "image_size": [rgb.width, rgb.height],
            "backbone": self.backbone_info,
            "gradcam": {
                "method": "grad-cam",
                "layer": self.layer_name,
                "score": "dot(resnet_embedding, xgboost_feature_contributions)",
                "summary": GRADCAM_SUMMARY,
                "content_type": "image/jpeg",
                "image_jpeg": overlay,
            },
            "note": self.backbone_info.get("warning"),
        }


def _embedding_contributions(booster: xgb.Booster, matrix: xgb.DMatrix, embedding: np.ndarray) -> np.ndarray:
    """Signed contribution of each of the 2048 embedding columns for this photo.

    Falls back to the embedding itself when a model reports no embedding
    contribution, which makes the score ``||embedding||^2``.
    """
    contributions = np.asarray(booster.predict(matrix, pred_contribs=True), dtype=np.float64)
    contributions = contributions.reshape(-1)
    if contributions.shape[0] < EMBEDDING_DIM:
        raise RuntimeError(f"Expected at least {EMBEDDING_DIM} feature contributions, got {contributions.shape[0]}")
    weights = contributions[:EMBEDDING_DIM].astype(np.float32)
    if float(np.abs(weights).sum()) < 1e-8:
        weights = embedding.astype(np.float32)
    return weights


def _grad_cam(activations: torch.Tensor, gradients: torch.Tensor) -> np.ndarray:
    """Standard Grad-CAM: ReLU of the channel-weighted feature maps.

    Channel weights are the spatial mean of ``d(score)/d(activations)``.
    """
    weights = gradients.detach().mean(dim=(2, 3), keepdim=True)
    camera = torch.relu((weights * activations.detach()).sum(dim=1))[0]
    camera = torch.nan_to_num(camera.float(), nan=0.0, posinf=0.0, neginf=0.0).cpu().numpy()
    low = float(camera.min())
    high = float(camera.max())
    if high - low < 1e-8:
        return np.zeros_like(camera, dtype=np.float32)
    return ((camera - low) / (high - low)).astype(np.float32)


def open_image(content: bytes) -> Image.Image:
    if not content:
        raise InferenceError("The uploaded file is empty")
    if len(content) > 20 * 1024 * 1024:
        raise InferenceError("Image is larger than 20 MB")
    try:
        with Image.open(io.BytesIO(content)) as source:
            source.load()
            rgb = source.convert("RGB")
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        raise InferenceError("Upload a JPEG, PNG, or WebP photo") from exc
    if rgb.width < 8 or rgb.height < 8:
        raise InferenceError("Image is too small")
    return rgb
