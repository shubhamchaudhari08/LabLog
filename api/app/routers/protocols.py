"""POST /protocols — create a protocol from the Protocols screen.

This is a second write route beside POST /tools, and it is deliberate
(specs/002-manual-protocol-authoring/plan.md, Complexity Tracking). /tools is
experiment-scoped: ownership is anchored on the experiment, and a library
protocol belongs to none. So this route runs the same sequence itself:
authenticate → validate structurally → validate semantically → write → audit →
return the stored row.

Only creation lives here. Changing the steps of an existing protocol stays on
the voice path (write_protocol_step), which already refuses shared protocols.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
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


def _code_taken(sb, code: str, user_id: str) -> dict[str, Any] | None:
    """A protocol this user can already read under the same code, ignoring case.

    ponytail: check-then-insert, so two simultaneous saves of one code can both
    pass. Fine for one user; add a partial unique index if that ever matters
    (research R-105).
    """
    readable = (sb.table("protocols").select("*").eq("owner_id", user_id).execute().data or []) + (
        sb.table("protocols").select("*").is_("owner_id", "null").execute().data or []
    )
    wanted = code.casefold()
    return next((p for p in readable if str(p.get("protocol_code", "")).casefold() == wanted), None)


@router.post("/protocols")
async def create_protocol(
    body: dict[str, Any], user: User = Depends(get_current_user)
) -> dict[str, Any]:
    # 1. JWT verified by the dependency; a failure raised 401 before we got here.

    # 2. Structural validation.
    try:
        request = CreateProtocolRequest(**body)
    except ValidationError as exc:
        return _fail(
            "INVALID_ARGS",
            "Some protocol fields are missing or invalid.",
            errors=exc.errors(include_url=False),
        )

    # 3. Semantic validation against stored reality — all before any write.
    for index, step in enumerate(request.steps):
        for reading in step.readings:
            listed = vocabulary.lookup(reading.type)
            if listed and reading.unit and reading.unit not in listed.units:
                return _fail(
                    "INVALID_UNIT",
                    f"{listed.name} is recorded in {', '.join(listed.units)}, not {reading.unit}.",
                    step_index=index,
                    type=listed.name,
                    allowed=list(listed.units),
                )

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
