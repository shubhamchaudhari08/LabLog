"""Tool handlers â€” authorize â†’ resolve â†’ validate â†’ write â†’ audit â†’ return.

Authorization already happened in the dispatcher, once, before any handler runs
(research.md R-006). What remains here is *semantic* validation: structural
validation proved the model produced well-formed arguments, not true ones.

Every handler takes `sb` as a parameter and never constructs a client, which is
what makes this layer â€” the product's central claim â€” testable without a live
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
    WriteProtocolStepArgs,
)
from . import vocabulary
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
# 2. record_measurement â€” the core tool
# ---------------------------------------------------------------------------


def record_measurement(
    *, sb, experiment, user_id, args: RecordMeasurementArgs, session_id=None
):
    sample, error = _resolve_or_error(sb, experiment, args.sample_code)
    if error:
        return error

    # Pydantic accepts float('nan') as a valid float and Postgres `numeric`
    # accepts 'NaN'. A NaN measurement stores, renders, and silently poisons
    # every aggregate downstream â€” so it needs an explicit guard.
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
    listed = vocabulary.lookup(args.measurement_type)
    if not unit and listed and listed.dimensionless:
        unit = listed.default_unit  # pH: asking "what unit?" would be absurd on camera
    if not unit:
        return _err(
            "UNIT_REQUIRED",
            f"What unit is that {args.measurement_type} in?",
            measurement_type=args.measurement_type,
            suggested_units=vocabulary.suggested_units(args.measurement_type),
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


# ---------------------------------------------------------------------------
# 3. correct_measurement â€” supersede, never delete
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
# 6. get_next_protocol_step â€” reads an array element. Cannot generate.
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

    if not steps:
        # Live-authored protocol that has no steps yet: there is nothing to read
        # out, and inventing one is the thing this handler exists to prevent.
        return _ok(
            is_final=False,
            message="No protocol steps have been recorded yet. What is the first step?",
        )

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
# 7b. write_protocol_step â€” the protocol written while the run happens
# ---------------------------------------------------------------------------


def _protocol_is_shared(sb, protocol: dict[str, Any], experiment_id: str) -> bool:
    """Would appending a step here rewrite someone else's approved procedure?

    A library protocol (owner_id null) is shared by definition, and any protocol
    a second experiment references is shared in fact. Editing either would
    silently change the "next step" for a run nobody is looking at â€” the exact
    failure FR-017 exists to prevent.
    """
    if protocol.get("owner_id") is None:
        return True
    users = (
        sb.table("experiments").select("id").eq("protocol_id", protocol["id"]).execute()
    ).data or []
    return any(row["id"] != experiment_id for row in users)


def _records_at_or_after(sb, experiment_id: str, index: int) -> bool:
    """Is any recorded value stamped with this step index or a later one?

    Removing a step renumbers everything after it, and a measurement's
    `protocol_step_index` is already written â€” so a removal that renumbers a
    stamped step silently re-attributes stored data to a different procedure.
    Renaming is safe (the index does not move); removing under records is not.
    """
    for table in ("measurements", "observations"):
        rows = (
            sb.table(table).select("*").eq("experiment_id", experiment_id).execute()
        ).data or []
        for row in rows:
            stamped = row.get("protocol_step_index")
            if stamped is not None and stamped >= index:
                return True
    return False


def write_protocol_step(
    *, sb, experiment, user_id, args: WriteProtocolStepArgs, session_id=None
):
    """Author the protocol during the run: append, amend, remove, or start over.

    Still no generative capability: every name stored here is the user's words
    passed through, exactly as with an observation.

    "Start over" opens a NEW protocol rather than emptying the current one, so
    the discarded draft stays readable and the steps already-stored measurements
    point at do not vanish underneath them (Constitution Principle II).
    """
    status = str(experiment.get("status", ""))
    if status in ("COMPLETED", "CANCELLED"):
        return _err(
            "EXPERIMENT_CLOSED",
            f"Experiment {experiment['experiment_code']} is {status.lower()}, "
            "so its protocol can't be changed.",
        )

    name = (args.name or "").strip()
    protocol = _protocol(sb, experiment)
    created = args.new_protocol or not protocol

    if created and (args.remove or args.step_index is not None):
        return _err("INVALID_ARGS", "A new protocol has no steps to change yet.")
    if not created and not name and args.step_index is None:
        return _err("INVALID_ARGS", "What should I call that step?")

    if created:
        protocol = (
            sb.table("protocols")
            .insert(
                {
                    "protocol_code": f"ADHOC-{experiment['experiment_code']}",
                    "name": args.protocol_name or f"{experiment['name']} (recorded live)",
                    "version": "v1",
                    "steps": [],
                    "owner_id": user_id,  # owned, so it stays editable during the run
                }
            )
            .execute()
        ).data[0]
        sb.table("experiments").update({"protocol_id": protocol["id"]}).eq(
            "id", experiment["id"]
        ).execute()
        experiment["protocol_id"] = protocol["id"]
    elif _protocol_is_shared(sb, protocol, experiment["id"]):
        return _err(
            "PROTOCOL_SHARED",
            f"{protocol.get('name')} is an approved protocol other experiments use, "
            "so I can't change it. Say \"create a new protocol\" and I'll start one "
            "for this run.",
            protocol_name=protocol.get("name"),
        )

    steps = list(protocol.get("steps") or [])
    index = args.step_index
    if index is not None and index >= len(steps):
        return _err(
            "STEP_NOT_FOUND",
            f"There's no step {index + 1}; the protocol has {len(steps)}.",
            step_count=len(steps),
        )

    step: dict[str, Any] | None = None
    event_type = "PROTOCOL_STEP_ADDED"
    # `None` leaves the current step alone: rewording step 2 must not drag the
    # user back to it while they are working on step 4.
    moved_to: int | None = None

    if args.remove:
        if index is None:
            return _err("INVALID_ARGS", "Which step should I remove?")
        if _records_at_or_after(sb, experiment["id"], index):
            return _err(
                "PROTOCOL_STEP_IN_USE",
                f"Data is already recorded from step {index + 1} onwards, so removing "
                "it would renumber records that are already stored. I can reword it, "
                "or log a deviation instead.",
                step_index=index,
            )
        step = steps.pop(index)
        for position, remaining in enumerate(steps):
            remaining["index"] = position
        event_type = "PROTOCOL_STEP_REMOVED"
        moved_to = min(experiment.get("current_step_index", 0), max(len(steps) - 1, 0))

    elif index is not None:
        if not name and args.required_fields is None:
            return _err("INVALID_ARGS", f"What should step {index + 1} say instead?")
        step = dict(steps[index])
        if name:
            step["name"] = name
        if args.required_fields is not None:
            step["required_fields"] = args.required_fields
        steps[index] = step
        event_type = "PROTOCOL_STEP_UPDATED"

    elif name:
        step = {
            "index": len(steps),
            "id": f"step_{len(steps) + 1}",
            "name": name,
            "required_fields": args.required_fields or [],
        }
        steps.append(step)
        # Dictating a step means you are now on it, so no separate advance is needed.
        moved_to = step["index"]

    else:
        # A new protocol opened before the user has named the first step.
        moved_to = 0

    if step is not None:
        # ponytail: read-modify-write of the steps array â€” two concurrent voice
        # sessions on one experiment could drop a step. Move to a Postgres
        # function with `steps = steps || $1` if that ever happens.
        sb.table("protocols").update({"steps": steps}).eq("id", protocol["id"]).execute()

    updates: dict[str, Any] = {}
    if moved_to is not None:
        updates["current_step_index"] = moved_to
    started = status != "RUNNING"
    if started:
        updates["status"] = "RUNNING"
        if not experiment.get("started_at"):
            updates["started_at"] = _now()
    if updates:
        sb.table("experiments").update(updates).eq("id", experiment["id"]).execute()
        experiment.update(updates)

    write_event(
        sb,
        experiment_id=experiment["id"],
        event_type=event_type,
        entity_type="protocol",
        entity_id=protocol["id"],
        payload={
            "step_index": (step or {}).get("index"),
            "step_name": (step or {}).get("name"),
            "required_fields": (step or {}).get("required_fields", []),
            "protocol_created": created,
            "experiment_started": started,
        },
        actor_id=user_id,
        voice_session_id=session_id,
    )

    return _ok(
        # "added" | "updated" | "removed" â€” so the spoken confirmation matches
        # what was actually written rather than what was asked for.
        action=event_type.removeprefix("PROTOCOL_STEP_").lower() if step else "opened",
        protocol={
            "id": protocol["id"],
            "name": protocol.get("name"),
            "step_count": len(steps),
        },
        step=step,  # None when a new protocol was opened with no step yet
        steps=[{"index": s["index"], "name": s["name"]} for s in steps],
        step_index=experiment.get("current_step_index", 0),
        experiment_status=experiment["status"],
        protocol_created=created,
        experiment_started=started,
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
# 9. check_experiment_completeness â€” the integrity gate
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
            # ponytail: per-experiment, as data-model.md specifies â€” one reading per
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
# 10. complete_experiment â€” irreversible
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
    # could otherwise call this directly and skip the gate â€” and a gate the
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



# ---------------------------------------------------------------------------
# Desk profile (specs/003-post-mvp-features, amendment A-1). Defined in
# lifecycle.py; exported here because the dispatcher looks handlers up by name.
# ---------------------------------------------------------------------------
from .lifecycle import create_experiment, list_protocols, start_experiment  # noqa: E402,F401
