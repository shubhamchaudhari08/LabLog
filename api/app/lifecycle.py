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
from .db import load_protocol
from .samples import add_samples
from .tools import requirements as reqs

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
    sample_types: dict[str, str] | None = None,
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
    samples = add_samples(
        sb, experiment, sample_codes, actor_id=user_id, session_id=session_id, source=source, sample_types=sample_types
    )
    return experiment, samples


def _samples_phrase(count: int, sample_type: str) -> str:
    return f"{count} {sample_type} sample{'' if count == 1 else 's'}"


def sample_shortfall(protocol: dict[str, Any] | None, samples: list[dict[str, Any]]) -> dict[str, Any] | None:
    """SAMPLES_REQUIRED, or None when the samples meet what the protocol asks for.

    Samples can only be added when an experiment is created, so a run that starts
    short can never be completed (specs/007 FR-713, research R-721). `samples` are
    {code, sample_type}. Per type the LARGEST count any step asks for is needed,
    not the sum; and a protocol that records anything "for every sample" needs at
    least one. A malformed step is skipped here, as while recording: completeness
    reports it as PROTOCOL_INVALID.
    """
    needed: dict[str, int] = {}
    every_sample = False
    for step in (protocol or {}).get("steps") or []:
        try:
            found = reqs.step_requirements(step)
        except reqs.InvalidProtocol:
            continue
        for req in found:
            if isinstance(req, reqs.SampleRequirement):
                needed[req.sample_type] = max(needed.get(req.sample_type, 0), req.count)
            elif isinstance(req, (reqs.MeasurementRequirement, reqs.ObservationRequirement)):
                every_sample = every_sample or req.scope == "all_samples"

    have = {t: sum(1 for s in samples if str(s.get("sample_type") or "").casefold() == t) for t in needed}
    short = [{"sample_type": t, "count": n, "have": have[t]} for t, n in needed.items() if have[t] < n]
    empty = every_sample and not samples
    if not short and not empty:
        return None

    if short:
        wants = " and ".join(_samples_phrase(n, t) for t, n in needed.items())
        got = " and ".join(_samples_phrase(have[t], t) for t in needed if have[t]) or "none of them"
        message = f"This protocol needs at least {wants}; the list has {got}."
    else:
        message = "This protocol records readings for every sample, so list at least one sample."
    return {
        "error": "SAMPLES_REQUIRED",
        "message": message,
        "detail": {"needed": short, "any_sample": empty},
    }


def active_samples(sb, experiment_id: str) -> list[dict[str, Any]]:
    """The run's samples as {code, sample_type}, as sample_shortfall reads them."""
    rows = sb.table("samples").select("*").eq("experiment_id", experiment_id).execute().data or []
    return [
        {"code": r["sample_code"], "sample_type": r.get("sample_type")}
        for r in rows
        if r.get("status", "active") == "active"
    ]


def start_error(sb, experiment: dict[str, Any]) -> dict[str, Any] | None:
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
    # A READY run made before samples were checked at creation (research R-721).
    return sample_shortfall(load_protocol(sb, experiment["protocol_id"]), active_samples(sb, experiment["id"]))


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
