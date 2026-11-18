from __future__ import annotations

from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
import timm

from utils import TARGET_NAMES


def patch_to_tiles(x, tile_h, tile_w):
    batch, height, width, channels = x.shape
    if height % tile_h or width % tile_w:
        raise ValueError("Token grid dimensions must be divisible by the tile dimensions")
    x = x.reshape(batch, height // tile_h, tile_h, width // tile_w, tile_w, channels)
    x = x.mean(dim=(2, 4))
    return x.reshape(batch, -1, channels)


class VegetationIndex(nn.Module):
    def forward(self, image):
        red, green, blue = image[:, 0], image[:, 1], image[:, 2]
        exg = 2 * green - red - blue
        exg = F.interpolate(exg.unsqueeze(1), size=(14, 14), mode="bilinear", align_corners=False)
        return exg.squeeze(1)


class CrossAttention(nn.Module):
    def __init__(self, dim, heads):
        super().__init__()
        self.attn = nn.MultiheadAttention(dim, heads, batch_first=True)
        self.norm = nn.LayerNorm(dim)

    def forward(self, query, key_value):
        output, _ = self.attn(query, key_value, key_value, need_weights=False)
        return self.norm(output + query)


class BiomassModel(nn.Module):
    def __init__(self, num_species, num_states, dino_checkpoint, embed_dim=384, num_heads=6, target_emb_dim=128):
        super().__init__()
        checkpoint_path = Path(dino_checkpoint)
        if not checkpoint_path.is_file():
            raise FileNotFoundError(
                f"DINO checkpoint not found: {checkpoint_path}. Pass --dino-checkpoint or set DINO_CHECKPOINT."
            )
        self.dino = timm.create_model("vit_small_patch16_224", pretrained=False, num_classes=0)
        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        if isinstance(checkpoint, dict):
            for key in ("state_dict", "model", "teacher"):
                if key in checkpoint and isinstance(checkpoint[key], dict):
                    checkpoint = checkpoint[key]
                    break
        checkpoint = {key.removeprefix("module."): value for key, value in checkpoint.items()}
        self.dino.load_state_dict(checkpoint, strict=False)
        for parameter in self.dino.parameters():
            parameter.requires_grad = False
        self.dino.eval()

        self.veg = VegetationIndex()
        self.local_proj = nn.Sequential(nn.Linear(embed_dim + 1, embed_dim), nn.ReLU(), nn.LayerNorm(embed_dim))
        self.global_proj = nn.Sequential(nn.Linear(embed_dim + 1, embed_dim), nn.ReLU(), nn.LayerNorm(embed_dim))
        self.local_attn = CrossAttention(embed_dim, num_heads)
        self.global_attn = CrossAttention(embed_dim, num_heads)
        self.token_pool = nn.Linear(embed_dim, 1)
        self.target_embedding = nn.Embedding(len(TARGET_NAMES), target_emb_dim)
        self.target_proj = nn.Linear(target_emb_dim, embed_dim)
        fused_dim = 4 * embed_dim
        self.biomass_head = nn.Sequential(nn.Linear(fused_dim, 512), nn.ReLU(), nn.Linear(512, 1))
        self.height_head = nn.Linear(fused_dim, 1)
        self.aux_head = nn.Linear(fused_dim, 1)
        self.species_head = nn.Linear(fused_dim, num_species)
        self.state_head = nn.Linear(fused_dim, num_states)

    def train(self, mode=True):
        super().train(mode)
        self.dino.eval()
        return self

    def forward(self, image, target_name_id):
        with torch.no_grad():
            tokens = self.dino.forward_features(image)[:, 1:, :]
        batch = image.size(0)
        tokens = tokens.reshape(batch, 14, 14, -1)
        local_tokens = patch_to_tiles(tokens, 2, 2)
        global_tokens = patch_to_tiles(tokens, 7, 7)
        exg = self.veg(image).unsqueeze(-1)
        local_exg = patch_to_tiles(exg, 2, 2)
        global_exg = patch_to_tiles(exg, 7, 7)
        local_tokens = self.local_proj(torch.cat((local_tokens, local_exg), dim=-1))
        global_tokens = self.global_proj(torch.cat((global_tokens, global_exg), dim=-1))
        global_tokens = self.global_attn(global_tokens, local_tokens)
        local_tokens = self.local_attn(local_tokens, global_tokens)
        all_tokens = torch.cat((global_tokens, local_tokens), dim=1)
        weights = F.softmax(self.token_pool(all_tokens), dim=1)
        pooled = torch.cat((
            (weights * all_tokens).sum(dim=1),
            all_tokens.mean(dim=1),
            all_tokens.max(dim=1).values,
        ), dim=1)
        target = self.target_proj(self.target_embedding(target_name_id))
        fused = torch.cat((pooled, target), dim=1)
        return {
            "biomass": self.biomass_head(fused).squeeze(1),
            "height": self.height_head(fused).squeeze(1),
            "aux": self.aux_head(fused).squeeze(1),
            "species": self.species_head(fused),
            "state": self.state_head(fused),
        }

