"""POST /protocols — create a protocol from the Protocols screen.

This is a second write route beside POST /tools, and it is deliberate
(specs/002-manual-protocol-authoring/plan.md, Complexity Tracking). /tools is
experiment-scoped: ownership is anchored on the experiment, and a library
protocol belongs to none. So this route runs the same sequence itself:
authenticate → validate structurally → validate semantically → write → audit →
return the stored row.

Creation, and, for the protocol's creator only, editing and deleting it
(PUT/DELETE /protocols/{id}). Neither is allowed once any experiment uses the
protocol: its steps are the procedure those runs were recorded against, and
rewriting or removing them would falsify the record (Constitution Principle II).
Library protocols (owner_id null) belong to no one and are never editable.
Every edit and delete appends an event carrying the full prior definition.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from ..audit import write_event
from ..deps import User, get_current_user, supabase_admin
from ..tools import vocabulary
from ..tools.models import CreateProtocolRequest, ProtocolStepIn

router = APIRouter()


def _fail(error: str, message: str, **detail: Any) -> dict[str, Any]:
    """The /tools failure envelope, so the web app reads both the same way."""
    body = {"success": False, "error": error, "message": message}
    if detail:
        body["detail"] = detail
    return body


def _stored_steps(steps: list[ProtocolStepIn]) -> list[dict[str, Any]]:
    """Request steps → the stored JSONB shape the seed and voice tools already use.

    Index and id come from position, never from the client (FR-105). Listed
    reading types take the vocabulary's spelling, so "ph" is stored as "pH" and
    matches what the voice tools look up; unlisted types are stored as given.
    """
    stored = []
    for index, step in enumerate(steps):
        types: list[str] = []
        units: dict[str, str] = {}
        for reading in step.readings:
            listed = vocabulary.lookup(reading.type)
            name = listed.name if listed else reading.type
            if name in types:
                continue
            types.append(name)
            unit = reading.unit or (listed.default_unit if listed and listed.dimensionless else None)
            if unit:
                units[name] = unit

        row: dict[str, Any] = {
            "index": index,
            "id": f"step_{index + 1}",
            "name": step.name,
            "required_fields": ["sample_id", *types] if types else [],
        }
        if units:
            row["default_unit"] = units
        stored.append(row)
    return stored


def _code_taken(sb, code: str, user_id: str, exclude_id: str | None = None) -> dict[str, Any] | None:
    """A protocol this user can already read under the same code, ignoring case.

    ponytail: check-then-insert, so two simultaneous saves of one code can both
    pass. Fine for one user; add a partial unique index if that ever matters
    (research R-105).
    """
    readable = (sb.table("protocols").select("*").eq("owner_id", user_id).execute().data or []) + (
        sb.table("protocols").select("*").is_("owner_id", "null").execute().data or []
    )
    wanted = code.casefold()
    return next(
        (p for p in readable if str(p.get("protocol_code", "")).casefold() == wanted and p.get("id") != exclude_id),
        None,
    )


def _validated(body: dict[str, Any]) -> tuple[CreateProtocolRequest | None, dict[str, Any] | None]:
    """Structural, then unit, validation: shared by create and edit, all before any write."""
    try:
        request = CreateProtocolRequest(**body)
    except ValidationError as exc:
        return None, _fail(
            "INVALID_ARGS",
            "Some protocol fields are missing or invalid.",
            errors=exc.errors(include_url=False),
        )
    for index, step in enumerate(request.steps):
        for reading in step.readings:
            listed = vocabulary.lookup(reading.type)
            if listed and reading.unit and reading.unit not in listed.units:
                return None, _fail(
                    "INVALID_UNIT",
                    f"{listed.name} is recorded in {', '.join(listed.units)}, not {reading.unit}.",
                    step_index=index,
                    type=listed.name,
                    allowed=list(listed.units),
                )
    return request, None


def _snapshot(row: dict[str, Any]) -> dict[str, Any]:
    """The whole definition, so an edited or deleted protocol stays retrievable from events."""
    return {k: row.get(k) for k in ("protocol_code", "name", "version", "steps")}


def _owned_and_unused(sb, protocol_id: str, user_id: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """(protocol, None), or (None, a refusal). 404 and 403 are raised."""
    try:
        uuid.UUID(protocol_id)  # Postgres rejects a malformed uuid with an error, not an empty result
    except ValueError:
        raise HTTPException(status_code=404, detail="PROTOCOL_NOT_FOUND") from None
    rows = sb.table("protocols").select("*").eq("id", protocol_id).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="PROTOCOL_NOT_FOUND")
    protocol = rows[0]
    # Only the creator. Library protocols (owner_id null) have no creator to match.
    # The service role bypasses RLS, so this line is the only control.
    if protocol.get("owner_id") != user_id:
        raise HTTPException(status_code=403, detail="NOT_PROTOCOL_OWNER")

    runs = sb.table("experiments").select("experiment_code").eq("protocol_id", protocol_id).execute().data or []
    if runs:
        codes = sorted(r["experiment_code"] for r in runs)
        return None, _fail(
            "PROTOCOL_IN_USE",
            f"{protocol['protocol_code']} is used by {', '.join(codes)}, so it can no longer be changed or deleted. "
            "Create a new protocol, or a new version, instead.",
            experiments=codes,
        )
    return protocol, None


@router.post("/protocols")
async def create_protocol(
    body: dict[str, Any], user: User = Depends(get_current_user)
) -> dict[str, Any]:
    # 1. JWT verified by the dependency; a failure raised 401 before we got here.

    # 2-3. Structural and unit validation, before any write.
    request, problem = _validated(body)
    if problem:
        return problem

    sb = supabase_admin()
    existing = _code_taken(sb, request.protocol_code, user.id)
    if existing:
        return _fail(
            "PROTOCOL_CODE_TAKEN",
            f'{request.protocol_code} is already used by "{existing.get("name")}".',
        )

    # 4. Write. Owner is the verified caller; created_at is the database's.
    row = (
        sb.table("protocols")
        .insert(
            {
                "protocol_code": request.protocol_code,
                "name": request.name,
                "version": request.version,
                "steps": _stored_steps(request.steps),
                "owner_id": user.id,
            }
        )
        .execute()
    ).data[0]

    # 5. Audit.
    #    ponytail: two PostgREST calls, not one transaction — a crash between them
    #    leaves a protocol without its event (quickstart §3 catches it).
    write_event(
        sb,
        experiment_id=None,
        event_type="PROTOCOL_CREATED",
        entity_type="protocol",
        entity_id=row["id"],
        payload={
            "protocol_code": row["protocol_code"],
            "name": row["name"],
            "version": row["version"],
            "step_count": len(row["steps"]),
        },
        actor_id=user.id,
    )

    # 6. The stored row, not the request.
    return {"success": True, "protocol": row}


@router.put("/protocols/{protocol_id}")
async def update_protocol(
    protocol_id: str, body: dict[str, Any], user: User = Depends(get_current_user)
) -> dict[str, Any]:
    request, problem = _validated(body)
    if problem:
        return problem

    sb = supabase_admin()
    protocol, refusal = _owned_and_unused(sb, protocol_id, user.id)
    if refusal:
        return refusal

    existing = _code_taken(sb, request.protocol_code, user.id, exclude_id=protocol_id)
    if existing:
        return _fail("PROTOCOL_CODE_TAKEN", f'{request.protocol_code} is already used by "{existing.get("name")}".')

    row = (
        sb.table("protocols")
        .update(
            {
                "protocol_code": request.protocol_code,
                "name": request.name,
                "version": request.version,
                "steps": _stored_steps(request.steps),
            }
        )
        .eq("id", protocol_id)
        .execute()
    ).data[0]

    write_event(
        sb,
        experiment_id=None,
        event_type="PROTOCOL_UPDATED",
        entity_type="protocol",
        entity_id=protocol_id,
        payload={"before": _snapshot(protocol), "after": _snapshot(row)},
        actor_id=user.id,
    )
    return {"success": True, "protocol": row}


@router.delete("/protocols/{protocol_id}")
async def delete_protocol(protocol_id: str, user: User = Depends(get_current_user)) -> dict[str, Any]:
    sb = supabase_admin()
    protocol, refusal = _owned_and_unused(sb, protocol_id, user.id)
    if refusal:
        return refusal

    sb.table("protocols").delete().eq("id", protocol_id).execute()
    write_event(
        sb,
        experiment_id=None,
        event_type="PROTOCOL_DELETED",
        entity_type="protocol",
        entity_id=protocol_id,
        payload=_snapshot(protocol),
        actor_id=user.id,
    )
    return {"success": True, "deleted": protocol_id}
