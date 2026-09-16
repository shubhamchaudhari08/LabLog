"""Authentication and privileged-client dependencies.

Constitution Principle III: the credentials read here exist only in this
service. Nothing in this module may be reachable from a browser.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import jwt
from fastapi import Header, HTTPException

# NOTE: `supabase` is imported lazily inside supabase_admin(), not here. The
# handler layer is meant to be testable without a live database, and a
# module-level import would drag the driver into every test that never touches
# one (Constitution, Development Workflow).


@dataclass(frozen=True)
class User:
    """The authenticated caller. `id` is the Supabase `auth.users.id`."""

    id: str
    email: str | None = None


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"{name} is not set. See api/.env.example. Privileged credentials "
            "live only in this service (Constitution Principle III)."
        )
    return value


_admin_client: Any = None


def supabase_admin() -> Any:
    """Service-role client.

    This key BYPASSES row-level security by design — it is how the backend
    writes audit rows and computes summaries. Because it bypasses RLS, the
    database enforces nothing on this path, and every handler reached through
    it must have passed the explicit ownership check in the dispatcher
    (research.md R-006).
    """
    global _admin_client
    if _admin_client is None:
        from supabase import create_client  # imported here, not at module load

        _admin_client = create_client(
            _require_env("SUPABASE_URL"),
            _require_env("SUPABASE_SERVICE_ROLE_KEY"),
        )
    return _admin_client


async def get_current_user(authorization: str | None = Header(default=None)) -> User:
    """Verify the caller's Supabase access token and return the user.

    Verification is local (HS256 against the project's JWT secret) rather than a
    network call to Supabase, because this sits inside a spoken turn and a
    round trip per tool call would be audible as hesitation.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="UNAUTHENTICATED")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="UNAUTHENTICATED")

    try:
        payload = jwt.decode(
            token,
            _require_env("SUPABASE_JWT_SECRET"),
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError:
        # Deliberately opaque: expired, wrong audience, bad signature and
        # malformed all collapse to one message. Distinguishing them tells an
        # attacker which part of a forged token to fix.
        raise HTTPException(status_code=401, detail="INVALID_TOKEN") from None

    subject = payload.get("sub")
    if not subject:
        raise HTTPException(status_code=401, detail="INVALID_TOKEN")

    return User(id=subject, email=payload.get("email"))
