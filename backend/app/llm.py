from __future__ import annotations

import logging
from functools import lru_cache

from .config import (
    LLM_API_KEY, LLM_FAST_MODEL, LLM_MODEL, LLM_TEMPERATURE,
    NVIDIA_API_KEY, NVIDIA_BASE_URL, NVIDIA_FAST_MODEL, NVIDIA_MODEL,
    USE_NVIDIA,
)

logger = logging.getLogger(__name__)


def _make_llm(model: str, temperature: float, streaming: bool = False):
    """Return the appropriate LangChain chat model based on the active provider."""
    if USE_NVIDIA:
        from langchain_openai import ChatOpenAI  # NIM is OpenAI-compatible
        logger.info("LLM provider: NVIDIA NIM  model=%s", model)
        return ChatOpenAI(
            model=model,
            api_key=NVIDIA_API_KEY,
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
        model=NVIDIA_MODEL if USE_NVIDIA else LLM_MODEL,
        temperature=LLM_TEMPERATURE,
        streaming=True,
    )


@lru_cache
def fast_llm():
    """Cheap, fast model for background memory work."""
    return _make_llm(
        model=NVIDIA_FAST_MODEL if USE_NVIDIA else LLM_FAST_MODEL,
        temperature=0,
        streaming=False,
    )
