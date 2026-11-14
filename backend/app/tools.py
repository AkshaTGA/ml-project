"""Tools available to the agent. The signed-in user's id arrives through the run config,
so the model can never act on another user's data."""
from __future__ import annotations

import asyncio
import json
from typing import Literal

import httpx
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from . import files, memory, profiles
from .clients import TTLCache, http
from .config import DATA_GOV_IN_API_KEY, MANDI_RESOURCE_ID, TAVILY_API_KEY
from .llm import fast_llm
from .model_client import ModelError, run_model

weather_cache = TTLCache(ttl_seconds=1800)
mandi_cache = TTLCache(ttl_seconds=6 * 3600)


def _dump(data) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)


def _user(config: RunnableConfig) -> str:
    return config["configurable"]["user_id"]


async def _call_model(config: RunnableConfig, model_id: str, inputs: dict) -> str:
    try:
        return _dump(await run_model(_user(config), model_id, inputs))
    except ModelError as exc:
        return _dump({"error": str(exc)})


# ---------- ML models ----------

@tool
async def predict_pasture_biomass(file_id: str, config: RunnableConfig) -> str:
    """Estimate pasture dry biomass from an uploaded top-down pasture/grass photo.
    Returns grams of dry matter for clover, dead material, green vegetation, green dry matter
    (GDM) and total, per sample quadrat. Use the file_id of an image the user uploaded."""
    return await _call_model(config, "biomass", {"image": file_id})


@tool
async def recommend_crop(nitrogen: float, phosphorus: float, potassium: float, temperature: float,
                         humidity: float, ph: float, rainfall: float, config: RunnableConfig) -> str:
    """Recommend crops for given soil and climate. nitrogen/phosphorus/potassium in kg/ha,
    temperature in C, humidity in %, ph of soil, rainfall in mm (seasonal).
    If the user has not given some values, ask for them or use the weather tool to fill climate."""
    inputs = {"nitrogen": nitrogen, "phosphorus": phosphorus, "potassium": potassium,
              "temperature": temperature, "humidity": humidity, "ph": ph, "rainfall": rainfall}
    return await _call_model(config, "crop", inputs)


@tool
async def assess_livestock_health(
    species: Literal["cattle", "buffalo", "goat", "sheep"],
    body_temperature: float,
    config: RunnableConfig,
    appetite: Literal["normal", "reduced", "none"] = "normal",
    symptoms: list[Literal["coughing", "nasal_discharge", "fast_breathing", "diarrhea", "bloating",
                           "lameness", "salivation", "mouth_blisters", "skin_lesions", "reduced_milk",
                           "swollen_udder", "weight_loss"]] | None = None,
) -> str:
    """Triage an animal's health: returns a risk level and possible conditions.
    body_temperature is rectal temperature in C."""
    return await _call_model(config, "livestock", {
        "species": species, "body_temperature": body_temperature,
        "appetite": appetite, "symptoms": symptoms or [],
    })


@tool
def estimate_grazing_days(total_biomass_g: float, paddock_area_ha: float, num_animals: int,
                          avg_liveweight_kg: float = 400, quadrat_area_m2: float = 0.21,
                          residual_kg_dm_per_ha: float = 1000, intake_pct_liveweight: float = 2.5,
                          utilisation: float = 0.7) -> str:
    """Convert a biomass prediction into how many days a paddock can feed a herd.
    total_biomass_g is Dry_Total_g (or GDM_g) from the biomass model for one quadrat
    (default quadrat 70cm x 30cm = 0.21 m2). residual is the pasture left ungrazed,
    intake is daily dry-matter intake as % of liveweight. 1 acre = 0.405 ha."""
    kg_dm_per_ha = total_biomass_g / quadrat_area_m2 * 10
    available = max(kg_dm_per_ha - residual_kg_dm_per_ha, 0) * paddock_area_ha * utilisation
    daily_demand = num_animals * avg_liveweight_kg * intake_pct_liveweight / 100
    days = available / daily_demand if daily_demand else 0
    return _dump({
        "pasture_kg_dm_per_ha": round(kg_dm_per_ha),
        "available_feed_kg_dm": round(available),
        "herd_daily_demand_kg_dm": round(daily_demand, 1),
        "grazing_days": round(days, 1),
    })


# ---------- Vision diagnosis ----------

