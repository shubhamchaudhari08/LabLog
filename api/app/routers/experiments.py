"""POST /experiments and POST /experiments/{id}/start: quick create and start.

A UI write route beside POST /tools, on the 002 precedent (POST /protocols):
/tools is experiment-scoped and model-facing, and creating an experiment has no
experiment to anchor on yet. So this route runs the constitution's sequence
itself: authenticate → validate structurally → validate against stored reality
→ write → audit → return the stored rows
(specs/003-post-mvp-features/contracts/http-api.md, FR-214).

No voice tool is added here, so the ten-tool ceiling is untouched.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

from .. import lifecycle
from ..db import load_experiment, load_protocol
from ..deps import User, get_current_user, supabase_admin
from ..samples import validate_sample_codes

router = APIRouter(prefix="/experiments")


def _fail(error: str, message: str, **detail: Any) -> dict[str, Any]:
    """The /tools failure envelope, so the web app reads every route the same way."""
    body = {"success": False, "error": error, "message": message}
    if detail:
        body["detail"] = detail
    return body


class CreateExperimentRequest(BaseModel):
    # Unknown keys are IGNORED: a browser that sends owner_id, status,
    # experiment_code or a timestamp must not get to set them.
    model_config = ConfigDict(extra="ignore")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None
    protocol_id: str | None = None
    sample_codes: list[str] = Field(default_factory=list, max_length=50)
    start: bool = False


def _is_uuid(value: str) -> bool:
    """Postgres rejects a malformed uuid with an error, not an empty result."""
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


def _readable_protocol(sb, protocol_id: str, user_id: str) -> dict[str, Any] | None:
    if not _is_uuid(protocol_id):
        return None
    protocol = load_protocol(sb, protocol_id)
    if protocol and protocol.get("owner_id") in (None, user_id):
        return protocol
    return None


@router.post("")
async def create_experiment(body: dict[str, Any], user: User = Depends(get_current_user)) -> dict[str, Any]:
    # 1. JWT verified by the dependency.

    # 2. Structural validation.
    try:
        request = CreateExperimentRequest(**body)
    except ValidationError as exc:
        return _fail("INVALID_ARGS", "Some experiment fields are missing or invalid.", errors=exc.errors(include_url=False))

    # 3. Semantic validation — all of it before the first write.
    sb = supabase_admin()
    protocol = None
    if request.protocol_id:
        protocol = _readable_protocol(sb, request.protocol_id, user.id)
        if protocol is None:
            return _fail("PROTOCOL_NOT_FOUND", "That protocol does not exist or is not yours to use.")

    codes, problem = validate_sample_codes(request.sample_codes)
    if problem:
        return {"success": False, **problem}

    if request.start and protocol is None:
        return _fail("NO_PROTOCOL", "Choose a protocol to start the experiment, or create it as a draft.")

    # 4–5. Write and audit.
    try:
        experiment, samples = lifecycle.create_experiment(
            sb,
            user_id=user.id,
            name=request.name,
            description=request.description or None,
            protocol=protocol,
            sample_codes=codes,
            source="ui",
        )
    except lifecycle.CodeUnavailable:
        return _fail("CODE_UNAVAILABLE", "Could not allocate an experiment code. Try again.")

    if request.start:
        experiment = lifecycle.start_experiment(sb, experiment=experiment, user_id=user.id)

    # 6. The stored rows, not the request.
    return {"success": True, "experiment": experiment, "samples": samples}


@router.post("/{experiment_id}/start")
async def start_experiment(experiment_id: str, user: User = Depends(get_current_user)) -> dict[str, Any]:
    sb = supabase_admin()
    experiment = load_experiment(sb, experiment_id) if _is_uuid(experiment_id) else None
    if experiment is None:
        raise HTTPException(status_code=404, detail="EXPERIMENT_NOT_FOUND")
    # Explicit ownership check: the service role bypasses RLS, so this is the only control.
    if experiment.get("owner_id") != user.id:
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    problem = lifecycle.start_error(experiment)
    if problem:
        return {"success": False, **problem}

    return {"success": True, "experiment": lifecycle.start_experiment(sb, experiment=experiment, user_id=user.id)}
