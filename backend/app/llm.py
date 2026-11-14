from functools import lru_cache

from langchain_xai import ChatXAI

from .config import LLM_API_KEY, LLM_FAST_MODEL, LLM_MODEL, LLM_TEMPERATURE


@lru_cache
def main_llm() -> ChatXAI:
    """Strong model: answers, tool decisions, vision diagnosis."""
    return ChatXAI(model=LLM_MODEL, api_key=LLM_API_KEY or "missing", temperature=LLM_TEMPERATURE,
                   streaming=True, max_retries=2)


@lru_cache
def fast_llm() -> ChatXAI:
    """Cheap, fast model for background memory work."""
    return ChatXAI(model=LLM_FAST_MODEL, api_key=LLM_API_KEY or "missing", temperature=0, max_retries=2)
