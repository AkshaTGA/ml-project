"""Local multilingual embeddings for semantic memory (no API key, ~10 ms per query on CPU)."""
from __future__ import annotations

import asyncio

from langchain_core.embeddings import Embeddings

from .config import EMBEDDING_MODEL


class LocalEmbeddings(Embeddings):
    def __init__(self):
        from fastembed import TextEmbedding

        self.model = TextEmbedding(EMBEDDING_MODEL)
        self.embed_query("warm up")

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [vector.tolist() for vector in self.model.embed(texts)]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]

    async def aembed_documents(self, texts: list[str]) -> list[list[float]]:
        return await asyncio.to_thread(self.embed_documents, texts)

    async def aembed_query(self, text: str) -> list[float]:
        return await asyncio.to_thread(self.embed_query, text)
