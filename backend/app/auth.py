"""Clerk session-token verification.

The frontend sends `Authorization: Bearer <session JWT>`. We verify it against the Clerk
instance's public keys (JWKS), whose URL is derived from the publishable key.
"""
from __future__ import annotations

import base64

import jwt
from fastapi import Header, HTTPException

from .config import CLERK_AUTHORIZED_PARTIES, CLERK_PUBLISHABLE_KEY


def issuer_from_publishable_key(key: str) -> str:
    # pk_test_<base64("<frontend-api-host>$")>
    encoded = key.split("_", 2)[-1]
    host = base64.b64decode(encoded + "=" * (-len(encoded) % 4)).decode().rstrip("$")
    return f"https://{host}"


_jwks_client: jwt.PyJWKClient | None = None


def jwks_client() -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        if not CLERK_PUBLISHABLE_KEY:
            raise HTTPException(500, "CLERK_PUBLISHABLE_KEY is not set in backend/.env")
        url = f"{issuer_from_publishable_key(CLERK_PUBLISHABLE_KEY)}/.well-known/jwks.json"
        _jwks_client = jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)
    return _jwks_client


def verify_token(token: str) -> str:
    try:
        signing_key = jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(token, signing_key.key, algorithms=["RS256"], leeway=10,
                            options={"require": ["exp", "sub"]})
    except jwt.PyJWTError as exc:
        raise HTTPException(401, f"Invalid session token: {exc}") from exc
    azp = claims.get("azp")
    if azp and CLERK_AUTHORIZED_PARTIES and azp not in CLERK_AUTHORIZED_PARTIES:
        raise HTTPException(401, "Token was issued for a different origin")
    return claims["sub"]


async def current_user(authorization: str = Header(default="")) -> str:
    """Returns the Clerk user id of the signed-in caller."""
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Not signed in")
    return verify_token(token)
