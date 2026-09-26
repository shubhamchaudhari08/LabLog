"""GET /settings/measurement-types — the measurement vocabulary, read-only.

Served from app/tools/vocabulary.py, the same declaration the voice tools use,
so the list on the settings screen is exactly what the agent is told. There is
no write path: changing the vocabulary changes what the agent hears and
suggests, and that is a reviewed code change (Constitution Principle IV).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ..deps import User, get_current_user
from ..tools import vocabulary

router = APIRouter(prefix="/settings")


@router.get("/measurement-types")
async def list_types(_user: User = Depends(get_current_user)) -> list[dict[str, Any]]:
    return vocabulary.as_dicts()
