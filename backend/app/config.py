import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

# LLM (xAI Grok). The main model answers; the fast model does background work
# (memory extraction, summaries, titles, suggestions).
LLM_API_KEY = os.getenv("LLM_API_KEY") or os.getenv("XAI_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "grok-4.7")
LLM_FAST_MODEL = os.getenv("LLM_FAST_MODEL", "grok-4.20-non-reasoning")
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.3"))
# Set to false if the chosen model cannot read images.
LLM_VISION = os.getenv("LLM_VISION", "true").lower() == "true"

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
MODEL_URLS = {
    "biomass": os.getenv("BIOMASS_API_URL", ""),
    "crop": os.getenv("CROP_API_URL", ""),
    "livestock": os.getenv("LIVESTOCK_API_URL", ""),
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
