"""Database reads used by the voice bootstrap and the tool handlers.

Handlers never construct a client; they receive one. That is what makes the
validation layer unit-testable without a live database (Constitution,
Development Workflow) — and the validation layer is the product's central
claim, so it has to be testable cheaply and often.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException


class ExperimentContext(dict):
    """Experiment + protocol + samples, as loaded once per session or per call."""

    @property
    def experiment(self) -> dict[str, Any]:
        return self["experiment"]

    @property
    def protocol(self) -> dict[str, Any] | None:
        return self.get("protocol")

    @property
    def samples(self) -> list[dict[str, Any]]:
        return self.get("samples", [])

    @property
    def sample_codes(self) -> list[str]:
        return [s["sample_code"] for s in self.samples]

    @property
    def current_step(self) -> dict[str, Any] | None:
        steps = (self.protocol or {}).get("steps") or []
        index = self.experiment.get("current_step_index", 0)
        if 0 <= index < len(steps):
            return steps[index]
        return None


def load_experiment(sb, experiment_id: str) -> dict[str, Any] | None:
    result = sb.table("experiments").select("*").eq("id", experiment_id).execute()
    rows = result.data or []
    return rows[0] if rows else None


def load_protocol(sb, protocol_id: str | None) -> dict[str, Any] | None:
    if not protocol_id:
        return None
    result = sb.table("protocols").select("*").eq("id", protocol_id).execute()
    rows = result.data or []
    return rows[0] if rows else None


def load_samples(sb, experiment_id: str) -> list[dict[str, Any]]:
    result = (
        sb.table("samples")
        .select("*")
        .eq("experiment_id", experiment_id)
        .order("sample_code")
        .execute()
    )
    return result.data or []


def get_experiment_context(sb, experiment_id: str, user_id: str) -> ExperimentContext:
    """Authorize, then load everything a session or a handler needs.

    Authorization happens here rather than after loading, so an unauthorized
    caller never causes protocol or sample reads.
    """
    experiment = load_experiment(sb, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="EXPERIMENT_NOT_FOUND")
    if experiment.get("owner_id") != user_id:
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    return ExperimentContext(
        experiment=experiment,
        protocol=load_protocol(sb, experiment.get("protocol_id")),
        samples=load_samples(sb, experiment_id),
    )


def current_measurements(sb, experiment_id: str) -> list[dict[str, Any]]:
    """Non-superseded measurements only — the `superseded_by is null` filter is
    what stops a correction reading as a duplicate row."""
    result = (
        sb.table("measurements")
        .select("*")
        .eq("experiment_id", experiment_id)
        .is_("superseded_by", "null")
        .execute()
    )
    return result.data or []


def latest_measurement(
    sb, experiment_id: str, sample_id: str, measurement_type: str
) -> dict[str, Any] | None:
    """The correction target: the one live row for this sample and type."""
    result = (
        sb.table("measurements")
        .select("*")
        .eq("experiment_id", experiment_id)
        .eq("sample_id", sample_id)
        .eq("measurement_type", measurement_type)
        .is_("superseded_by", "null")
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def completion_summary(sb, experiment_id: str) -> dict[str, Any]:
    """Figures for the completion summary, computed from stored rows.

    Every number here is derived from the database and never from the model
    (FR-011). A model-computed duration is a plausible-looking number with no
    relationship to the data.
    """
    experiment = load_experiment(sb, experiment_id) or {}

    measurements = (
        sb.table("measurements").select("*").eq("experiment_id", experiment_id).execute().data
        or []
    )
    observations = (
        sb.table("observations").select("id").eq("experiment_id", experiment_id).execute().data
        or []
    )
    deviations = (
        sb.table("deviations").select("id").eq("experiment_id", experiment_id).execute().data or []
    )

    live = [m for m in measurements if m.get("superseded_by") is None]
    corrections = [m for m in measurements if m.get("correction_reason")]

    duration_minutes = None
    started, completed = experiment.get("started_at"), experiment.get("completed_at")
    if started and completed:
        from datetime import datetime

        def _parse(value: str) -> datetime:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))

        duration_minutes = int((_parse(completed) - _parse(started)).total_seconds() // 60)

    return {
        "duration_minutes": duration_minutes,
        "measurement_count": len(live),
        "correction_count": len(corrections),
        "observation_count": len(observations),
        "deviation_count": len(deviations),
        "samples_measured": len({m.get("sample_id") for m in live if m.get("sample_id")}),
    }
