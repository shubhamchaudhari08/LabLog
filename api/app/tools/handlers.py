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
import uuid
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_EVEN, Decimal
from typing import Any

from ..audit import write_event
from ..db import completion_summary, latest_measurement
from ..deviations import record_deviation
from .models import (
    CompleteExperimentArgs,
    CompleteProtocolStepArgs,
    CorrectMeasurementArgs,
    CreateDeviationArgs,
    GetSampleHistoryArgs,
    NoArgs,
    RecordMeasurementArgs,
    RecordObservationArgs,
    StepTimerArgs,
    WriteProtocolStepArgs,
)
from . import completeness, durations, timers, vocabulary
from . import requirements as reqs
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


def _utcnow() -> datetime:
    """The one clock for timer code (specs/004). A function so tests can fix it."""
    return datetime.now(timezone.utc)


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


def _step_at(sb, experiment: dict[str, Any], index: int | None) -> dict[str, Any] | None:
    if index is None:
        return None
    steps = _steps(sb, experiment)
    return steps[index] if 0 <= index < len(steps) else None


def _record_step(sb, experiment: dict[str, Any], step_number: int | None):
    """(index, step, late, error): the step a reading or observation is stamped with.

    The current step, unless the user named an earlier one ("for step 4"). Steps
    only move forward, so without this a requirement missed at a passed step
    could never be met and the run could never complete
    (.specify/bugs/observations-not-counted). A late record keeps the server's
    time; only its step stamp and its event's `late` flag differ.
    """
    current = experiment.get("current_step_index", 0)
    if step_number is None:
        return current, _step_at(sb, experiment, current), False, None
    steps = _steps(sb, experiment)
    index = step_number - 1
    if index >= len(steps):
        return None, None, False, _err(
            "STEP_NOT_FOUND",
            f"There's no step {step_number}; the protocol has {len(steps)}.",
            step_count=len(steps),
        )
    if index > current:
        return None, None, False, _err(
            "STEP_NOT_REACHED",
            f"Step {step_number} hasn't been reached yet; the current step is {current + 1}.",
            current_step_number=current + 1,
        )
    return index, steps[index], index != current, None


def _with_timer(step: dict[str, Any] | None) -> dict[str, Any] | None:
    """A step as the tools return it: plus the duration its text states, if exactly
    one (specs/004 FR-308). A copy — the stored protocol is never touched."""
    if step is None:
        return None
    return {**step, "timer_seconds": durations.for_step(step).seconds}


def _step_brief_ref(step: dict[str, Any] | None) -> dict[str, Any] | None:
    """Which protocol step a record was stamped with, as tool results report it."""
    if step is None:
        return None
    return {"index": step["index"], "code": step.get("id"), "name": step.get("name")}


def _lenient(check, step, *args, default=None):
    """Read a step's requirements while RECORDING: a malformed step must not stop a
    reading being saved. The completeness check reports it loudly instead
    (PROTOCOL_INVALID), so it is never silently ignored at completion."""
    try:
        return check(step, *args)
    except reqs.InvalidProtocol:
        return default


def _and(words: list[str]) -> str:
    return words[0] if len(words) == 1 else ", ".join(words[:-1]) + " and " + words[-1]


def _missing_phrase(missing: list[dict[str, Any]]) -> str:
    """ "temperature for A18 and CONTROL-01" — what STEP_INCOMPLETE says aloud."""
    groups: dict[str, list[str]] = {}
    for item in missing:
        kind = item["requirement_type"]
        if kind == "samples":
            groups[f"{item['expected_count'] - item['actual_count']} more {item['sample_type']} sample(s)"] = []
            continue
        what = item["measurement_type"] if kind == "measurement" else "an observation"
        if item.get("no_samples"):
            what += " (no samples are registered)"
        groups.setdefault(what, [])
        if item.get("sample_code"):
            groups[what].append(item["sample_code"])
    return _and([f"{what} for {_and(codes)}" if codes else what for what, codes in groups.items()])


def _with_warning(result: dict[str, Any], warning: dict[str, Any] | None) -> dict[str, Any]:
    if warning:
        result["warning"] = warning
    return result


def _amount(value: float, unit: str | None) -> str:
    return f"{value:g}" + (f" {unit}" if unit and unit != "pH" else "")


def _expected_text(req: reqs.MeasurementRequirement, unit: str | None) -> str:
    if req.exact is not None:
        return f"exactly {_amount(req.exact, unit)}"
    if req.min is not None and req.max is not None:
        return f"{req.min:g} to {_amount(req.max, unit)}"
    if req.min is not None:
        return f"at least {_amount(req.min, unit)}"
    return f"at most {_amount(req.max, unit)}"


