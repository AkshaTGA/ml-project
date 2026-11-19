"""Saved tool and model checks.

A run keeps the photo, the inputs and the result so a later question can point at
it. The chat shows a short card. The model receives a compact brief, not the raw
payload the user would otherwise have pasted into the prompt.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime

from psycopg.types.json import Json

from . import db, memory
from .llm import extract_text

log = logging.getLogger(__name__)

# The four tools on the Tools page. Chat calls them under different names.
MODEL_OF = {
    "biomass": "biomass",
    "predict_pasture_biomass": "biomass",
    "crop": "crop",
    "recommend_crop": "crop",
    "yield": "yield",
    "predict_crop_yield": "yield",
    "soil": "soil",
    "describe_soil_profile": "soil",
    "cattle": "cattle",
    "predict_cattle_weight": "cattle",
    "livestock": "livestock",
    "assess_livestock_health": "livestock",
}

_TITLES = {
    "biomass": "Pasture biomass",
    "predict_pasture_biomass": "Pasture biomass",
    "crop": "Crop recommendation",
    "recommend_crop": "Crop recommendation",
    "yield": "Crop yield",
    "predict_crop_yield": "Crop yield",
    "soil": "Soil profile",
    "describe_soil_profile": "Soil profile",
    "cattle": "Cattle weight",
    "predict_cattle_weight": "Cattle weight",
    "livestock": "Livestock check",
    "assess_livestock_health": "Livestock check",
    "diagnose_plant_disease": "Leaf check",
    "estimate_grazing_days": "Grazing days",
    "get_mandi_prices": "Mandi prices",
    "get_weather": "Weather",
}


def _num(value) -> str | None:
    try:
        return f"{float(value):.1f}"
    except (TypeError, ValueError):
        return None


def _clean(data):
    """Drop fields that are only useful as files or long warnings."""
    if not isinstance(data, dict):
        return data
    skip = {"gradcam", "image_base64", "gradcam_summary"}
    return {key: value for key, value in data.items() if key not in skip}


def summary_for(tool: str, data: dict) -> tuple[str, str]:
    """Short title and one-line preview for a card."""
    data = data if isinstance(data, dict) else {}
    title = data.get("label") or _TITLES.get(tool, tool.replace("_", " "))
    if tool in {"biomass", "predict_pasture_biomass"}:
        if data.get("label"):
            title = str(data["label"])
        amount = _num(data.get("prediction"))
        if amount:
            return title, f"{amount} g per quadrat"
        predictions = data.get("predictions") if isinstance(data.get("predictions"), dict) else {}
        parts = [f"{name} {_num(value)} g" for name, value in predictions.items() if _num(value)]
        return title, ", ".join(parts)[:140] or "Biomass result"
    if tool in {"crop", "recommend_crop"}:
        rows = data.get("recommendations") if isinstance(data.get("recommendations"), list) else []
        if rows:
            top = rows[0]
            share = _num((top.get("confidence") or 0) * 100)
            return title, f"{top.get('crop', 'crop')} {share or '0'}%"
        return title, "Crop recommendation"
    if tool in {"yield", "predict_crop_yield"}:
        amount = _num(data.get("prediction"))
        return str(data.get("label") or title), f"{amount} t/ha" if amount else "Yield estimate"
    if tool in {"soil", "describe_soil_profile"}:
        label = data.get("label") or title
        return str(label), str(data.get("summary") or label)[:140]
    if tool in {"cattle", "predict_cattle_weight"}:
        amount = _num(data.get("prediction"))
        return str(data.get("label") or title), f"{amount} kg" if amount else "Weight estimate"
    if tool in {"livestock", "assess_livestock_health"}:
        risk = data.get("risk_level")
        return title, f"{risk} risk" if risk else "Livestock check"
    if tool == "diagnose_plant_disease":
        if data.get("healthy"):
            return "Leaf check", "Looks healthy"
        disease = data.get("disease") or "Leaf check"
        confidence = _num((data.get("confidence") or 0) * 100)
        return disease, f"{confidence}% confident" if confidence else "Leaf check"
    if tool == "estimate_grazing_days":
        days = data.get("grazing_days")
        return title, f"{days} grazing days" if days is not None else "Grazing estimate"
    if tool == "get_mandi_prices":
        commodity = data.get("commodity") or "Mandi"
        prices = data.get("prices") if isinstance(data.get("prices"), list) else []
        if prices and prices[0].get("modal") is not None:
            return f"{commodity} prices", f"₹{prices[0]['modal']} modal"
        return f"{commodity} prices", "Price check"
    if tool == "get_weather":
        place = data.get("location") or "Weather"
        current = data.get("current") if isinstance(data.get("current"), dict) else {}
        temp = current.get("temperature_2m")
        return place, f"{temp}°C" if temp is not None else "Weather"
    return title, title


def model_brief(run: dict) -> str:
    """What the assistant should read. Capped so a reply never pastes the whole record."""
    data = run.get("result") if isinstance(run.get("result"), dict) else {}
    lines = [
        f"Saved check {run['id']}: {run['title']} ({run['tool']})",
        f"Result: {run['summary']}",
    ]
    when = run.get("created_at")
    if when:
        lines.append(f"When: {when}")
    inputs = run.get("inputs") if isinstance(run.get("inputs"), dict) else {}
    shown = ", ".join(f"{key}={value}" for key, value in inputs.items() if key not in {"image", "file_id"})
    if shown:
        lines.append(f"Inputs: {shown[:300]}")
    if run.get("image_id"):
        lines.append("The original photo is attached below the text. Look at it.")
    if isinstance(data.get("gradcam_file_id"), str) and data.get("gradcam_file_id"):
        lines.append("The Grad-CAM overlay is also attached. Brighter regions drove the ResNet embedding.")
    predictions = data.get("predictions") if isinstance(data.get("predictions"), dict) else None
    if predictions:
        lines.append("Numbers: " + ", ".join(f"{key}={_num(value) or value}" for key, value in predictions.items()))
    recommendations = data.get("recommendations") if isinstance(data.get("recommendations"), list) else None
    if recommendations:
        bits = []
        for row in recommendations[:3]:
            share = _num((row.get("confidence") or 0) * 100)
            bits.append(f"{row.get('crop')} {share}%")
        lines.append("Recommendations: " + ", ".join(bits))
    for key in ("units", "risk_level", "disease", "urgency", "grazing_days", "location", "healthy"):
        if data.get(key) not in (None, "", []):
            lines.append(f"{key}: {data[key]}")
    note = data.get("note")
    if isinstance(note, str) and note:
        if "backbone_full.pt" in note:
            lines.append("Note: this biomass number used ImageNet ResNet embeddings because the trained backbone file is not installed.")
        else:
            lines.append(f"Note: {note[:180]}")
    return "\n".join(lines)[:1500]


def _decode(row: dict | None) -> dict | None:
    if row is None:
        return None
    row = dict(row)
    for key in ("inputs", "result"):
        value = row.get(key)
        if isinstance(value, str):
            try:
                row[key] = json.loads(value)
            except json.JSONDecodeError:
                row[key] = {}
    created = row.get("created_at")
    if isinstance(created, datetime):
        row["created_at"] = created.isoformat()
    return row


async def save_run(user_id: str, tool: str, data: dict, inputs: dict | None = None,
                   image_id: str | None = None, thread_id: str | None = None,
                   message_id: str | None = None) -> dict | None:
    model_id = MODEL_OF.get(tool)
    if model_id is None or not isinstance(data, dict) or data.get("error"):
        return None
    stored = _clean(data)
    title, summary = summary_for(model_id, stored)
    run_id = uuid.uuid4().hex[:16]
    try:
        await db.execute(
            "INSERT INTO tool_runs (id, user_id, tool, title, summary, inputs, result, image_id, thread_id, message_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            run_id, user_id, model_id, title[:80], summary[:180],
            Json(inputs or {}), Json(stored), image_id, thread_id, message_id,
        )
    except Exception:
        log.exception("Could not save tool run %s", tool)
        return None
    return await get_run(user_id, run_id)


async def list_runs(user_id: str, tool: str | None = None, limit: int = 40) -> list[dict]:
    model_id = MODEL_OF.get(tool) if tool else None
    if tool and model_id is None:
        return []
    if model_id:
        names = _tool_names(model_id)
        rows = await db.fetch(
            "SELECT id, tool, title, summary, inputs, result, image_id, thread_id, message_id, created_at "
            "FROM tool_runs WHERE user_id = %s AND tool = ANY(%s) ORDER BY created_at DESC LIMIT %s",
            user_id, names, limit,
        )
    else:
        rows = await db.fetch(
            "SELECT id, tool, title, summary, inputs, result, image_id, thread_id, message_id, created_at "
            "FROM tool_runs WHERE user_id = %s AND tool = ANY(%s) ORDER BY created_at DESC LIMIT %s",
            user_id, list(MODEL_OF), limit,
        )
    decoded = []
    for row in rows:
        item = _decode(row)
        item["tool"] = MODEL_OF.get(item["tool"], item["tool"])
        decoded.append(item)
    return decoded


def _tool_names(tool: str) -> list[str]:
    model_id = MODEL_OF.get(tool)
    if model_id is None:
        return []
    return [name for name, mapped in MODEL_OF.items() if mapped == model_id]


async def delete_run(user_id: str, run_id: str) -> bool:
    existing = await get_run(user_id, run_id)
    if existing is None:
        return False
    await db.execute("DELETE FROM tool_runs WHERE id = %s AND user_id = %s", run_id, user_id)
    return True


async def delete_tool_runs(user_id: str, tool: str) -> int:
    names = _tool_names(tool)
    if not names:
        return 0
    rows = await db.fetch(
        "SELECT id FROM tool_runs WHERE user_id = %s AND tool = ANY(%s)",
        user_id, names,
    )
    await db.execute(
        "DELETE FROM tool_runs WHERE user_id = %s AND tool = ANY(%s)",
        user_id, names,
    )
    return len(rows)


async def get_run(user_id: str, run_id: str) -> dict | None:
    row = _decode(await db.fetchrow(
        "SELECT id, tool, title, summary, inputs, result, image_id, thread_id, message_id, created_at "
        "FROM tool_runs WHERE id = %s AND user_id = %s",
        run_id, user_id,
    ))
    if row is not None:
        row["tool"] = MODEL_OF.get(row["tool"], row["tool"])
    return row


def _excerpt(text: str, limit: int) -> str:
    flat = " ".join((text or "").split())
    if len(flat) <= limit:
        return flat
    return flat[: limit - 1].rstrip() + "…"


def _message_text(message) -> tuple[str, str]:
    """Role label and the words worth quoting. Tool payloads are not quoted in full."""
    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

    if isinstance(message, HumanMessage):
        return "You", message.additional_kwargs.get("display_text") or ""
    if isinstance(message, AIMessage):
        return "AgriAssist", extract_text(message.content)
    if isinstance(message, ToolMessage):
        try:
            data = json.loads(message.content) if isinstance(message.content, str) else {}
        except json.JSONDecodeError:
            data = {}
        if isinstance(data, dict):
            _title, preview = summary_for(message.name or "", data)
            return "AgriAssist", preview
        return "AgriAssist", ""
    return "Message", ""


def _check_images(run: dict) -> list[dict]:
    """Photos the model should see. They are not added to the visible attachments."""
    result = run.get("result") if isinstance(run.get("result"), dict) else {}
    photos = []
    seen = set()

    def add(file_id, label):
        if isinstance(file_id, str) and file_id and file_id not in seen:
            seen.add(file_id)
            photos.append({"id": file_id, "label": label})

    add(run.get("image_id"), "Original photo used for this check")
    add(result.get("gradcam_file_id"), "Grad-CAM overlay for this check")
    return photos


async def resolve_context(user_id: str, refs: list, graph, current_thread_id: str) -> tuple[list[dict], str, list[dict]]:
    """Turn references into display cards, a short model brief, and photos for the model only."""
    from langchain_core.messages import AIMessage, HumanMessage

    cards, blocks, images = [], [], []
    seen_messages: set[str] = set()
    seen_photos: set[str] = set()
    for ref in refs[:3]:
        if ref.type == "tool_run":
            run = await get_run(user_id, ref.id)
            if run is None:
                raise LookupError("That saved check was not found")
            cards.append({
                "type": "tool_run",
                "id": run["id"],
                "thread_id": run.get("thread_id"),
                "title": run["title"],
                "preview": run["summary"],
                "image_id": run.get("image_id"),
                "focus_id": run.get("message_id") or run["id"],
            })
            blocks.append(model_brief(run))
            for photo in _check_images(run):
                if photo["id"] not in seen_photos:
                    seen_photos.add(photo["id"])
                    images.append(photo)
            continue

        thread_id = ref.thread_id or current_thread_id
        if not await memory.owns_thread(user_id, thread_id):
            raise LookupError("That message was not found")
        state = await graph.aget_state({"configurable": {"thread_id": thread_id}})
        messages = state.values.get("messages", []) if state else []
        found = next((message for message in messages if getattr(message, "id", None) == ref.id), None)
        if found is None:
            raise LookupError("That message was not found")
        role, text = _message_text(found)
        if not text and isinstance(found, AIMessage):
            # The answer id is the last model message. Quote the nearest tool line if the answer is empty.
            index = next(i for i, message in enumerate(messages) if getattr(message, "id", None) == ref.id)
            for earlier in reversed(messages[max(0, index - 6):index]):
                label, earlier_text = _message_text(earlier)
                if earlier_text:
                    role, text = label, earlier_text
                    break
        same_chat = thread_id == current_thread_id
        recent_ids = {message.id for message in messages[-24:] if isinstance(message, (HumanMessage, AIMessage))}
        limit = 160 if same_chat and ref.id in recent_ids else 700
        excerpt = _excerpt(text, limit) or "Earlier message"
        if same_chat and ref.id in recent_ids:
            blocks.append(
                f'The user is replying to {role} in this chat (message {ref.id}). '
                f'Excerpt: "{excerpt}". The full message is already in the conversation; do not ask them to paste it.'
            )
        else:
            where = "this chat" if same_chat else "an earlier chat"
            blocks.append(f'The user is replying to {role} from {where}. Excerpt: "{excerpt}"')
        if ref.id not in seen_messages:
            seen_messages.add(ref.id)
            cards.append({
                "type": "message",
                "id": ref.id,
                "thread_id": thread_id,
                "title": role,
                "preview": _excerpt(text, 90) or "Message",
                "image_id": None,
                "focus_id": ref.id,
            })
    brief = "\n\n".join(blocks)
    return cards, brief, images
