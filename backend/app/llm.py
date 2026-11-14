from __future__ import annotations

import logging
from functools import lru_cache

from .config import (
    ACTIVE_FAST_MODEL,
    ACTIVE_LLM_MODEL,
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
    LLM_API_KEY,
    LLM_TEMPERATURE,
    NVIDIA_API_KEY,
    NVIDIA_BASE_URL,
    USE_GEMINI,
    USE_NVIDIA,
)

logger = logging.getLogger(__name__)


def _make_llm(model: str, temperature: float, streaming: bool = False):
    """Return the appropriate LangChain chat model based on the active provider."""
    if USE_GEMINI:
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            logger.info("LLM provider: Google Gemini (ChatGoogleGenerativeAI)  model=%s", model)
            return ChatGoogleGenerativeAI(
                model=model,
                google_api_key=GEMINI_API_KEY or "missing",
                temperature=temperature,
                streaming=streaming,
                max_retries=2,
            )
        except ImportError:
            from langchain_openai import ChatOpenAI
            logger.info("LLM provider: Google Gemini (AI Studio OpenAI-compat)  model=%s", model)
            return ChatOpenAI(
                model=model,
                api_key=GEMINI_API_KEY or "missing",
                base_url=GEMINI_BASE_URL,
                temperature=temperature,
                streaming=streaming,
                max_retries=2,
            )
    elif USE_NVIDIA:
        from langchain_openai import ChatOpenAI  # NIM is OpenAI-compatible
        logger.info("LLM provider: NVIDIA NIM  model=%s", model)
        return ChatOpenAI(
            model=model,
            api_key=NVIDIA_API_KEY or "missing",
            base_url=NVIDIA_BASE_URL,
            temperature=temperature,
            streaming=streaming,
            max_retries=2,
        )
    else:
        from langchain_xai import ChatXAI
        logger.info("LLM provider: xAI Grok  model=%s", model)
        return ChatXAI(
            model=model,
            api_key=LLM_API_KEY or "missing",
            temperature=temperature,
            streaming=streaming,
            max_retries=2,
        )


@lru_cache
def main_llm():
    """Strong model: answers, tool decisions, vision diagnosis."""
    return _make_llm(
        model=ACTIVE_LLM_MODEL,
        temperature=LLM_TEMPERATURE,
        streaming=True,
    )


@lru_cache
def fast_llm():
    """Cheap, fast model for background memory work."""
    return _make_llm(
        model=ACTIVE_FAST_MODEL,
        temperature=0,
        streaming=False,
    )
