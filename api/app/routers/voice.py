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
from ..resolve import readable_protocols
from ..tools.prompt import (
    DESK_GREETING,
    build_desk_keyterms,
    build_desk_prompt,
    build_greeting,
    build_keyterms,
    build_prompt,
)
from ..tools.schemas import tool_schemas

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


# A finished run has nothing left to record into; opening a microphone on it
# only invites writes the dispatcher would refuse.
CLOSED = {"COMPLETED", "CANCELLED"}


def _session_config(system_prompt: str, greeting: str, keyterms: list[str], tools: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "system_prompt": system_prompt,
        "greeting": greeting,
        "input": {
            "format": {"encoding": "audio/pcm"},
            "keyterms": keyterms,
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
        "tools": tools,
    }


@router.get("/bootstrap")
async def bootstrap(experiment_id: str | None = None, user: User = Depends(get_current_user)) -> dict[str, Any]:
    sb = supabase_admin()

    if not experiment_id:
        # Desk profile: no experiment open. The session can only create, start or
        # resume one (constitution amendment A-1). Reads are scoped to this user.
        protocols = readable_protocols(sb, user.id)
        open_runs = [
            e
            for e in (sb.table("experiments").select("*").eq("owner_id", user.id).execute().data or [])
            if e.get("status") not in CLOSED
        ]
        token = await _mint_token()
        return {
            "token": token,
            "ws_url": WS_URL,
            "profile": "desk",
            "experiment": None,
            "session_config": _session_config(
                build_desk_prompt(protocols, open_runs),
                DESK_GREETING,
                build_desk_keyterms(protocols, open_runs),
                tool_schemas("desk"),
            ),
        }

    # Authorize BEFORE minting. Minting first would let any authenticated user
    # burn quota against experiments they cannot see.
    ctx = get_experiment_context(sb, experiment_id, user.id)
    experiment = ctx.experiment
    if experiment.get("status") in CLOSED:
        raise HTTPException(status_code=409, detail="EXPERIMENT_CLOSED")

    token = await _mint_token()

    return {
        "token": token,
        "ws_url": WS_URL,
        "profile": "bench",
        "experiment": {
            "id": experiment["id"],
            "code": experiment["experiment_code"],
            "name": experiment["name"],
            "status": experiment["status"],
            "current_step_index": experiment.get("current_step_index", 0),
        },
        "session_config": _session_config(
            build_prompt(ctx), build_greeting(ctx), build_keyterms(ctx), tool_schemas("bench")
        ),
    }
