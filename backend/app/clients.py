"""Shared HTTP client (connection reuse keeps external calls fast) and a tiny TTL cache."""
from __future__ import annotations

import time

import httpx

http = httpx.AsyncClient(timeout=httpx.Timeout(60, connect=10), limits=httpx.Limits(max_connections=50))


class TTLCache:
    def __init__(self, ttl_seconds: float, max_items: int = 1000):
        self.ttl = ttl_seconds
        self.max_items = max_items
        self.items: dict = {}

    def get(self, key):
        hit = self.items.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        self.items.pop(key, None)
        return None

    def set(self, key, value):
        if len(self.items) >= self.max_items:
            self.items.pop(next(iter(self.items)))
        self.items[key] = (time.monotonic() + self.ttl, value)

    def delete(self, key):
        self.items.pop(key, None)
