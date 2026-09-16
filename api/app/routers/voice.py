"""GET /voice/bootstrap — the credential and the session configuration.

One call per voice session. It hands the browser a token that expires in minutes
and a configuration it did not author; the browser is reduced to a transport,
which is the correct amount of trust to place in a client
(contracts/voice-bootstrap.md).
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException

from ..db import get_experiment_context
from ..deps import User, get_current_user, supabase_admin
from ..tools.prompt import build_greeting, build_keyterms, build_prompt
from ..tools.schemas import TOOL_SCHEMAS

router = APIRouter(prefix="/voice")

TOKEN_URL = "https://agents.assemblyai.com/v1/token"
WS_URL = "wss://agents.assemblyai.com/v1/ws"

# Redemption window for the token, not the session length. Short enough to limit
# replay, long enough to survive a slow page load.
EXPIRES_IN_SECONDS = 300
MAX_SESSION_DURATION_SECONDS = 3600

VOICE = "anna"


async def _mint_token() -> str:
    api_key = os.environ.get("ASSEMBLYAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ASSEMBLYAI_API_KEY is not configured")

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            TOKEN_URL,
            params={
                "expires_in_seconds": EXPIRES_IN_SECONDS,
                "max_session_duration_seconds": MAX_SESSION_DURATION_SECONDS,
            },
            headers={"Authorization": f"Bearer {api_key}"},
        )

    if response.status_code != 200:
        # Never leak the upstream body — it can echo the key back.
        raise HTTPException(status_code=502, detail="VOICE_UNAVAILABLE")

    token = response.json().get("token")
    if not token:
        raise HTTPException(status_code=502, detail="VOICE_UNAVAILABLE")
    return token


@router.get("/bootstrap")
async def bootstrap(experiment_id: str, user: User = Depends(get_current_user)) -> dict[str, Any]:
    sb = supabase_admin()

    # Authorize BEFORE minting. Minting first would let any authenticated user
    # burn quota against experiments they cannot see.
    ctx = get_experiment_context(sb, experiment_id, user.id)

    token = await _mint_token()
    experiment = ctx.experiment

    return {
        "token": token,
        "ws_url": WS_URL,
        "experiment": {
            "id": experiment["id"],
            "code": experiment["experiment_code"],
            "name": experiment["name"],
            "status": experiment["status"],
            "current_step_index": experiment.get("current_step_index", 0),
        },
        "session_config": {
            "system_prompt": build_prompt(ctx),
            "greeting": build_greeting(ctx),
            "input": {
                "format": {"encoding": "audio/pcm"},
                "keyterms": build_keyterms(ctx),
                "turn_detection": {
                    "vad_threshold": 0.5,
                    "min_silence": 1000,
                    "max_silence": 3000,
                    "interrupt_response": True,
                },
            },
            "output": {
                "format": {"encoding": "audio/pcm"},
                "voice": VOICE,
                "volume": 80,
            },
            "tools": TOOL_SCHEMAS,
        },
    }