class Diagnosis(BaseModel):
    crop: str = Field(description="Crop or plant identified")
    healthy: bool
    disease: str = Field(description="Most likely disease, pest or deficiency; 'None' if healthy")
    confidence: float = Field(ge=0, le=1)
    symptoms_seen: list[str]
    urgency: Literal["low", "medium", "high"]
    organic_treatment: list[str]
    chemical_treatment: list[str] = Field(description="Generic active ingredients with typical dose; no brands")
    prevention: list[str]
    other_possibilities: list[str] = Field(default_factory=list)


@tool
async def diagnose_plant_disease(file_id: str, config: RunnableConfig, crop: str | None = None,
                                 notes: str | None = None) -> str:
    """Diagnose disease, pest damage or nutrient deficiency from an uploaded photo of a leaf, plant
    or fruit. Returns the likely problem, confidence, urgency and organic/chemical treatments.
    crop and notes (e.g. symptoms the user described) are optional hints."""
    meta = await files.get_meta(_user(config), file_id)
    if meta is None or meta["kind"] != "image":
        return _dump({"error": "Image not found. Ask the user to upload a clear photo of the affected leaf."})
    hint = f"Crop: {crop}. " if crop else ""
    hint += f"Farmer notes: {notes}" if notes else ""
    message = HumanMessage(content=[
        {"type": "text", "text": "You are an expert plant pathologist in India. Diagnose this plant photo. "
                                 "Be honest about uncertainty; if the photo is unclear, say so with low confidence. "
                                 + hint},
        {"type": "image_url", "image_url": {"url": await files.image_data_url(meta, max_side=1280)}},
    ])
    # Fast vision model fills the structured card; the main reasoning model also sees the photo and reviews it.
    llm = fast_llm().with_structured_output(Diagnosis)
    try:
        result: Diagnosis = await llm.ainvoke([message])
    except Exception as exc:
        return _dump({"error": f"Diagnosis failed: {exc}"})
    return _dump({**result.model_dump(), "note": "AI visual diagnosis. Confirm with the local KVK for severe cases."})


# ---------- Market prices ----------

@tool
async def get_mandi_prices(commodity: str, state: str | None = None, district: str | None = None) -> str:
    """Latest wholesale mandi (APMC) prices in India for a commodity, e.g. 'Wheat', 'Onion', 'Tomato',
    optionally filtered by state and district. Prices are in Rs per quintal (min, max, modal)."""
    key = (commodity.lower(), (state or "").lower(), (district or "").lower())
    if (cached := mandi_cache.get(key)) is not None:
        return cached
    records = []
    if DATA_GOV_IN_API_KEY:
        params = {"api-key": DATA_GOV_IN_API_KEY, "format": "json", "limit": 25,
                  "filters[commodity]": commodity.title()}
        if state:
            params["filters[state]"] = state.title()
        if district:
            params["filters[district]"] = district.title()
        try:
            response = await http.get(f"https://api.data.gov.in/resource/{MANDI_RESOURCE_ID}",
                                      params=params, timeout=20)
            response.raise_for_status()
            records = response.json().get("records", [])
        except (httpx.HTTPError, ValueError):
            records = []
    if records:
        result = _dump({"source": "Agmarknet (data.gov.in)", "commodity": commodity, "prices": [
            {"market": r.get("market"), "district": r.get("district"), "state": r.get("state"),
             "variety": r.get("variety"), "date": r.get("arrival_date"),
             "min": _num(r.get("min_price")), "max": _num(r.get("max_price")), "modal": _num(r.get("modal_price"))}
            for r in records[:12]
        ]})
    else:
        where = ", ".join(filter(None, [district, state])) or "India"
        found = await _search(f"{commodity} mandi price today {where} per quintal")
        result = _dump({"source": "web search (live mandi API unavailable)", "commodity": commodity,
                        "web_results": found})
    mandi_cache.set(key, result)
    return result


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ---------- Web & weather ----------

async def _search(query: str):
    try:
        if TAVILY_API_KEY:
            response = await http.post("https://api.tavily.com/search",
                                       headers={"Authorization": f"Bearer {TAVILY_API_KEY}"},
                                       json={"query": query, "max_results": 5}, timeout=30)
            response.raise_for_status()
            return [{"title": r["title"], "url": r["url"], "snippet": r["content"]}
                    for r in response.json().get("results", [])]
        from ddgs import DDGS

        raw = await asyncio.to_thread(lambda: DDGS().text(query, max_results=5))
        return [{"title": r.get("title"), "url": r.get("href"), "snippet": r.get("body")} for r in raw]
    except Exception as exc:
        return {"error": f"Search failed: {exc}"}


