"""Clock skew between this host and Supabase must not reject fresh tokens.

A host running 25 s behind Supabase sees every newly issued token with an
`iat` in the future. PyJWT treats that as not-yet-valid, so each token failed
for its first 25 s — long enough to outlast the browser's retries.
"""

from __future__ import annotations

import asyncio
import time

import jwt
import pytest
from fastapi import HTTPException

from app.deps import get_current_user
from tests.test_api import JWT_SECRET

SUB = "11111111-1111-1111-1111-111111111111"


def token(*, iat_offset: int = 0, exp_offset: int = 3600) -> str:
    now = int(time.time())
    claims = {"sub": SUB, "aud": "authenticated", "iat": now + iat_offset, "exp": now + exp_offset}
    return jwt.encode(claims, JWT_SECRET, algorithm="HS256")


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)


def test_token_issued_ahead_of_local_clock_is_accepted():
    user = asyncio.run(get_current_user(f"Bearer {token(iat_offset=25)}"))
    assert user.id == SUB


def test_expiry_is_still_enforced():
    with pytest.raises(HTTPException) as caught:
        asyncio.run(get_current_user(f"Bearer {token(exp_offset=-10)}"))
    assert caught.value.status_code == 401