def _expectation_warning(sb, experiment, *, req, row, sample_code, step, user_id, session_id):
    """A reading that misses its step's exact value or range: it stays saved, and
    one deviation records the miss.

    Keyed on the measurement, so a retried call or a repeated check cannot log it
    twice (specs/007 FR-704). A failed deviation write never un-saves the reading:
    the result says the reading is stored and the deviation is not.
    """
    value = float(row["value"])
    if req is None or not req.deviates(value):
        return None
    unit = row.get("unit")
    shown = _amount(value, unit)
    expected = _expected_text(req, unit)
    where = f"at step {step['index'] + 1}, {step.get('name')}"
    if req.exact is not None:
        code = "UNEXPECTED_VALUE"
        description = f"{sample_code} {row['measurement_type']} {shown} differs from the expected {expected} {where}."
        warning: dict[str, Any] = {"type": code, "expected": req.exact}
    else:
        code = "OUT_OF_RANGE"
        description = f"{sample_code} {row['measurement_type']} {shown} is outside the expected range ({expected}) {where}."
        warning = {"type": code, "minimum": req.min, "maximum": req.max}
    warning.update(actual=value, unit=unit, measurement_id=row["id"])
    try:
        deviation, _ = record_deviation(
            sb,
            experiment_id=experiment["id"],
            description=description,
            step_index=step["index"],
            actor_id=user_id,
            session_id=session_id,
            type=code.lower(),
            code=code,
            source_key=f"measurement:{row['id']}:{code}",
            measurement_id=row["id"],
        )
    except Exception:  # noqa: BLE001 — the reading is saved; say exactly what was not
        return {
            **warning,
            "deviation_id": None,
            "deviation_recorded": False,
            "message": f"Saved {shown}; the protocol expects {expected}, but the deviation could not be logged.",
        }
    return {
        **warning,
        "deviation_id": deviation["id"],
        "deviation_recorded": True,
        "message": f"Saved {shown}. The protocol expects {expected}, so a deviation was logged.",
    }


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
    current = _with_timer(steps[index]) if 0 <= index < len(steps) else None

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
    *, sb, experiment, user_id, args: RecordMeasurementArgs, session_id=None, utterance=None
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

    # The reading is stamped with the step it was taken under. That stamp, not
    # the time, is what makes an initial and a final temperature two different
    # requirements (specs/007 FR-701). A late reading ("for step 4") is judged
    # by that step's unit and range.
    step_index, step, late, error = _record_step(sb, experiment, args.step_number)
    if error:
        return error
    req = _lenient(reqs.measurement_requirement, step, args.measurement_type)

    unit = vocabulary.canonical_unit(args.measurement_type, args.unit) if args.unit else None
    if not unit and req and req.unit:
        unit = req.unit
    if not unit:
        unit = ((step or {}).get("default_unit") or {}).get(args.measurement_type)
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
    if req and req.unit:
        if unit.casefold() != req.unit.casefold():
            # No conversion (constitution non-goal), and a range in C says nothing
            # about a value in F — so ask, and write nothing.
            return _err(
                "UNIT_MISMATCH",
                f"This step records {req.measurement_type} in {req.unit}, not {unit}. "
                f"What is the value in {req.unit}?",
                measurement_type=req.measurement_type,
                required_unit=req.unit,
                received_unit=unit,
            )
        unit = req.unit

    inserted = (
        sb.table("measurements")
        .insert(
            {
                "experiment_id": experiment["id"],
                "sample_id": sample["id"],
                "measurement_type": args.measurement_type,
                "value": args.value,
                "unit": unit,
                "raw_spoken_value": utterance,  # the envelope's transcript, never the model's
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
            "step_index": step_index,
            **({"late": True} if late else {}),
        },
        actor_id=user_id,
        voice_session_id=session_id,
    )

    warning = None
    if step is not None:
        warning = _expectation_warning(
            sb, experiment, req=req, row=inserted, sample_code=sample["sample_code"],
            step=step, user_id=user_id, session_id=session_id,
        )

    return _with_warning(
        _ok(
            measurement_id=inserted["id"],
            sample_code=sample["sample_code"],  # stored, not requested
            measurement_type=args.measurement_type,
            value=args.value,
            unit=unit,
            recorded_at=inserted.get("recorded_at"),
            protocol_step=_step_brief_ref(step),
            **({"late": True} if late else {}),
        ),
        warning,
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

    original = _correction_target(sb, experiment, sample["id"], args.measurement_type)
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
                # The correction replaces a reading taken under a particular step,
                # so it keeps that step: correcting a final temperature after
                # moving on must still satisfy the final step (specs/007 §6).
                "protocol_step_index": original.get("protocol_step_index"),
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
            "step_index": original.get("protocol_step_index"),
        },
        actor_id=user_id,
        voice_session_id=session_id,
    )

    step = _step_at(sb, experiment, original.get("protocol_step_index"))
    warning = None
    if step is not None:
        warning = _expectation_warning(
            sb, experiment,
            req=_lenient(reqs.measurement_requirement, step, args.measurement_type),
            row=inserted, sample_code=sample["sample_code"], step=step,
            user_id=user_id, session_id=session_id,
        )

    return _with_warning(
        _ok(
            measurement_id=inserted["id"],
            sample_code=sample["sample_code"],
            measurement_type=args.measurement_type,
            previous_value=previous_value,
            new_value=args.new_value,
            unit=original.get("unit"),
            protocol_step=_step_brief_ref(step),
        ),
        warning,
    )


