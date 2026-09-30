"""The completeness engine: is every protocol requirement met, and what is missing?

Deterministic, read-only, and keyed on (protocol step, sample, requirement) —
never on measurement type alone. A temperature stamped with step 2 says nothing
about step 7 (specs/007 FR-701).

Completeness and compliance are separate questions. A reading outside its range
still exists, and a hold that ran long was still completed; both are
deviations, which this module reports but never counts as missing
(specs/007 spec US4, FR-704/705).

Nothing here writes. Deviations are raised when the reading is taken or the step
is completed, so calling this any number of times cannot create one.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from ..db import correction_count, effective
from . import durations
from .requirements import (
    DeviationReviewRequirement,
    MeasurementRequirement,
    ObservationRequirement,
    Requirement,
    SampleRequirement,
    StepExecutionRequirement,
    canonical_type,
    is_timed,
    step_requirements,
    step_timing,
)

STEP_EVENTS = ("PROTOCOL_STEP_STARTED", "PROTOCOL_STEP_COMPLETED", "DEVIATIONS_REVIEWED")


# ---------------------------------------------------------------------------
# reads
# ---------------------------------------------------------------------------


def _rows(sb, table: str, experiment_id: str) -> list[dict[str, Any]]:
    return sb.table(table).select("*").eq("experiment_id", experiment_id).execute().data or []


def load_step_events(sb, experiment_id: str) -> list[dict[str, Any]]:
    """Step starts, step completions and deviation reviews, oldest first."""
    return (
        sb.table("events")
        .select("*")
        .eq("experiment_id", experiment_id)
        .in_("event_type", list(STEP_EVENTS))
        .order("created_at")
        .execute()
    ).data or []


def _of(events: list[dict[str, Any]], event_type: str, index: int | None = None) -> list[dict[str, Any]]:
    return [
        e
        for e in events
        if e["event_type"] == event_type and (index is None or (e.get("payload") or {}).get("step_index") == index)
    ]


def step_started(events: list[dict[str, Any]], index: int) -> dict[str, Any] | None:
    """The first start of this step. A later re-entry does not move it."""
    found = _of(events, "PROTOCOL_STEP_STARTED", index)
    return found[0] if found else None


def step_completed(events: list[dict[str, Any]], index: int) -> dict[str, Any] | None:
    found = _of(events, "PROTOCOL_STEP_COMPLETED", index)
    return found[-1] if found else None


def latest_review(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    found = _of(events, "DEVIATIONS_REVIEWED")
    return found[-1] if found else None


def parse_time(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


# ---------------------------------------------------------------------------
# per-requirement evaluation
# ---------------------------------------------------------------------------


def step_ref(step: dict[str, Any]) -> dict[str, Any]:
    return {"step_index": step["index"], "step_code": step.get("id"), "step_name": step.get("name")}


def _where(step: dict[str, Any]) -> str:
    return f"step {step['index'] + 1}, {step.get('name')}"


def _newest(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    return max(rows, key=lambda r: r.get("recorded_at") or "", default=None)


def _no_samples(item: dict[str, Any], what: str, step) -> list[dict[str, Any]]:
    """"For every sample" with none registered is missing, never vacuously met (FR-714)."""
    return [
        {
            **item,
            "sample_code": None,
            "no_samples": True,
            "satisfied": False,
            "message": f"No samples are registered, so no sample has {what} for {_where(step)}.",
        }
    ]


def _measurement_items(req: MeasurementRequirement, step, samples, live) -> list[dict[str, Any]]:
    if req.scope == "all_samples" and not samples:
        base = {"requirement_type": "measurement", "measurement_type": req.measurement_type}
        return _no_samples(base, req.measurement_type, step)
    wanted = canonical_type(req.measurement_type)
    at_step = [
        m
        for m in live
        if m.get("protocol_step_index") == step["index"] and canonical_type(m["measurement_type"]) == wanted
    ]
    expected = {
        k: v for k, v in (("exact", req.exact), ("min", req.min), ("max", req.max), ("unit", req.unit)) if v is not None
    }
    targets = samples if req.scope == "all_samples" else [None]

    items = []
    for sample in targets:
        rows = at_step if sample is None else [m for m in at_step if m.get("sample_id") == sample["id"]]
        found = _newest(rows)
        code = sample["sample_code"] if sample else None
        item: dict[str, Any] = {
            "requirement_type": "measurement",
            "measurement_type": req.measurement_type,
            "sample_code": code,
            "satisfied": found is not None,
        }
        if expected:
            item["expected"] = expected
        if found:
            value = float(found["value"])
            item.update(
                measurement_id=found["id"],
                value=value,
                unit=found.get("unit"),
                # True when the value misses the exact value or the range.
                out_of_range=req.deviates(value),
            )
        else:
            who = code or "This run"
            item["message"] = f"{who} has no {req.measurement_type} for {_where(step)}."
        items.append(item)
    return items


def _observation_items(req: ObservationRequirement, step, samples, observations) -> list[dict[str, Any]]:
    if req.scope == "all_samples" and not samples:
        return _no_samples({"requirement_type": "observation"}, "an observation", step)
    at_step = [o for o in observations if o.get("protocol_step_index") == step["index"]]
    # A note about the whole run is not a note about each sample, and still does
    # not count - but say so, or the user believes it was recorded and overrides
    # the step gate (.specify/bugs/observations-not-counted).
    run_level = any(o.get("sample_id") is None for o in at_step)
    targets = samples if req.scope == "all_samples" else [None]
    items = []
    for sample in targets:
        rows = at_step if sample is None else [o for o in at_step if o.get("sample_id") == sample["id"]]
        found = _newest(rows)
        code = sample["sample_code"] if sample else None
        item: dict[str, Any] = {"requirement_type": "observation", "sample_code": code, "satisfied": found is not None}
        if found:
            item.update(observation_id=found["id"], observation=found.get("observation"))
        else:
            item["message"] = f"{code or 'This run'} has no observation for {_where(step)}."
            if sample is not None and run_level:
                item["run_level_observation"] = True
                item["message"] += f" {RUN_LEVEL_NOTE}"
        items.append(item)
    return items


#: Why a whole-run observation did not satisfy a sample. Also spoken by the step gate.
RUN_LEVEL_NOTE = (
    "An observation was recorded for the whole run at this step; it does not count for a "
    "sample. Record it for all samples to count it."
)


def _execution_items(req: StepExecutionRequirement, step, events) -> list[dict[str, Any]]:
    started = step_started(events, step["index"])
    completed = step_completed(events, step["index"])
    items = []
    if req.must_start:
        items.append(
            {
                "requirement_type": "step_execution",
                "check": "started",
                "satisfied": started is not None,
                **(
                    {"started_at": (started.get("payload") or {}).get("started_at")}
                    if started
                    else {"message": f"{step.get('name')} has not been started."}
                ),
            }
        )
    if req.must_complete:
        item: dict[str, Any] = {"requirement_type": "step_execution", "check": "completed", "satisfied": completed is not None}
        if completed:
            item["completed_at"] = (completed.get("payload") or {}).get("completed_at")
        else:
            item["message"] = f"{step.get('name')} has not been completed."
        items.append(item)
    return items


def _review_item(events, deviations) -> dict[str, Any]:
    review = latest_review(events)
    count = len(deviations)
    item: dict[str, Any] = {"requirement_type": "deviation_review", "deviation_count": count}
    if review is None:
        return {**item, "satisfied": False, "message": "Deviations have not been reviewed."}
    payload = review.get("payload") or {}
    seen = int(payload.get("deviation_count") or 0)
    item.update(reviewed_at=payload.get("reviewed_at"), reviewed_deviation_count=seen)
    if count > seen:
        # A deviation logged after the review has not been reviewed.
        return {**item, "satisfied": False, "message": f"{count - seen} deviation(s) were logged after the last review."}
    return {**item, "satisfied": True}


def _sample_item(req: SampleRequirement, samples) -> dict[str, Any]:
    matching = [s["sample_code"] for s in samples if str(s.get("sample_type") or "").casefold() == req.sample_type]
    item: dict[str, Any] = {
        "requirement_type": "samples",
        "sample_type": req.sample_type,
        "expected_count": req.count,
        "actual_count": len(matching),
        "sample_codes": matching,
        "satisfied": len(matching) >= req.count,
    }
    if not item["satisfied"]:
        item["message"] = (
            f"The protocol needs at least {req.count} {req.sample_type} sample(s); this run has {len(matching)}."
        )
    return item


def _evaluate(req: Requirement, step, samples, live, observations, deviations, events) -> list[dict[str, Any]]:
    if isinstance(req, MeasurementRequirement):
        return _measurement_items(req, step, samples, live)
    if isinstance(req, ObservationRequirement):
        return _observation_items(req, step, samples, observations)
    if isinstance(req, StepExecutionRequirement):
        return _execution_items(req, step, events)
    if isinstance(req, DeviationReviewRequirement):
        return [_review_item(events, deviations)]
    return [_sample_item(req, samples)]


# ---------------------------------------------------------------------------
# timing (reported, never a completeness condition)
# ---------------------------------------------------------------------------


def timing_view(step: dict[str, Any], events: list[dict[str, Any]], deviations: list[dict[str, Any]]) -> dict[str, Any]:
    timing = step_timing(step)
    started = step_started(events, step["index"])
    completed = step_completed(events, step["index"])
    view: dict[str, Any] = {
        "expected_seconds": timing.expected_duration_seconds,
        "min_seconds": timing.min_duration_seconds,
        "max_seconds": timing.max_duration_seconds,
        "started_at": (started.get("payload") or {}).get("started_at") if started else None,
        "completed_at": None,
        "elapsed_seconds": None,
        "status": "not_started" if started is None else "running",
    }
    if started and completed:
        payload = completed.get("payload") or {}
        begin, end = parse_time(view["started_at"]), parse_time(payload.get("completed_at"))
        if begin and end:
            elapsed = int((end - begin).total_seconds())
            view.update(
                completed_at=payload["completed_at"],
                elapsed_seconds=elapsed,
                elapsed_spoken=durations.format_duration(elapsed),
                status=timing.status(elapsed),
            )
    key = f"step:{step['index']}:DURATION"
    deviation = next((d for d in deviations if d.get("source_key") == key), None)
    if deviation:
        view["deviation_id"] = deviation["id"]
    return view


# ---------------------------------------------------------------------------
# the whole run
# ---------------------------------------------------------------------------


#: What the user records AT a step. Execution and review requirements are left
#: out: completing the step is what satisfies them.
GATED = {"measurement", "observation", "samples"}


def missing_at(sb, experiment: dict[str, Any], steps: list[dict[str, Any]], index: int) -> list[dict[str, Any]]:
    """The step's own unrecorded items, for the step gate. Raises InvalidProtocol like evaluate."""
    return [
        m
        for m in evaluate(sb, experiment, steps)["missing"]
        if m["step_index"] == index and m["requirement_type"] in GATED
    ]


