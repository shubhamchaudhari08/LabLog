"""Tool handlers — authorize → resolve → validate → write → audit → return.

Authorization already happened in the dispatcher, once, before any handler runs
(research.md R-006). What remains here is *semantic* validation: structural
validation proved the model produced well-formed arguments, not true ones.

Every handler takes `sb` as a parameter and never constructs a client, which is
what makes this layer — the product's central claim — testable without a live
database.

Two rules hold throughout:
  * Validate before writing. A handler that validates afterwards satisfies every
    response assertion while corrupting the database.
  * Return the values that were *stored*, not the ones that were *requested*.
    The agent's spoken confirmation is generated from this response.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from ..audit import write_event
from ..db import completion_summary, latest_measurement
from .models import (
    CompleteExperimentArgs,
    CompleteProtocolStepArgs,
    CorrectMeasurementArgs,
    CreateDeviationArgs,
    GetSampleHistoryArgs,
    NoArgs,
    RecordMeasurementArgs,
    RecordObservationArgs,
)
from .normalize import resolve_sample

# ---------------------------------------------------------------------------
# result helpers
# ---------------------------------------------------------------------------


def _ok(**data: Any) -> dict[str, Any]:
    return {"success": True, "data": data}


def _err(error: str, message: str, **detail: Any) -> dict[str, Any]:
    """Every error carries a human-readable message, because the agent speaks it.

    "Sample A99 does not exist in STAB-104" produces a useful spoken reply;
    "validation failed" produces an apology.
    """
    body: dict[str, Any] = {"success": False, "error": error, "message": message}
    if detail:
        body["detail"] = detail
    return body


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# shared lookups
# ---------------------------------------------------------------------------


def _samples(sb, experiment_id: str) -> list[dict[str, Any]]:
    result = (
        sb.table("samples")
        .select("*")
        .eq("experiment_id", experiment_id)
        .order("sample_code")
        .execute()
    )
    return result.data or []


def _protocol(sb, experiment: dict[str, Any]) -> dict[str, Any]:
    protocol_id = experiment.get("protocol_id")
    if not protocol_id:
        return {}
    result = sb.table("protocols").select("*").eq("id", protocol_id).execute()
    rows = result.data or []
    return rows[0] if rows else {}


def _steps(sb, experiment: dict[str, Any]) -> list[dict[str, Any]]:
    return _protocol(sb, experiment).get("steps") or []


def _step_at(sb, experiment: dict[str, Any], index: int) -> dict[str, Any] | None:
    steps = _steps(sb, experiment)
    return steps[index] if 0 <= index < len(steps) else None


def _resolve_or_error(sb, experiment: dict[str, Any], spoken: str | None):
    """Resolve a spoken sample code, or return the error the agent should speak."""
    samples = _samples(sb, experiment["id"])
    resolution = resolve_sample(spoken, samples)

    if resolution.status == "ambiguous":
        return None, _err(
            "SAMPLE_AMBIGUOUS",
            f"\"{spoken}\" could be more than one sample. Which did you mean?",
            candidates=resolution.candidates,
        )
    if not resolution.ok:
        return None, _err(
            "SAMPLE_NOT_FOUND",
            f"Sample {spoken} does not exist in {experiment['experiment_code']}.",
            valid_samples=resolution.candidates or [],
        )
    return resolution.sample, None


# ---------------------------------------------------------------------------
# 1. get_active_experiment
# ---------------------------------------------------------------------------


def get_active_experiment(*, sb, experiment, user_id, args: NoArgs, session_id=None):
    protocol = _protocol(sb, experiment)
    steps = protocol.get("steps") or []
    index = experiment.get("current_step_index", 0)
    current = steps[index] if 0 <= index < len(steps) else None

    return _ok(
        experiment_id=experiment["id"],
        experiment_code=experiment["experiment_code"],
        name=experiment["name"],
        status=experiment["status"],
        protocol={
            "code": protocol.get("protocol_code"),
            "name": protocol.get("name"),
            "version": protocol.get("version"),
            "step_count": len(steps),
        },
        current_step=current,
        samples=[
            {"code": s["sample_code"], "type": s.get("sample_type", "experimental")}
            for s in _samples(sb, experiment["id"])
        ],
    )


# ---------------------------------------------------------------------------
# 2. record_measurement — the core tool
# ---------------------------------------------------------------------------


def record_measurement(
    *, sb, experiment, user_id, args: RecordMeasurementArgs, session_id=None
):
    sample, error = _resolve_or_error(sb, experiment, args.sample_code)
    if error:
        return error

    # Pydantic accepts float('nan') as a valid float and Postgres `numeric`
    # accepts 'NaN'. A NaN measurement stores, renders, and silently poisons
    # every aggregate downstream — so it needs an explicit guard.
    if not math.isfinite(args.value):
        return _err(
            "INVALID_VALUE",
            "That value isn't a finite number. Could you repeat it?",
            received=str(args.value),
        )

    step_index = experiment.get("current_step_index", 0)
    unit = args.unit
    if not unit:
        step = _step_at(sb, experiment, step_index) or {}
        unit = (step.get("default_unit") or {}).get(args.measurement_type)
    if not unit and args.measurement_type.lower() == "ph":
        unit = "pH"  # dimensionless; asking "what unit?" would be absurd on camera
    if not unit:
        return _err(
            "UNIT_REQUIRED",
            f"What unit is that {args.measurement_type} in?",
            measurement_type=args.measurement_type,
            suggested_units=_SUGGESTED_UNITS.get(args.measurement_type, []),
        )

    inserted = (
        sb.table("measurements")
        .insert(
            {
                "experiment_id": experiment["id"],
                "sample_id": sample["id"],
                "measurement_type": args.measurement_type,
                "value": args.value,
                "unit": unit,
                "raw_spoken_value": args.raw_spoken_value,
                "protocol_step_index": step_index,
                "superseded_by": None,
                "correction_reason": None,
                "created_by": user_id,
            }
        )
        .execute()
    ).data[0]

    write_event(
        sb,
        experiment_id=experiment["id"],
        event_type="MEASUREMENT_CREATED",
        entity_type="measurement",
        entity_id=inserted["id"],
        payload={
            "sample_code": sample["sample_code"],
            "measurement_type": args.measurement_type,
            "value": args.value,
            "unit": unit,
        },
        actor_id=user_id,
        voice_session_id=session_id,
    )

    return _ok(
        measurement_id=inserted["id"],
        sample_code=sample["sample_code"],  # stored, not requested
        measurement_type=args.measurement_type,
        value=args.value,
        unit=unit,
        recorded_at=inserted.get("recorded_at"),
    )


_SUGGESTED_UNITS: dict[str, list[str]] = {
    "temperature": ["C", "F"],
    "mass": ["g", "mg", "kg"],
    "volume": ["mL", "L"],
    "concentration": ["mM", "M", "mg/mL"],
    "duration": ["minutes", "seconds"],
    "pressure": ["kPa", "bar"],
}


# ---------------------------------------------------------------------------
# 3. correct_measurement — supersede, never delete
# ---------------------------------------------------------------------------


def correct_measurement(
    *, sb, experiment, user_id, args: CorrectMeasurementArgs, session_id=None
):
    sample, error = _resolve_or_error(sb, experiment, args.sample_code)
    if error:
        return error

    if not math.isfinite(args.new_value):
        return _err("INVALID_VALUE", "That value isn't a finite number. Could you repeat it?")

    original = latest_measurement(sb, experiment["id"], sample["id"], args.measurement_type)
    if original is None:
        # A correction must never create a first record.
        return _err(
            "MEASUREMENT_NOT_FOUND",
            f"There's no {args.measurement_type} recorded for "
            f"{sample['sample_code']} yet, so there's nothing to correct.",
        )

    previous_value = float(original["value"])

    inserted = (
        sb.table("measurements")
        .insert(
            {
                "experiment_id": experiment["id"],
                "sample_id": sample["id"],
                "measurement_type": args.measurement_type,
                "value": args.new_value,
                "unit": original.get("unit"),
                "raw_spoken_value": None,
                "protocol_step_index": experiment.get("current_step_index", 0),
                "superseded_by": None,
                "correction_reason": args.reason,
                "created_by": user_id,
            }
        )
        .execute()
    ).data[0]

    # The original is marked superseded. Its value is untouched and remains
    # retrievable forever (Constitution Principle II).
    sb.table("measurements").update({"superseded_by": inserted["id"]}).eq(
        "id", original["id"]
    ).execute()

    write_event(
        sb,
        experiment_id=experiment["id"],
        event_type="MEASUREMENT_CORRECTED",
        entity_type="measurement",
        entity_id=inserted["id"],
        payload={
            "sample_code": sample["sample_code"],
            "measurement_type": args.measurement_type,
            "from": previous_value,
            "to": args.new_value,
            "superseded_id": original["id"],
            "reason": args.reason,
        },
        actor_id=user_id,
        voice_session_id=session_id,
    )

    return _ok(
        measurement_id=inserted["id"],
        sample_code=sample["sample_code"],
        measurement_type=args.measurement_type,
        previous_value=previous_value,
        new_value=args.new_value,
        unit=original.get("unit"),
    )


# ---------------------------------------------------------------------------
# 4. record_observation
# ---------------------------------------------------------------------------


def record_observation(
    *, sb, experiment, user_id, args: RecordObservationArgs, session_id=None
):
    text = (args.observation or "").strip()
    if not text:
        return _err("INVALID_ARGS", "I didn't catch the observation. Could you repeat it?")

    sample_id = None
    sample_code = None
    if args.sample_code:
        sample, error = _resolve_or_error(sb, experiment, args.sample_code)
        if error:
            return error
        sample_id, sample_code = sample["id"], sample["sample_code"]

    inserted = (
        sb.table("observations")
        .insert(
            {
                "experiment_id": experiment["id"],
                "sample_id": sample_id,
                "observation": text,
                "protocol_step_index": experiment.get("current_step_index", 0),
                "created_by": user_id,
            }
        )
        .execute()
    ).data[0]

    write_event(
        sb,
        experiment_id=experiment["id"],
        event_type="OBSERVATION_CREATED",
        entity_type="observation",
        entity_id=inserted["id"],
        payload={"observation": text, "sample_code": sample_code},
        actor_id=user_id,
        voice_session_id=session_id,
    )

    return _ok(observation_id=inserted["id"], observation=text, sample_code=sample_code)


# ---------------------------------------------------------------------------
# 5. create_deviation
# ---------------------------------------------------------------------------


def create_deviation(*, sb, experiment, user_id, args: CreateDeviationArgs, session_id=None):
    description = (args.description or "").strip()
    if not description:
        return _err("INVALID_ARGS", "What was the deviation?")

    inserted = (
        sb.table("deviations")
        .insert(
            {
                "experiment_id": experiment["id"],
                "protocol_step_index": experiment.get("current_step_index", 0),
                "type": args.type,
                "description": description,
                "reason": args.reason,
                "severity": args.severity,
                "status": "open",
            }
        )
        .execute()
    ).data[0]

    write_event(
        sb,
        experiment_id=experiment["id"],
        event_type="DEVIATION_CREATED",
        entity_type="deviation",
        entity_id=inserted["id"],
        payload={"description": description, "type": args.type, "severity": args.severity},
        actor_id=user_id,
        voice_session_id=session_id,
    )

    return _ok(
        deviation_id=inserted["id"],
        description=description,
        type=args.type,
        severity=args.severity,
        status="open",
    )


# ---------------------------------------------------------------------------
# 6. get_next_protocol_step — reads an array element. Cannot generate.
# ---------------------------------------------------------------------------


def get_next_protocol_step(*, sb, experiment, user_id, args: NoArgs, session_id=None):
    """This handler is the mechanical guarantee behind FR-017.

    There is no path through it that produces text not already in the database,
    so the agent cannot be talked into improvising procedure through it. The
    system prompt's refusal instruction is backed by an implementation with no
    generative capability at all.
    """
    steps = _steps(sb, experiment)
    next_index = experiment.get("current_step_index", 0) + 1

    if next_index >= len(steps):
        return _ok(is_final=True, message="That was the final step of the protocol.")

    step = steps[next_index]
    return _ok(
        step_index=step["index"],
        id=step["id"],
        name=step["name"],
        required_fields=step.get("required_fields", []),
        is_final=next_index == len(steps) - 1,
    )


# ---------------------------------------------------------------------------
# 7. complete_protocol_step
# ---------------------------------------------------------------------------


def complete_protocol_step(
    *, sb, experiment, user_id, args: CompleteProtocolStepArgs, session_id=None
):
    steps = _steps(sb, experiment)
    if not steps:
        return _err("INVALID_ARGS", "This experiment has no protocol steps.")

    current_index = experiment.get("current_step_index", 0)
    completed = steps[current_index] if 0 <= current_index < len(steps) else None

    # Clamped rather than an error: the final step is a terminal position, not a
    # failure condition (data-model.md V9).
    next_index = min(current_index + 1, len(steps) - 1)

    if next_index != current_index:
        sb.table("experiments").update({"current_step_index": next_index}).eq(
            "id", experiment["id"]
        ).execute()
        experiment["current_step_index"] = next_index

        write_event(
            sb,
            experiment_id=experiment["id"],
            event_type="PROTOCOL_STEP_COMPLETED",
            entity_type="experiment",
            entity_id=experiment["id"],
            payload={
                "step_index": current_index,
                "step_name": (completed or {}).get("name"),
            },
            actor_id=user_id,
            voice_session_id=session_id,
        )

    return _ok(
        completed_step=completed,
        current_step=steps[next_index],
        is_final=next_index == len(steps) - 1,
    )


# ---------------------------------------------------------------------------
# 8. get_sample_history
# ---------------------------------------------------------------------------


def get_sample_history(*, sb, experiment, user_id, args: GetSampleHistoryArgs, session_id=None):
    sample, error = _resolve_or_error(sb, experiment, args.sample_code)
    if error:
        return error

    measurements = (
        sb.table("measurements")
        .select("*")
        .eq("experiment_id", experiment["id"])
        .eq("sample_id", sample["id"])
        .is_("superseded_by", "null")
        .order("recorded_at", desc=True)
        .execute()
    ).data or []

    observations = (
        sb.table("observations")
        .select("*")
        .eq("experiment_id", experiment["id"])
        .eq("sample_id", sample["id"])
        .order("recorded_at", desc=True)
        .execute()
    ).data or []

    return _ok(
        sample_code=sample["sample_code"],
        measurements=[
            {
                "type": m["measurement_type"],
                "value": float(m["value"]),
                "unit": m.get("unit"),
                "recorded_at": m.get("recorded_at"),
                "corrected": bool(m.get("correction_reason")),
            }
            for m in measurements
        ],
        observations=[
            {"observation": o["observation"], "recorded_at": o.get("recorded_at")}
            for o in observations
        ],
    )


# ---------------------------------------------------------------------------
# 9. check_experiment_completeness — the integrity gate
# ---------------------------------------------------------------------------


def _completeness(sb, experiment) -> dict[str, Any]:
    steps = _steps(sb, experiment)
    samples = [s for s in _samples(sb, experiment["id"]) if s.get("status", "active") == "active"]
    by_id = {s["id"]: s["sample_code"] for s in samples}

    live = (
        sb.table("measurements")
        .select("*")
        .eq("experiment_id", experiment["id"])
        .is_("superseded_by", "null")
        .execute()
    ).data or []

    missing: list[dict[str, Any]] = []

    seen_fields: set[str] = set()
    for step in steps:
        required = [f for f in step.get("required_fields", []) if f != "sample_id"]
        for field in required:
            # ponytail: per-experiment, as data-model.md specifies — one reading per
            # sample satisfies every step requiring that type. Scope by
            # protocol_step_index if repeat readings must be enforced.
            if field in seen_fields:
                continue
            seen_fields.add(field)
            recorded = {m.get("sample_id") for m in live if m["measurement_type"] == field}
            absent = sorted(code for sid, code in by_id.items() if sid not in recorded)
            if absent:
                missing.append(
                    {
                        "step_index": step["index"],
                        "step_name": step["name"],
                        "field": field,
                        "samples": absent,
                    }
                )

    observations = (
        sb.table("observations").select("id").eq("experiment_id", experiment["id"]).execute()
    ).data or []
    deviations = (
        sb.table("deviations").select("id").eq("experiment_id", experiment["id"]).execute()
    ).data or []

    return {
        "complete": not missing,
        "missing": missing,
        "summary": {
            "measurements": len(live),
            "observations": len(observations),
            "deviations": len(deviations),
        },
    }


def check_experiment_completeness(*, sb, experiment, user_id, args: NoArgs, session_id=None):
    return _ok(**_completeness(sb, experiment))


# ---------------------------------------------------------------------------
# 10. complete_experiment — irreversible
# ---------------------------------------------------------------------------


def complete_experiment(
    *, sb, experiment, user_id, args: CompleteExperimentArgs, session_id=None
):
    if not args.confirmed:
        return _err(
            "NEEDS_CONFIRMATION",
            "Completing an experiment can't be undone. Should I go ahead?",
        )

    # Re-run the check here rather than trusting a previous tool call. The model
    # could otherwise call this directly and skip the gate — and a gate the
    # caller can skip is not a gate.
    state = _completeness(sb, experiment)
    if not state["complete"]:
        return _err(
            "INCOMPLETE",
            "Some protocol-required measurements are still missing.",
            missing=state["missing"],
        )

    completed_at = _now()
    sb.table("experiments").update({"status": "COMPLETED", "completed_at": completed_at}).eq(
        "id", experiment["id"]
    ).execute()
    experiment["status"] = "COMPLETED"
    experiment["completed_at"] = completed_at

    summary = completion_summary(sb, experiment["id"])

    write_event(
        sb,
        experiment_id=experiment["id"],
        event_type="EXPERIMENT_COMPLETED",
        entity_type="experiment",
        entity_id=experiment["id"],
        payload={"summary": summary},
        actor_id=user_id,
        voice_session_id=session_id,
    )

    return _ok(
        experiment_code=experiment["experiment_code"],
        status="COMPLETED",
        completed_at=completed_at,
        summary=summary,
    )
