"""Farm profiles collected at onboarding (long-term structured memory), cached in-process."""
from __future__ import annotations

import json

from . import db
from .clients import TTLCache

EDITABLE = ("name", "language", "role", "location_name", "lat", "lon", "land_area", "land_unit", "crops",
            "livestock", "irrigation", "soil", "goals", "custom_instructions", "voice_settings")
MAX_INSTRUCTIONS = 1500

_cache = TTLCache(ttl_seconds=600)


def _clean(profile: dict | None) -> dict | None:
    if profile is None:
        return None
    out = dict(profile)
    for key in ("onboarded_at", "updated_at"):
        if out.get(key) is not None:
            out[key] = out[key].isoformat()
    return out


async def get(user_id: str) -> dict | None:
    cached = _cache.get(user_id)
    if cached is not None:
        return cached or None
    profile = _clean(await db.fetchrow("SELECT * FROM profiles WHERE user_id = %s", user_id))
    _cache.set(user_id, profile or {})
    return profile


async def upsert(user_id: str, fields: dict, onboarded: bool = False) -> dict:
    fields = {k: v for k, v in fields.items() if k in EDITABLE}
    if "custom_instructions" in fields:
        fields["custom_instructions"] = (fields["custom_instructions"] or "")[:MAX_INSTRUCTIONS]
    for key in ("livestock", "voice_settings"):
        if key in fields:
            fields[key] = json.dumps(fields[key] or {})
    columns = ", ".join(["user_id", *fields, "onboarded_at"])
    placeholders = ", ".join(["%s"] * (len(fields) + 1) + ["now()" if onboarded else "NULL"])
    updates = [f"{c} = EXCLUDED.{c}" for c in fields] + ["updated_at = now()"]
    if onboarded:
        updates.append("onboarded_at = COALESCE(profiles.onboarded_at, now())")
    await db.execute(
        f"INSERT INTO profiles ({columns}) VALUES ({placeholders}) "
        f"ON CONFLICT (user_id) DO UPDATE SET {', '.join(updates)}",
        user_id, *fields.values(),
    )
    _cache.delete(user_id)
    return await get(user_id)


def describe(profile: dict | None) -> str:
    """Compact text version of the profile for the system prompt."""
    if not profile:
        return "No farm profile yet."
    lines = []
    if profile.get("name"):
        lines.append(f"Name: {profile['name']}")
    if profile.get("role"):
        lines.append(f"Role: {profile['role']}")
    if profile.get("location_name"):
        lines.append(f"Location: {profile['location_name']}")
    if profile.get("land_area"):
        lines.append(f"Land: {profile['land_area']:g} {profile.get('land_unit') or 'acre'}")
    if profile.get("crops"):
        lines.append(f"Crops: {', '.join(profile['crops'])}")
    livestock = {k: v for k, v in (profile.get("livestock") or {}).items() if v}
    if livestock:
        lines.append("Livestock: " + ", ".join(f"{v} {k}" for k, v in livestock.items()))
    for key, label in (("irrigation", "Irrigation"), ("soil", "Soil"), ("goals", "Goals / challenges")):
        if profile.get(key):
            lines.append(f"{label}: {profile[key]}")
    if profile.get("language"):
        lines.append(f"Preferred language: {profile['language']}")
    return "\n".join(lines) or "No farm profile yet."