def _correction_target(sb, experiment, sample_id: str, measurement_type: str) -> dict[str, Any] | None:
    """The live reading a correction replaces: the one taken at the current step,
    else the one from the nearest earlier step, else the latest. At FINAL_PH,
    "correct A18's temperature" means the final reading, not the initial one —
    decided by protocol position, not by comparing timestamps."""
    live = (
        sb.table("measurements")
        .select("*")
        .eq("experiment_id", experiment["id"])
        .eq("sample_id", sample_id)
        .eq("measurement_type", measurement_type)
        .is_("superseded_by", "null")
        .order("recorded_at", desc=True)
        .execute()
    ).data or []
    here = experiment.get("current_step_index", 0)
    stamped = [m for m in live if isinstance(m.get("protocol_step_index"), int)]
    same = [m for m in stamped if m["protocol_step_index"] == here]
    if same:
        return same[0]
    earlier = [m for m in stamped if m["protocol_step_index"] < here]
    if earlier:
        return max(earlier, key=lambda m: m["protocol_step_index"])  # ties: newest, since live is newest-first
    return live[0] if live else None


# ---------------------------------------------------------------------------
# 4. record_observation
# ---------------------------------------------------------------------------


def record_observation(
    *, sb, experiment, user_id, args: RecordObservationArgs, session_id=None
):
    text = (args.observation or "").strip()
    if not text:
        return _err("INVALID_ARGS", "I didn't catch the observation. Could you repeat it?")

    if args.all_samples and args.sample_code:
        return _err("INVALID_ARGS", "Is that for one sample, or for all of them?")

    # Everything is validated before the first write: an "all samples" note is
    # several inserts, and PostgREST has no transaction (research R-709).
    targets: list[dict[str, Any] | None] = [None]  # None: a note about the whole run
    if args.all_samples:
        targets = [s for s in _samples(sb, experiment["id"]) if s.get("status", "active") == "active"]
        if not targets:
            return _err(
                "NO_SAMPLES",
                f"{experiment['experiment_code']} has no samples registered, so there is no sample to record it for.",
            )
    elif args.sample_code:
        sample, error = _resolve_or_error(sb, experiment, args.sample_code)
        if error:
            return error
        targets = [sample]

    # Stamped with the current step, like a measurement: the initial and final
    # appearance are different requirements (specs/007 US3). Or an earlier step
    # the user named, to fill in what it is missing.
    step_index, step, late, error = _record_step(sb, experiment, args.step_number)
    if error:
        return error

    stored: list[tuple[str, str | None]] = []
    for sample in targets:
        sample_code = sample["sample_code"] if sample else None
        inserted = (
            sb.table("observations")
            .insert(
                {
                    "experiment_id": experiment["id"],
                    "sample_id": sample["id"] if sample else None,
                    "observation": text,
                    "protocol_step_index": step_index,
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
            payload={
                "observation": text,
                "sample_code": sample_code,
                "step_index": step_index,
                **({"all_samples": True} if args.all_samples else {}),
                **({"late": True} if late else {}),
            },
            actor_id=user_id,
            voice_session_id=session_id,
        )
        stored.append((inserted["id"], sample_code))

    extra: dict[str, Any] = {"late": True} if late else {}
    if args.all_samples:
        # The codes actually stored, so the agent names exactly those.
        extra.update(all_samples=True, observation_ids=[i for i, _ in stored], sample_codes=[c for _, c in stored])
    else:
        extra.update(observation_id=stored[0][0], sample_code=stored[0][1])
    return _ok(observation=text, protocol_step=_step_brief_ref(step), **extra)


# ---------------------------------------------------------------------------
# 5. create_deviation
# ---------------------------------------------------------------------------


def create_deviation(*, sb, experiment, user_id, args: CreateDeviationArgs, session_id=None):
    description = (args.description or "").strip()
    if not description:
        return _err("INVALID_ARGS", "What was the deviation?")

    inserted, _ = record_deviation(
        sb,
        experiment_id=experiment["id"],
        description=description,
        step_index=experiment.get("current_step_index", 0),
        actor_id=user_id,
        session_id=session_id,
        type=args.type,
        severity=args.severity,
        reason=args.reason,
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
        requirements=_lenient(lambda st: reqs.dump(reqs.step_requirements(st)), step, default=[]),
        is_final=next_index == len(steps) - 1,
        # A preview: the agent may say the step is timed, but offers a timer only
        # once the step is current (specs/004 FR-309).
        timer_seconds=_with_timer(step)["timer_seconds"],
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
    events = completeness.load_step_events(sb, experiment["id"])
    review_step = bool(_lenient(reqs.has_requirement, completed, reqs.DeviationReviewRequirement, default=False))

    # "Deviations reviewed" away from the review step records the review and
    # nothing else: it must not advance a step the user did not finish. This is
    # also the only way to re-review after a deviation logged later (research R-706).
    if args.deviations_reviewed and not review_step:
        return _ok(
            advanced=False,
            completed_step=None,
            current_step=_with_timer(completed),
            is_final=current_index == len(steps) - 1,
            deviation_review=_record_review(sb, experiment, events, current_index, user_id, session_id),
        )

    # A timed step measures from its server-stamped start. Without one there is
    # nothing to measure, and inventing a start would invent a duration.
    timed = bool(_lenient(reqs.is_timed, completed, default=False))
    started = completeness.step_started(events, current_index) if timed else None
    if timed and started is None:
        return _err(
            "STEP_NOT_STARTED",
            f"{completed.get('name')} hasn't been started, so it can't be completed yet. "
            "Starting its timer starts the step.",
            step_index=current_index,
            step_name=completed.get("name"),
        )

    # What the protocol asks for at THIS step and nobody gave. A malformed protocol
    # must not stop the run moving; completeness reports it at the end (PROTOCOL_INVALID).
    try:
        missing = completeness.missing_at(sb, experiment, steps, current_index)
    except reqs.InvalidProtocol:
        missing = []
    # Missing samples cannot arrive later - they are only added when an experiment
    # is created - so no "complete anyway" (FR-715). Same code and detail as at create.
    composition = [m for m in missing if m["requirement_type"] == "samples"]
    if composition:
        return _err(
            "SAMPLES_REQUIRED",
            f"{completed.get('name')} needs {_missing_phrase(composition)}. "
            "Samples can only be added when an experiment is created.",
            needed=[
                {"sample_type": m["sample_type"], "count": m["expected_count"], "have": m["actual_count"]}
                for m in composition
            ],
            any_sample=False,
            step_index=current_index,
            step_name=completed.get("name"),
        )
    # Missing readings: ask before moving on (owner decision 2026-09-30, FR-711).
    if missing and not args.confirmed_incomplete:
        # Say why a note the user just made did not count, so "complete anyway"
        # is not answered on a false belief (observations-not-counted).
        why = f" {completeness.RUN_LEVEL_NOTE}" if any(m.get("run_level_observation") for m in missing) else ""
        return _err(
            "STEP_INCOMPLETE",
            f"{completed.get('name')} is still missing {_missing_phrase(missing)}.{why}",
            step_index=current_index,
            step_name=completed.get("name"),
            missing=missing,
        )

    # specs/004 FR-320: a timer still counting down on THIS step means the user
    # may be finishing it early. Ask, don't assume. The timer is not cancelled
    # either way: a centrifuge keeps spinning while the next step is prepared.
    if not args.confirmed_early:
        timer = timers.derive_timer(timers.load_timer_events(sb, experiment["id"]), _utcnow())
        if timer and timer["state"] == "running" and timer["step_index"] == current_index:
            return _err(
                "TIMER_STILL_RUNNING",
                f"The {timer['duration_spoken']} timer for this step still has {timer['remaining_spoken']} left.",
                remaining_seconds=timer["remaining_seconds"],
                remaining_spoken=timer["remaining_spoken"],
                step_name=timer["step_name"],
                duration_spoken=timer["duration_spoken"],
            )

    now = _utcnow()
    timing, warning = (None, None)
    if timed:
        timing, warning = _finish_timed_step(sb, experiment, completed, started, now, user_id, session_id)
    review = _record_review(sb, experiment, events, current_index, user_id, session_id) if review_step else None

    # Clamped rather than an error: the final step is a terminal position, not a
    # failure condition (data-model.md V9).
    next_index = min(current_index + 1, len(steps) - 1)
    advancing = next_index != current_index
    started_step = None

    # A timed or review step records its completion even as the final step,
    # because completeness asks whether it happened.
    if advancing or (
        (timed or review_step) and completeness.step_completed(events, current_index) is None
    ):
        write_event(
            sb,
            experiment_id=experiment["id"],
            event_type="PROTOCOL_STEP_COMPLETED",
            entity_type="experiment",
            entity_id=experiment["id"],
            payload={
                "step_index": current_index,
                "step_name": (completed or {}).get("name"),
                **(
                    {
                        "started_at": timing["started_at"],
                        "completed_at": timing["completed_at"],
                        "elapsed_seconds": timing["elapsed_seconds"],
                        "timing_status": timing["status"],
                    }
                    if timing
                    else {}
                ),
            },
            actor_id=user_id,
            voice_session_id=session_id,
        )

    if advancing:
        sb.table("experiments").update({"current_step_index": next_index}).eq(
            "id", experiment["id"]
        ).execute()
        experiment["current_step_index"] = next_index

        # Entering a timed step starts it, on this server's clock. "Start the
        # stability hold" is its own protocol step, so completing that step is
        # the moment the hold begins.
        entered = steps[next_index]
        if _lenient(reqs.is_timed, entered, default=False) and completeness.step_started(events, next_index) is None:
            started_step = _start_step(sb, experiment, entered, now, "step_advance", user_id, session_id)

    extra: dict[str, Any] = {}
    if timing:
        extra["timing"] = timing
    if started_step:
        extra["started_step"] = started_step
    if review:
        extra["deviation_review"] = review
    return _with_warning(
        _ok(
            completed_step=completed,
            current_step=_with_timer(steps[next_index]),
            is_final=next_index == len(steps) - 1,
            **extra,
        ),
        warning,
    )


def _start_step(sb, experiment, step, now: datetime, source: str, user_id, session_id) -> dict[str, Any]:
    """Stamp a timed step's start. The time is this server's; no caller can supply one."""
    started_at = now.isoformat()
    write_event(
        sb,
        experiment_id=experiment["id"],
        event_type="PROTOCOL_STEP_STARTED",
        entity_type="experiment",
        entity_id=experiment["id"],
        payload={
            "step_index": step["index"],
            "step_code": step.get("id"),
            "step_name": step.get("name"),
            "started_at": started_at,
            "source": source,
        },
        actor_id=user_id,
        voice_session_id=session_id,
    )
    return {**_step_brief_ref(step), "started_at": started_at}


def _window_text(timing: reqs.StepTiming) -> str:
    low, high = timing.min_duration_seconds, timing.max_duration_seconds
    if low is not None and high is not None:
        return f"{durations.format_duration(low)} to {durations.format_duration(high)}"
    if low is not None:
        return f"at least {durations.format_duration(low)}"
    return f"at most {durations.format_duration(high)}"


def _finish_timed_step(sb, experiment, step, started, now: datetime, user_id, session_id):
    """(timing, warning). Outside the window is a deviation, never an incomplete step.

    Completion and compliance are different facts (specs/007 US4): a hold that
    ran twenty minutes was completed, and ran long.
    """
    window = reqs.step_timing(step)
    started_at = (started.get("payload") or {}).get("started_at")
    elapsed = max(0, int((now - completeness.parse_time(started_at)).total_seconds()))
    status = window.status(elapsed)
    timing = {
        "started_at": started_at,
        "completed_at": now.isoformat(),
        "elapsed_seconds": elapsed,
        "elapsed_spoken": durations.format_duration(elapsed),
        "expected_seconds": window.expected_duration_seconds,
        "min_seconds": window.min_duration_seconds,
        "max_seconds": window.max_duration_seconds,
        "status": status,
    }
    if status not in ("too_short", "too_long"):
        return timing, None

    code = "STEP_DURATION_TOO_SHORT" if status == "too_short" else "STEP_DURATION_TOO_LONG"
    allowed = _window_text(window)
    description = (
        f"{step.get('name')} (step {step['index'] + 1}) took {timing['elapsed_spoken']}; "
        f"the protocol allows {allowed}."
    )
    warning: dict[str, Any] = {
        "type": code,
        "elapsed_seconds": elapsed,
        "minimum_seconds": window.min_duration_seconds,
        "maximum_seconds": window.max_duration_seconds,
    }
    try:
        deviation, _ = record_deviation(
            sb,
            experiment_id=experiment["id"],
            description=description,
            step_index=step["index"],
            actor_id=user_id,
            session_id=session_id,
            type="timing",
            code=code,
            source_key=f"step:{step['index']}:DURATION",
        )
    except Exception:  # noqa: BLE001 — the step is complete; say exactly what was not saved
        warning.update(deviation_id=None, deviation_recorded=False,
                       message=f"The step took {timing['elapsed_spoken']}, outside {allowed}, but the deviation could not be logged.")
        return timing, warning
    timing["deviation_id"] = deviation["id"]
    warning.update(
        deviation_id=deviation["id"],
        deviation_recorded=True,
        message=f"The step took {timing['elapsed_spoken']}, outside the allowed {allowed}. A timing deviation was logged.",
    )
    return timing, warning


def _record_review(sb, experiment, events, step_index, user_id, session_id) -> dict[str, Any]:
    """Append DEVIATIONS_REVIEWED. A run with no deviations can still be reviewed.

    Idempotent while nothing changes: a second review that would see the same
    deviations writes nothing.
    """
    deviations = (
        sb.table("deviations").select("*").eq("experiment_id", experiment["id"]).execute()
    ).data or []
    count = len(deviations)
    open_count = sum(1 for d in deviations if d.get("status", "open") == "open")
    if count == 0:
        message = "No deviations found. Deviation review marked complete."
    else:
        message = f"{count} deviation(s) reviewed, {open_count} still open. Deviation review marked complete."

    latest = completeness.latest_review(events)
    if latest and (latest.get("payload") or {}).get("deviation_count") == count:
        payload = latest.get("payload") or {}
        return {"deviation_count": count, "open_deviation_count": open_count,
                "reviewed_at": payload.get("reviewed_at"), "already_reviewed": True, "message": message}

    reviewed_at = _utcnow().isoformat()
    write_event(
        sb,
        experiment_id=experiment["id"],
        event_type="DEVIATIONS_REVIEWED",
        entity_type="experiment",
        entity_id=experiment["id"],
        payload={
            "reviewed_by": user_id,
            "reviewed_at": reviewed_at,
            "deviation_count": count,
            "open_deviation_count": open_count,
            "step_index": step_index,
        },
        actor_id=user_id,
        voice_session_id=session_id,
    )
    return {"deviation_count": count, "open_deviation_count": open_count,
            "reviewed_at": reviewed_at, "already_reviewed": False, "message": message}


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

    # Spoken step numbers are 1-based; the stored steps are not.
    index = None if args.step_number is None else args.step_number - 1
    if created and (args.remove or index is not None):
        return _err("INVALID_ARGS", "A new protocol has no steps to change yet.")
    if not created and not name and index is None:
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

    history = dict(
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
    if not args.compare_previous:
        return _ok(**history)
    found = _compare_previous(sb, experiment, user_id, sample, args.measurement_type or None, measurements)
    if "error" in found:
        return found
    return _ok(**history, comparison=found["comparison"])


def _step_brief(steps: list[dict[str, Any]], index: int | None) -> dict[str, Any] | None:
    if index is None:
        return None
    step = steps[index] if 0 <= index < len(steps) else None
    return {"index": index, "name": step.get("name") if step else None}


def _compare_previous(sb, experiment, user_id, sample, measurement_type, live) -> dict[str, Any]:
    """The previous-run comparison (specs/006 R-402, R-403, contract §3). Reads only.

    `live` is this sample's non-superseded rows in the current run, newest first.
    Every number is stored or computed here in Decimal, so the agent never does
    arithmetic: it speaks `spoken`, or the numbers in it.
    """
    code = sample["sample_code"]
    if measurement_type is None and live:
        measurement_type = live[0]["measurement_type"]
    current = latest_measurement(sb, experiment["id"], sample["id"], measurement_type) if measurement_type else None
    if current is None:
        return _err(
            "NO_CORRESPONDING_MEASUREMENT",
            f"There is no {measurement_type or 'measurement'} recorded for {code} in this run yet.",
            which="current", sample_code=code, measurement_type=measurement_type,
        )

    protocol = _protocol(sb, experiment) if experiment.get("protocol_id") else {}
    previous_run = None
    if experiment.get("protocol_id"):
        rows = (
            sb.table("experiments")
            .select("*")
            .eq("protocol_id", experiment["protocol_id"])
            .eq("owner_id", user_id)
            .eq("status", "COMPLETED")
            .neq("id", experiment["id"])
            .order("completed_at", desc=True)
            .limit(1)
            .execute()
        ).data or []
        previous_run = rows[0] if rows else None
    if previous_run is None:
        return _err(
            "NO_PREVIOUS_RUN",
            "There is no completed earlier run of this protocol to compare with.",
            protocol_code=protocol.get("protocol_code"),
        )

    prev_code = previous_run["experiment_code"]
    prev_samples = (
        sb.table("samples").select("*").eq("experiment_id", previous_run["id"]).eq("sample_code", code).execute()
    ).data or []
    candidates = []
    if prev_samples:
        candidates = (
            sb.table("measurements")
            .select("*")
            .eq("experiment_id", previous_run["id"])
            .eq("sample_id", prev_samples[0]["id"])
            .eq("measurement_type", measurement_type)
            .is_("superseded_by", "null")
            .order("recorded_at", desc=True)
            .execute()
        ).data or []
    if not candidates:
        return _err(
            "NO_CORRESPONDING_MEASUREMENT",
            f"{code} has no {measurement_type} in {prev_code}, so there is nothing to compare.",
            which="previous", sample_code=code, measurement_type=measurement_type, prev_experiment_code=prev_code,
        )
    step = current.get("protocol_step_index")
    same = [m for m in candidates if step is not None and m.get("protocol_step_index") == step]
    previous = (same or candidates)[0]

    if current.get("unit") != previous.get("unit"):
        return _err(
            "UNIT_MISMATCH",
            f"This run has {code} in {current.get('unit')} but {prev_code} has it in "
            f"{previous.get('unit')}. I don't convert units.",
            current_unit=current.get("unit"), previous_unit=previous.get("unit"), prev_experiment_code=prev_code,
        )

    now_v, then_v = Decimal(str(current["value"])), Decimal(str(previous["value"]))
    places = max(0, -now_v.as_tuple().exponent, -then_v.as_tuple().exponent)
    delta = (now_v - then_v).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_EVEN)
    magnitude = abs(delta)
    direction = "higher" if delta > 0 else "lower" if delta < 0 else "same"
    pct = None if then_v == 0 else (delta / abs(then_v) * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_EVEN)

    steps = protocol.get("steps") or []
    current_step = _step_brief(steps, step)
    previous_step = _step_brief(steps, previous.get("protocol_step_index"))
    same_step = bool(same)
    unit = current.get("unit") or ""
    if same_step:
        where = "at this step"
    elif previous_step:
        where = f"at step {previous_step['index'] + 1}, {previous_step['name']}"
    else:
        where = "in its latest reading"
    head = f"In {prev_code}, {code} was {then_v} {unit} {where}"
    if direction == "same":
        spoken = f"{head}, the same as today."
    else:
        spoken = f"{head}. Today's {now_v} {unit} is {magnitude} {unit} {direction}"
        spoken += (
            "; the percent change is undefined because the previous value was zero."
            if pct is None
            else f", {abs(pct)} percent {direction}."
        )

    return {
        "comparison": {
            "sample_code": code,
            "measurement_type": measurement_type,
            "unit": current.get("unit"),
            "current": float(now_v),
            "current_step": current_step,
            "previous": float(then_v),
            "previous_step": previous_step,
            "same_step": same_step,
            "prev_experiment_code": prev_code,
            "delta": float(delta),
            "magnitude": float(magnitude),
            "direction": direction,
            "pct": None if pct is None else float(pct),
            "spoken": spoken,
        }
    }


# ---------------------------------------------------------------------------
# 9. check_experiment_completeness â€” the integrity gate
# ---------------------------------------------------------------------------


def _completeness(sb, experiment) -> dict[str, Any]:
    """The deterministic engine in completeness.py: per step, per sample, per requirement."""
    return completeness.evaluate(sb, experiment, _steps(sb, experiment))


def _protocol_invalid(exc: reqs.InvalidProtocol) -> dict[str, Any]:
    step = f"step {exc.step_index + 1}" if isinstance(exc.step_index, int) else "a step"
    return _err(
        "PROTOCOL_INVALID",
        f"The protocol's requirements for {step} are malformed, so completeness can't be decided.",
        step_index=exc.step_index,
        step_name=exc.step_name,
        errors=exc.errors,
    )


def check_experiment_completeness(*, sb, experiment, user_id, args: NoArgs, session_id=None):
    try:
        return _ok(**_completeness(sb, experiment))
    except reqs.InvalidProtocol as exc:
        return _protocol_invalid(exc)


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
    # could otherwise call this directly and skip the gate â€” and a gate the
    # caller can skip is not a gate.
    try:
        state = _completeness(sb, experiment)
    except reqs.InvalidProtocol as exc:
        return _protocol_invalid(exc)
    if not state["complete"]:
        # Deviations never land here: they are compliance, not completeness.
        return _err(
            "INCOMPLETE",
            f"{len(state['missing'])} protocol requirement(s) are still missing.",
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
from .lifecycle import create_experiment, list_protocols, search_experiments, start_experiment  # noqa: E402,F401


# ---------------------------------------------------------------------------
# 11. step_timer — a countdown on the current step (specs/004-step-timers)
#
# A timer is two append-only events, and its state is derived on read
# (timers.py). The dispatcher has already refused a non-RUNNING experiment:
# step_timer is in MUTATING_TOOLS.
# ---------------------------------------------------------------------------

_UNIT_SECONDS = {"seconds": 1, "minutes": 60, "hours": 3600}


def step_timer(*, sb, experiment, user_id, args: StepTimerArgs, session_id=None):
    now = _utcnow()
    current = timers.derive_timer(timers.load_timer_events(sb, experiment["id"]), now)
    index = experiment.get("current_step_index", 0)
    step = _step_at(sb, experiment, index)
    match = durations.for_step(step)

    def reply(timer: dict[str, Any] | None, **extra: Any) -> dict[str, Any]:
        return _ok(
            **extra,
            timer=timer,
            current_step_index=index,
            current_step_timer_seconds=match.seconds,
            current_step_timer_reason=match.reason,
            # Spoken form for the on-screen Start button; the web never formats
            # durations itself (one source of truth, Principle IV).
            current_step_timer_spoken=durations.format_duration(match.seconds) if match.seconds else None,
            server_now=now.isoformat(),
        )

    running = current if current and current["state"] == "running" else None

    if args.action != "start" and args.duration_value is not None:
        return _err("INVALID_ARGS", f"A duration only goes with starting a timer, not with {args.action}.")

    if args.action == "status":
        return reply(current)

    if args.action == "cancel":
        if running is None:
            return _err("NO_TIMER_RUNNING", "No timer is running.")
        _cancel_timer(sb, experiment, running, "user", user_id, session_id)
        return reply({**running, "state": "cancelled"})

    # -- start ----------------------------------------------------------------
    if args.duration_value is not None:
        seconds = round(args.duration_value * _UNIT_SECONDS[args.duration_unit])
    elif match.seconds is not None:
        seconds = match.seconds
    else:
        which = {"range": "gives a range", "multiple": "gives more than one duration"}.get(
            match.reason, "does not say how long"
        )
        return _err(
            "DURATION_REQUIRED",
            f"The current step {which}. How long should the timer run?",
            step_name=(step or {}).get("name"),
            step_reason=match.reason,
        )

    if not durations.MIN_SECONDS <= seconds <= durations.MAX_SECONDS:
        return _err(
            "DURATION_OUT_OF_RANGE",
            "Timers run from 5 seconds to 24 hours.",
            requested_seconds=seconds,
            min_seconds=durations.MIN_SECONDS,
            max_seconds=durations.MAX_SECONDS,
        )

    # ponytail: check-then-insert. Two starts in the same instant (two tabs) can
    # both pass; derive_timer then treats the later one as current (research
    # R-312). Voice calls are serialised per session and the button disables
    # itself, so only a cross-tab race remains.
    if running is not None and not args.replace:
        return _err(
            "TIMER_ALREADY_RUNNING",
            f"A {running['duration_spoken']} timer is already running with {running['remaining_spoken']} left.",
            timer=running,
        )
    if running is not None:
        _cancel_timer(sb, experiment, running, "replaced", user_id, session_id)

    timer_id = str(uuid.uuid4())
    write_event(
        sb,
        experiment_id=experiment["id"],
        event_type="TIMER_STARTED",
        entity_type="timer",
        entity_id=timer_id,
        payload={
            "started_at": now.isoformat(),
            "ends_at": (now + timedelta(seconds=seconds)).isoformat(),
            "duration_seconds": seconds,
            "duration_spoken": durations.format_duration(seconds),
            "step_index": step["index"] if step else None,
            "step_name": step["name"] if step else None,
            "protocol_seconds": match.seconds,
            "source": "voice" if session_id else "screen",
            "replaces": running["timer_id"] if running else None,
        },
        actor_id=user_id,
        voice_session_id=session_id,
    )

    # specs/007 R-705: the timer on a timed step that has not started is the
    # step's start. Once only — a replaced timer does not restart the hold.
    extra: dict[str, Any] = {}
    if (
        step
        and _lenient(reqs.is_timed, step, default=False)
        and completeness.step_started(completeness.load_step_events(sb, experiment["id"]), index) is None
    ):
        extra["started_step"] = _start_step(sb, experiment, step, now, "timer", user_id, session_id)

    # Principle I: report the timer as stored, re-read from the trail.
    return reply(timers.derive_timer(timers.load_timer_events(sb, experiment["id"]), now), **extra)


def _cancel_timer(sb, experiment, timer, reason, user_id, session_id) -> None:
    write_event(
        sb,
        experiment_id=experiment["id"],
        event_type="TIMER_CANCELLED",
        entity_type="timer",
        entity_id=timer["timer_id"],
        payload={
            "reason": reason,
            "remaining_seconds": timer["remaining_seconds"],
            "step_index": timer["step_index"],
            "step_name": timer["step_name"],
        },
        actor_id=user_id,
        voice_session_id=session_id,
    )
