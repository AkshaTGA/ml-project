"""Sarvam AI speech proxy, so the API key never reaches the browser.

STT: saaras (22 Indian languages + English, code-mixed speech, auto language detection).
TTS: bulbul (11 languages). Long text is split into sentences and synthesised in parallel.
"""
from __future__ import annotations

import asyncio
import re

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..auth import current_user
from ..clients import http
from ..config import SARVAM_API_KEY, SARVAM_STT_MODEL, SARVAM_TTS_MODEL

router = APIRouter()
SARVAM = "https://api.sarvam.ai"
TTS_LANGUAGES = {"bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"}
# Bulbul v3 short names. Unknown speakers are dropped so speech still uses the model default.
V3_SPEAKERS = {
    "shubh", "aditya", "rahul", "rohan", "amit", "dev", "ratan", "varun", "manan", "sumit",
    "kabir", "aayan", "ashutosh", "advait", "anand", "tarun", "sunny", "mani", "gokul", "vijay",
    "mohit", "rehan", "soham", "ritu", "priya", "neha", "pooja", "simran", "kavya", "ishita",
    "shreya", "roopa", "tanya", "shruti", "suhani", "kavitha", "rupali",
}
TTS_CHUNK_CHARS = 450

# Unicode script ranges -> language, used when the caller doesn't know the reply language.
SCRIPTS = [
    (r"[ঀ-৿]", "bn-IN"), (r"[਀-੿]", "pa-IN"), (r"[઀-૿]", "gu-IN"),
    (r"[଀-୿]", "od-IN"), (r"[஀-௿]", "ta-IN"), (r"[ఀ-౿]", "te-IN"),
    (r"[ಀ-೿]", "kn-IN"), (r"[ഀ-ൿ]", "ml-IN"), (r"[ऀ-ॿ]", "hi-IN"),
]


def _headers():
    if not SARVAM_API_KEY:
        raise HTTPException(503, "Voice is not configured: set SARVAM_API_KEY in backend/.env")
    return {"api-subscription-key": SARVAM_API_KEY}


def detect_language(text: str, preferred: str | None = None) -> str:
    for pattern, language in SCRIPTS:
        if re.search(pattern, text):
            # Marathi also uses Devanagari: trust the user's preference there.
            if language == "hi-IN" and preferred == "mr-IN":
                return preferred
            return language
    return "en-IN"


def speakable(text: str) -> str:
    """Markdown -> plain text suitable for reading aloud."""
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"^\s*\|?\s*:?-{2,}.*$", " ", text, flags=re.M)
    text = text.replace("|", ", ")
    text = re.sub(r"[*_`#>~]+", "", text)
    text = re.sub(r"^\s*[-•]\s+", "", text, flags=re.M)
    return re.sub(r"\s+", " ", text).strip()


def split_sentences(text: str, limit: int = TTS_CHUNK_CHARS) -> list[str]:
    sentences = re.split(r"(?<=[.!?।॥])\s+", text)
    chunks, current = [], ""
    for sentence in sentences:
        while len(sentence) > limit:
            chunks.append(sentence[:limit])
            sentence = sentence[limit:]
        if len(current) + len(sentence) + 1 > limit and current:
            chunks.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        chunks.append(current)
    return chunks


@router.post("/voice/stt")
async def speech_to_text(audio: UploadFile = File(...), language: str | None = Form(default=None),
                         user_id: str = Depends(current_user)):
    data = {"model": SARVAM_STT_MODEL, "mode": "transcribe", "language_code": language or "unknown"}
    # Browsers send e.g. "audio/webm;codecs=opus"; Sarvam only accepts the bare type ("audio/webm").
    content_type = (audio.content_type or "audio/webm").split(";")[0].strip()
    try:
        response = await http.post(f"{SARVAM}/speech-to-text", headers=_headers(), data=data,
                                   files={"file": (audio.filename or "audio.webm", await audio.read(), content_type)},
                                   timeout=60)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Speech service unreachable: {exc}")
    if response.status_code >= 400:
        raise HTTPException(502, f"Speech-to-text failed ({response.status_code}): {response.text[:300]}")
    result = response.json()
    return {"text": result.get("transcript", ""), "language": result.get("language_code") or language}


class TTSRequest(BaseModel):
    text: str
    language: str | None = None
    preferred_language: str | None = None
    speaker: str | None = None


async def _synthesise(chunk: str, language: str, speaker: str | None) -> str:
    payload = {"text": chunk, "target_language_code": language, "model": SARVAM_TTS_MODEL}
    if speaker in V3_SPEAKERS:
        payload["speaker"] = speaker
    response = await http.post(f"{SARVAM}/text-to-speech", headers=_headers(), json=payload, timeout=60)
    if response.status_code >= 400:
        raise HTTPException(502, f"Text-to-speech failed ({response.status_code}): {response.text[:300]}")
    return response.json()["audios"][0]


@router.post("/voice/tts")
async def text_to_speech(body: TTSRequest, user_id: str = Depends(current_user)):
    text = speakable(body.text)
    if not text:
        return {"audios": [], "language": None}
    language = body.language if body.language in TTS_LANGUAGES else detect_language(text, body.preferred_language)
    try:
        audios = await asyncio.gather(*(_synthesise(c, language, body.speaker) for c in split_sentences(text)))
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Speech service unreachable: {exc}")
    return {"audios": audios, "language": language, "format": "wav"}
