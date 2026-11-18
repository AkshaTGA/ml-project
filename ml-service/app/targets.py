"""One catalogue entry per trained XGBoost model.

`Biomass_prediciton/run.py` saves each model as ``xgb_{name}.json`` after dropping
only the underscore before the trailing ``g``:

    base = target_name[::-1].replace("_", "", 1)[::-1]

So ``Dry_Clover_g`` is stored as ``xgb_Dry_Cloverg.json`` and ``GDM_g`` as ``xgb_GDMg.json``.
The GDM file in this workspace was downloaded as ``xgb_GDMg (1).json``.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Target:
    name: str
    slug: str
    label: str
    filenames: tuple[str, ...]


TARGETS: tuple[Target, ...] = (
    Target("Dry_Clover_g", "dry-clover", "Clover", ("xgb_Dry_Cloverg.json",)),
    Target("Dry_Dead_g", "dry-dead", "Dead material", ("xgb_Dry_Deadg.json",)),
    Target("Dry_Green_g", "dry-green", "Green vegetation", ("xgb_Dry_Greeng.json",)),
    Target("Dry_Total_g", "dry-total", "Total dry matter", ("xgb_Dry_Totalg.json",)),
    Target("GDM_g", "gdm", "Green dry matter", ("xgb_GDMg.json", "xgb_GDMg (1).json")),
)

BY_SLUG = {target.slug: target for target in TARGETS}
BY_NAME = {target.name: target for target in TARGETS}

UNITS = "grams of dry matter per sample quadrat"
