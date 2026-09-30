"""Step timers, derived from the audit trail (specs/004-step-timers data-model §2).

A timer has no row of its own. It is a TIMER_STARTED event, possibly followed by
a TIMER_CANCELLED event for the same entity_id, and its state is computed on
read: running until its server end time, then completed. Nothing writes
"completed", because nothing is present to observe it (Constitution Principle V).

A non-RUNNING experiment never reaches this code: step_timer is in
MUTATING_TOOLS, so the dispatcher refuses it first. That is why there is no
"stopped" state.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from .durations import format_duration

TIMER_EVENTS = ("TIMER_STARTED", "TIMER_CANCELLED")


def load_timer_events(sb, experiment_id: str) -> list[dict[str, Any]]:
    result = (
        sb.table("events")
        .select("*")
        .eq("experiment_id", experiment_id)
        .in_("event_type", list(TIMER_EVENTS))
        .order("created_at", desc=True)
        .limit(40)
        .execute()
    )
    return result.data or []


def completion_instructions(duration_spoken: str, step_index: int | None, step_name: str | None) -> str:
    """What the agent is asked to say at zero (research R-305). Server-authored:
    the browser passes it to reply.create verbatim and writes no prompt text."""
    where = f" on step {step_index + 1}, {step_name}," if step_index is not None and step_name else ""
    return (
        f"Tell the user, in one short sentence, that the timer for {duration_spoken}{where} is complete. "
        "Do not add anything else."
    )


def timer_view(start: dict[str, Any], state: str, now: datetime) -> dict[str, Any]:
    payload = start.get("payload") or {}
    ends_at = datetime.fromisoformat(payload["ends_at"])
    duration = int(payload["duration_seconds"])
    protocol_seconds = payload.get("protocol_seconds")
    remaining = max(0, math.ceil((ends_at - now).total_seconds())) if state == "running" else 0
    duration_spoken = format_duration(duration)
    return {
        "timer_id": start["entity_id"],
        "state": state,
        "duration_seconds": duration,
        "duration_spoken": duration_spoken,
        "started_at": payload["started_at"],
        "ends_at": payload["ends_at"],
        "remaining_seconds": remaining,
        "remaining_spoken": format_duration(remaining),
        "step_index": payload.get("step_index"),
        "step_name": payload.get("step_name"),
        "protocol_seconds": protocol_seconds,
        "differs_from_protocol": protocol_seconds is not None and duration != protocol_seconds,
        "completion_instructions": completion_instructions(
            duration_spoken, payload.get("step_index"), payload.get("step_name")
        ),
    }


def derive_timer(events: list[dict[str, Any]], now: datetime) -> dict[str, Any] | None:
    """The experiment's current timer: the latest start that was not cancelled."""
    cancelled = {e["entity_id"] for e in events if e["event_type"] == "TIMER_CANCELLED"}
    starts = [e for e in events if e["event_type"] == "TIMER_STARTED" and e["entity_id"] not in cancelled]
    if not starts:
        return None
    # research R-312: if two uncancelled starts ever exist, the latest wins.
    latest = max(starts, key=lambda e: ((e.get("payload") or {}).get("started_at", ""), e.get("created_at") or ""))
    ends_at = datetime.fromisoformat(latest["payload"]["ends_at"])
    return timer_view(latest, "running" if now < ends_at else "completed", now)
