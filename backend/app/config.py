import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

# ---------------------------------------------------------------------------
# LLM provider selection
#
# Supported providers:
#   1. Google AI Studio (Gemini)  — set GEMINI_API_KEY (or GOOGLE_API_KEY)
#   2. NVIDIA NIM                 — set NVIDIA_API_KEY
#   3. Meta Muse (Model API)      — set MUSE_API_KEY (or MODEL_API_KEY)
#   4. xAI Grok                   — set LLM_API_KEY / XAI_API_KEY
#
# You can explicitly choose the provider with LLM_PROVIDER=gemini|nvidia|muse|xai.
# If omitted, provider is auto-detected: gemini -> nvidia -> muse -> xai.
# ---------------------------------------------------------------------------
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "").lower().strip()

# Google AI Studio (Gemini)
GEMINI_API_KEY    = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
GEMINI_BASE_URL   = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/")
GEMINI_MODEL      = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_FAST_MODEL = os.getenv("GEMINI_FAST_MODEL", GEMINI_MODEL)

# NVIDIA NIM (OpenAI-compatible endpoint)
NVIDIA_API_KEY    = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_BASE_URL   = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
NVIDIA_MODEL      = os.getenv("NVIDIA_MODEL",      "nvidia/nemotron-3-ultra-550b-a55b")
NVIDIA_FAST_MODEL = os.getenv("NVIDIA_FAST_MODEL", "nvidia/nemotron-3-ultra-550b-a55b")

# Meta Muse via the Meta Model API (OpenAI-compatible). The models always reason; effort trades depth for speed.
MUSE_API_KEY             = os.getenv("MUSE_API_KEY") or os.getenv("MODEL_API_KEY", "")
MUSE_BASE_URL            = os.getenv("MUSE_BASE_URL", "https://api.meta.ai/v1")
MUSE_MODEL               = os.getenv("MUSE_MODEL", "muse-spark-1.3")
MUSE_FAST_MODEL          = os.getenv("MUSE_FAST_MODEL", "muse-ember-1.0")
MUSE_REASONING_EFFORT    = os.getenv("MUSE_REASONING_EFFORT", "medium")  # minimal | low | medium | high | xhigh | max
MUSE_FAST_REASONING_EFFORT = os.getenv("MUSE_FAST_REASONING_EFFORT", "low")

# xAI Grok
LLM_API_KEY    = os.getenv("LLM_API_KEY") or os.getenv("XAI_API_KEY", "")
LLM_MODEL      = os.getenv("LLM_MODEL",      "grok-4.7")
LLM_FAST_MODEL = os.getenv("LLM_FAST_MODEL", "grok-4.20-non-reasoning")

LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.3"))
# Set to false if the chosen model cannot read images.
LLM_VISION = os.getenv("LLM_VISION", "true").lower() == "true"

# Determine active provider
if LLM_PROVIDER in ("gemini", "google"):
    ACTIVE_PROVIDER = "gemini"
elif LLM_PROVIDER in ("nvidia", "nim"):
    ACTIVE_PROVIDER = "nvidia"
elif LLM_PROVIDER in ("muse", "meta"):
    ACTIVE_PROVIDER = "muse"
elif LLM_PROVIDER in ("xai", "grok"):
    ACTIVE_PROVIDER = "xai"
elif GEMINI_API_KEY:
    ACTIVE_PROVIDER = "gemini"
elif NVIDIA_API_KEY:
    ACTIVE_PROVIDER = "nvidia"
elif MUSE_API_KEY:
    ACTIVE_PROVIDER = "muse"
else:
    ACTIVE_PROVIDER = "xai"

USE_GEMINI = ACTIVE_PROVIDER == "gemini"
USE_NVIDIA = ACTIVE_PROVIDER == "nvidia"
USE_MUSE = ACTIVE_PROVIDER == "muse"
USE_XAI = ACTIVE_PROVIDER == "xai"

# Active model selection
if USE_GEMINI:
    ACTIVE_LLM_MODEL = GEMINI_MODEL
    ACTIVE_FAST_MODEL = GEMINI_FAST_MODEL
    IS_LLM_CONFIGURED = bool(GEMINI_API_KEY)
elif USE_NVIDIA:
    ACTIVE_LLM_MODEL = NVIDIA_MODEL
    ACTIVE_FAST_MODEL = NVIDIA_FAST_MODEL
    IS_LLM_CONFIGURED = bool(NVIDIA_API_KEY)
elif USE_MUSE:
    ACTIVE_LLM_MODEL = MUSE_MODEL
    ACTIVE_FAST_MODEL = MUSE_FAST_MODEL
    IS_LLM_CONFIGURED = bool(MUSE_API_KEY)
else:
    ACTIVE_LLM_MODEL = LLM_MODEL
    ACTIVE_FAST_MODEL = LLM_FAST_MODEL
    IS_LLM_CONFIGURED = bool(LLM_API_KEY)

# Postgres (needs the pgvector extension for semantic memory)
DATABASE_URL = os.getenv("DATABASE_URL", "")

# Clerk
CLERK_PUBLISHABLE_KEY = os.getenv("CLERK_PUBLISHABLE_KEY", "")
CLERK_AUTHORIZED_PARTIES = [p for p in os.getenv("CLERK_AUTHORIZED_PARTIES", "http://localhost:5173").split(",") if p]

# Voice (Sarvam AI)
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
SARVAM_STT_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v3")
SARVAM_TTS_MODEL = os.getenv("SARVAM_TTS_MODEL", "bulbul:v3")

# Deployed model API endpoints. A model with no URL returns a hardcoded mock response.
# Biomass is the base URL of ml-service, not a single predict route. Each measurement is
# POST {BIOMASS_API_URL}/targets/{slug}/predict.
MODEL_URLS = {
    "biomass": os.getenv("BIOMASS_API_URL", ""),
    "yield": os.getenv("YIELD_API_URL", ""),
    "soil": os.getenv("SOIL_API_URL", ""),
}
# Multipart field name the biomass API expects the image under.
BIOMASS_IMAGE_FIELD = os.getenv("BIOMASS_IMAGE_FIELD", "image")

# Market prices (data.gov.in Agmarknet)
DATA_GOV_IN_API_KEY = os.getenv("DATA_GOV_IN_API_KEY", "")
MANDI_RESOURCE_ID = os.getenv("MANDI_RESOURCE_ID", "9ef84268-d588-465a-a308-a864a43d0070")

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
EMBEDDING_DIMS = int(os.getenv("EMBEDDING_DIMS", "384"))

DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "15"))

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