def evaluate(sb, experiment: dict[str, Any], steps: list[dict[str, Any]]) -> dict[str, Any]:
    """Every requirement of every step, per sample. Raises InvalidProtocol on a malformed step."""
    experiment_id = experiment["id"]
    all_samples = sorted(_rows(sb, "samples", experiment_id), key=lambda s: s["sample_code"])
    samples = [s for s in all_samples if s.get("status", "active") == "active"]
    measurements = _rows(sb, "measurements", experiment_id)
    live = effective(measurements)
    observations = _rows(sb, "observations", experiment_id)
    deviations = _rows(sb, "deviations", experiment_id)
    events = load_step_events(sb, experiment_id)

    reports: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    for step in steps:
        items: list[dict[str, Any]] = []
        for req in step_requirements(step):
            items.extend(_evaluate(req, step, samples, live, observations, deviations, events))
        report: dict[str, Any] = {**step_ref(step), "complete": all(i["satisfied"] for i in items), "requirements": items}
        if is_timed(step):
            report["timing"] = timing_view(step, events, deviations)
        reports.append(report)
        missing.extend(
            {**step_ref(step), **{k: v for k, v in item.items() if k != "satisfied"}}
            for item in items
            if not item["satisfied"]
        )

    return {
        "complete": not missing,
        "missing": missing,
        "steps": reports,
        "summary": {
            "samples": len(all_samples),
            "measurements": len(live),
            "observations": len(observations),
            "corrections": correction_count(measurements),
            "deviations": len(deviations),
            "open_deviations": sum(1 for d in deviations if d.get("status", "open") == "open"),
        },
    }