@tool
async def web_search(query: str) -> str:
    """Search the web for up-to-date agricultural information: government schemes, pest outbreaks,
    best practices, news, etc. Returns titles, URLs and snippets. Cite the URLs you use."""
    return _dump(await _search(query))


async def fetch_weather(lat: float, lon: float) -> dict:
    key = (round(lat, 2), round(lon, 2))
    if (cached := weather_cache.get(key)) is not None:
        return cached
    response = await http.get("https://api.open-meteo.com/v1/forecast", params={
        "latitude": lat, "longitude": lon, "timezone": "auto",
        "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code",
        "forecast_days": 7,
    }, timeout=20)
    response.raise_for_status()
    data = response.json()
    weather_cache.set(key, data)
    return data


async def geocode(name: str) -> dict | None:
    response = await http.get("https://geocoding-api.open-meteo.com/v1/search",
                              params={"name": name.split(",")[0].strip(), "count": 1}, timeout=15)
    results = response.json().get("results") or []
    return results[0] if results else None


@tool
async def get_weather(config: RunnableConfig, location: str | None = None) -> str:
    """Current weather and 7-day forecast (temperature, rain, humidity, wind). Leave location empty
    to use the user's farm location. Use for sowing, irrigation, spraying, harvest and grazing decisions."""
    try:
        profile = await profiles.get(_user(config)) or {}
        if not location and profile.get("lat") is not None:
            lat, lon, label = profile["lat"], profile["lon"], profile.get("location_name") or "your farm"
        else:
            place = await geocode(location or profile.get("location_name") or "")
            if place is None:
                return _dump({"error": f"Location '{location}' not found. Ask the user for a nearby town."})
            lat, lon = place["latitude"], place["longitude"]
            label = f"{place['name']}, {place.get('admin1', '')}, {place.get('country', '')}"
        data = await fetch_weather(lat, lon)
    except httpx.HTTPError as exc:
        return _dump({"error": f"Weather service failed: {exc}"})
    return _dump({"location": label, "current": data.get("current"), "daily": data.get("daily")})


# ---------- Memory ----------

@tool
async def remember_fact(fact: str, config: RunnableConfig) -> str:
    """Save an important long-term fact about the user or their farm (e.g. 'Has 12 Gir cows',
    'Field soil is black cotton soil'), when the user tells you something worth remembering
    or explicitly asks you to remember. Write it as a short third-person sentence."""
    saved = await memory.add_memory(_user(config), fact, source_thread=config["configurable"].get("thread_id"))
    return _dump({"saved": bool(saved), "fact": fact, "note": None if saved else "Already known"})


@tool
async def recall_memories(query: str, config: RunnableConfig) -> str:
    """Search long-term memory for facts about the user beyond those already in your context."""
    return _dump(await memory.search_memories(_user(config), query, limit=8))


@tool
async def search_past_conversations(query: str, config: RunnableConfig) -> str:
    """Find what was discussed in the user's earlier chats (e.g. 'what did you tell me about my
    goat's fever last week?'). Returns matching conversation titles and summaries."""
    return _dump(await memory.search_threads(_user(config), query))


@tool
async def update_farm_profile(
    field: Literal["name", "location_name", "land_area", "land_unit", "crops", "irrigation", "soil", "goals",
                   "language"],
    value: str,
    config: RunnableConfig,
) -> str:
    """Update the user's farm profile when they tell you something changed (e.g. new crop, more land,
    moved village). For crops pass a comma-separated list of ALL current crops."""
    if field == "crops":
        parsed = [c.strip() for c in value.split(",") if c.strip()]
    elif field == "land_area":
        try:
            parsed = float(value)
        except ValueError:
            return _dump({"error": "land_area must be a number"})
    else:
        parsed = value
    updates = {field: parsed}
    if field == "location_name" and (place := await geocode(value)):
        updates.update(lat=place["latitude"], lon=place["longitude"])
    await profiles.upsert(_user(config), updates)
    return _dump({"updated": field, "value": parsed})


TOOLS = [predict_pasture_biomass, diagnose_plant_disease, recommend_crop, assess_livestock_health,
         estimate_grazing_days, get_mandi_prices, get_weather, web_search, remember_fact, recall_memories,
         search_past_conversations, update_farm_profile]
