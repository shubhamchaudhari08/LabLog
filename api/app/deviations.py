"""Deviations: one writer for the ones users log and the ones the system detects.

A system deviation (a reading outside its step's range, a timed step outside its
window) carries a `source_key` naming what raised it. The key is unique per
experiment (migration 0003), so the event that raised it can run again — a
step completed twice, a retried call — without logging it twice
(specs/007 research R-704).
"""

from __future__ import annotations

from typing import Any

from .audit import write_event


def _existing(sb, experiment_id: str, source_key: str) -> dict[str, Any] | None:
    rows = (
        sb.table("deviations")
        .select("*")
        .eq("experiment_id", experiment_id)
        .eq("source_key", source_key)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def _is_unique_violation(exc: Exception) -> bool:
    text = str(exc)
    return "23505" in text or "duplicate key value violates unique constraint" in text


def record_deviation(
    sb,
    *,
    experiment_id: str,
    description: str,
    step_index: int | None,
    actor_id: str | None,
    session_id: str | None = None,
    type: str | None = None,
    severity: str = "medium",
    reason: str | None = None,
    code: str | None = None,
    source_key: str | None = None,
    measurement_id: str | None = None,
) -> tuple[dict[str, Any], bool]:
    """(the stored deviation, whether this call created it). Audited when created."""
    if source_key:
        found = _existing(sb, experiment_id, source_key)
        if found:
            return found, False

    row: dict[str, Any] = {
        "experiment_id": experiment_id,
        "protocol_step_index": step_index,
        "type": type,
        "description": description,
        "reason": reason,
        "severity": severity,
        "status": "open",
    }
    # Only set when present, so a user-logged deviation writes exactly the
    # columns it always did.
    if code:
        row["code"] = code
    if source_key:
        row["source_key"] = source_key
    if measurement_id:
        row["measurement_id"] = measurement_id

    try:
        inserted = sb.table("deviations").insert(row).execute().data[0]
    except Exception as exc:  # noqa: BLE001 — only a lost race on source_key is recoverable
        if source_key and _is_unique_violation(exc):
            found = _existing(sb, experiment_id, source_key)
            if found:
                return found, False
        raise

    write_event(
        sb,
        experiment_id=experiment_id,
        event_type="DEVIATION_CREATED",
        entity_type="deviation",
        entity_id=inserted["id"],
        payload={
            "description": description,
            "type": type,
            "severity": severity,
            **{k: v for k, v in (("code", code), ("source_key", source_key), ("measurement_id", measurement_id)) if v},
        },
        actor_id=actor_id,
        voice_session_id=session_id,
    )
    return inserted, True
