"""Farm dashboard: weather, farming alerts, mandi prices for the user's crops, recent activity."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends

from .. import db, memory, profiles
from ..auth import current_user
from ..tools import fetch_weather, get_mandi_prices

router = APIRouter()


def farming_alerts(weather: dict, profile: dict) -> list[dict]:
    daily = weather.get("daily") or {}
    days = daily.get("time") or []
    rain = daily.get("precipitation_sum") or []
    rain_chance = daily.get("precipitation_probability_max") or []
    t_max = daily.get("temperature_2m_max") or []
    t_min = daily.get("temperature_2m_min") or []
    has_animals = any((profile.get("livestock") or {}).values())
    alerts = []

    heavy = [d for d, r in zip(days[:3], rain[:3]) if (r or 0) >= 10]
    if heavy:
        alerts.append({"level": "warning", "kind": "rain", "date": heavy[0],
                       "title": "Heavy rain expected",
                       "message": "Postpone pesticide/fertiliser spraying and keep field drainage clear."})
    elif rain_chance[:2] and max(p or 0 for p in rain_chance[:2]) < 20 and (t_max[:1] or [0])[0] > 30:
        alerts.append({"level": "info", "kind": "irrigation", "date": days[0],
                       "title": "Dry and warm next 2 days",
                       "message": "Good spraying window. Check soil moisture and plan irrigation."})
    hot = [d for d, t in zip(days, t_max) if (t or 0) >= 38]
    if hot:
        alerts.append({"level": "warning", "kind": "heat", "date": hot[0], "title": "Heat stress risk",
                       "message": "Give animals shade and extra water; irrigate crops in the evening."
                       if has_animals else "Irrigate in the evening and mulch to save soil moisture."})
    cold = [d for d, t in zip(days, t_min) if t is not None and t <= 4]
    if cold:
        alerts.append({"level": "warning", "kind": "frost", "date": cold[0], "title": "Frost risk",
                       "message": "Light irrigation in the evening and smoke at night protect crops from frost."})
    return alerts


async def _safe(coro, default=None):
    try:
        return await asyncio.wait_for(coro, timeout=12)
    except Exception:
        return default


@router.get("/dashboard")
async def dashboard(user_id: str = Depends(current_user)):
    profile = await profiles.get(user_id) or {}
    has_location = profile.get("lat") is not None
    crops = (profile.get("crops") or [])[:3]

    weather, threads, facts, *prices = await asyncio.gather(
        _safe(fetch_weather(profile["lat"], profile["lon"])) if has_location else asyncio.sleep(0, None),
        db.fetch("SELECT id, title, updated_at FROM threads WHERE user_id = %s ORDER BY updated_at DESC LIMIT 5",
                 user_id),
        _safe(memory.list_memories(user_id), []),
        *(_safe(get_mandi_prices.ainvoke({"commodity": crop})) for crop in crops),
    )
    mandi = []
    for crop, raw in zip(crops, prices):
        data = json.loads(raw) if raw else {}
        rows = [p for p in data.get("prices", []) if p.get("modal")]
        mandi.append({"commodity": crop, "source": data.get("source"),
                      "modal": round(sum(p["modal"] for p in rows) / len(rows)) if rows else None,
                      "markets": rows[:3]})
    return {
        "profile": profile,
        "weather": weather,
        "alerts": farming_alerts(weather, profile) if weather else [],
        "mandi": mandi,
        "recent_threads": threads,
        "memory_count": len(facts),
        "recent_memories": [m["text"] for m in facts[:4]],
    }
