"""Experiment lifecycle writes: create (DRAFT/READY) and start (READY → RUNNING).

One implementation, two callers: the quick-create routes the web app uses
(routers/experiments.py) and, once amendment A-1 lands, the voice tools
create_experiment / start_experiment (specs/003-post-mvp-features T040), which
MUST wrap these rather than re-implement them (Constitution Principle IV).

Callers validate first, so a rejected request never reaches a write here.
Every timestamp comes from this server or the database, never from a caller.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Literal

from .audit import write_event
from .samples import add_samples

CODE_RETRIES = 3


class CodeUnavailable(Exception):
    """Every generated code collided; the caller reports CODE_UNAVAILABLE."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _like_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def code_prefix(protocol: dict[str, Any] | None) -> str:
    """The protocol's code, uppercased, or EXP when there is none (research R-205)."""
    return str((protocol or {}).get("protocol_code") or "EXP").strip().upper()


def next_experiment_code(sb, prefix: str) -> str:
    """PREFIX-n, one past the highest n in use by ANYONE: experiment_code is globally unique."""
    rows = (
        sb.table("experiments").select("experiment_code").ilike("experiment_code", f"{_like_escape(prefix)}-%").execute()
    ).data or []
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$", re.IGNORECASE)
    numbers = [int(m.group(1)) for r in rows if (m := pattern.match(str(r.get("experiment_code") or "")))]
    return f"{prefix}-{max(numbers, default=0) + 1}"


def _is_unique_violation(exc: Exception) -> bool:
    text = str(exc)
    return "23505" in text or "duplicate key value violates unique constraint" in text


def create_experiment(
    sb,
    *,
    user_id: str,
    name: str,
    description: str | None,
    protocol: dict[str, Any] | None,
    sample_codes: list[str],
    session_id: str | None = None,
    source: Literal["ui", "voice"],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Insert the experiment (READY with a protocol, else DRAFT), its samples, and their events."""
    status = "READY" if protocol else "DRAFT"
    prefix = code_prefix(protocol)

    for _ in range(CODE_RETRIES):
        code = next_experiment_code(sb, prefix)
        try:
            experiment = (
                sb.table("experiments")
                .insert(
                    {
                        "experiment_code": code,
                        "name": name,
                        "description": description,
                        "protocol_id": (protocol or {}).get("id"),
                        "owner_id": user_id,
                        "status": status,
                    }
                )
                .execute()
            ).data[0]
            break
        except Exception as exc:  # noqa: BLE001 — only a code collision is retried
            if not _is_unique_violation(exc):
                raise
    else:
        raise CodeUnavailable(prefix)

    write_event(
        sb,
        experiment_id=experiment["id"],
        event_type="EXPERIMENT_CREATED",
        entity_type="experiment",
        entity_id=experiment["id"],
        payload={
            "experiment_code": experiment["experiment_code"],
            "name": experiment["name"],
            "protocol_id": experiment.get("protocol_id"),
            "status": experiment["status"],
        },
        actor_id=user_id,
        voice_session_id=session_id,
    )
    samples = add_samples(sb, experiment, sample_codes, actor_id=user_id, session_id=session_id, source=source)
    return experiment, samples


def start_error(experiment: dict[str, Any]) -> dict[str, Any] | None:
    """Why this experiment cannot start, as an error body, or None if it can."""
    if not experiment.get("protocol_id"):
        return {
            "error": "NO_PROTOCOL",
            "message": f"{experiment['experiment_code']} has no protocol yet. Choose one before starting.",
        }
    if experiment.get("status") != "READY":
        return {
            "error": "INVALID_STATE",
            "message": f"{experiment['experiment_code']} is {str(experiment.get('status')).lower()}, so it cannot be started.",
            "detail": {"status": experiment.get("status")},
        }
    return None


def start_experiment(sb, *, experiment: dict[str, Any], user_id: str, session_id: str | None = None) -> dict[str, Any]:
    """READY → RUNNING. The caller has already checked start_error() and ownership."""
    started = (
        sb.table("experiments")
        .update({"status": "RUNNING", "started_at": _now(), "current_step_index": 0})
        .eq("id", experiment["id"])
        .execute()
    ).data[0]
    write_event(
        sb,
        experiment_id=experiment["id"],
        event_type="EXPERIMENT_STARTED",
        entity_type="experiment",
        entity_id=experiment["id"],
        payload={"protocol_id": experiment.get("protocol_id"), "status_from": "READY"},
        actor_id=user_id,
        voice_session_id=session_id,
    )
    return started
