"""The append-only audit trail.

Constitution Principle II: every mutation appends an event row. The invariant "every data row has at least one
corresponding event row" is directly assertable, and holding it is the
mechanical proof that no write path bypassed the dispatcher.
"""

from __future__ import annotations

from typing import Any, Literal

EventType = Literal[
    "MEASUREMENT_CREATED",
    "MEASUREMENT_CORRECTED",
    "OBSERVATION_CREATED",
    "DEVIATION_CREATED",
    "PROTOCOL_STEP_COMPLETED",
    "EXPERIMENT_COMPLETED",
]


def write_event(
    sb,
    *,
    experiment_id: str,
    event_type: EventType,
    entity_type: str | None = None,
    entity_id: str | None = None,
    payload: dict[str, Any] | None = None,
    actor_id: str | None = None,
    voice_session_id: str | None = None,
) -> dict[str, Any]:
    """Append one event. Never updates, never deletes.

    `voice_session_id` is what makes the trail interesting rather than merely
    present: combined with a measurement's `raw_spoken_value` it reconstructs
    what was *said* alongside what was *stored*.

    No timestamp parameter exists, by design — `created_at` defaults to the
    database's `now()`. A caller cannot supply a time because there is nowhere
    to put one (Constitution Principle I).
    """
    row = {
        "experiment_id": experiment_id,
        "event_type": event_type,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "payload": payload or {},
        "actor_id": actor_id,
        "voice_session_id": voice_session_id,
    }
    result = sb.table("events").insert(row).execute()
    inserted = result.data or []
    return inserted[0] if inserted else row
