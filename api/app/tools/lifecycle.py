"""Desk-profile voice tools: list protocols, create an experiment, start or resume one.

Thin wrappers. Every write goes through app/lifecycle.py and app/samples.py, the
same code the quick-create form uses, so voice and UI cannot disagree about what
an experiment code looks like or which sample codes are valid (Constitution
Principle IV). Every check runs before the first write, and nothing is written
without confirmed=true (contracts/tools-api-v2.md).
"""

from __future__ import annotations

from typing import Any

from .. import lifecycle
from ..db import load_protocol
from ..resolve import readable_protocols, resolve_protocol
from ..samples import validate_sample_codes
from .handlers import _err, _ok
from .models import CreateExperimentArgs, NoArgs, StartExperimentArgs

LIST_CAP = 25


def _brief(protocol: dict[str, Any] | None) -> dict[str, Any] | None:
    if not protocol:
        return None
    return {
        "protocol_code": protocol.get("protocol_code"),
        "name": protocol.get("name"),
        "version": protocol.get("version"),
        "step_count": len(protocol.get("steps") or []),
    }


def list_protocols(*, sb, experiment, user_id, args: NoArgs, session_id=None):
    rows = readable_protocols(sb, user_id)
    return _ok(protocols=[_brief(p) for p in rows[:LIST_CAP]], truncated=len(rows) > LIST_CAP)


def create_experiment(*, sb, experiment, user_id, args: CreateExperimentArgs, session_id=None):
    name = " ".join(args.name.split())
    if not name:
        return _err("INVALID_ARGS", "What should the experiment be called?")

    protocol = None
    if args.protocol_ref:
        found = resolve_protocol(sb, user_id, args.protocol_ref)
        if "error" in found:
            return _err(found["error"], found["message"], **found["detail"])
        protocol = found["protocol"]

    codes, problem = validate_sample_codes(args.sample_codes or [])
    if problem:
        return _err(problem["error"], problem["message"], **problem["detail"])

    will_start = bool(args.start and protocol)
    if not args.confirmed:
        return _err(
            "NEEDS_CONFIRMATION",
            "Read this back to the user and ask them to confirm before creating it.",
            name=name,
            protocol=_brief(protocol),
            sample_codes=codes,
            will_start=will_start,
        )

    try:
        created, samples = lifecycle.create_experiment(
            sb,
            user_id=user_id,
            name=name,
            description=args.description,
            protocol=protocol,
            sample_codes=codes,
            session_id=session_id,
            source="voice",
        )
    except lifecycle.CodeUnavailable:
        return _err("CODE_UNAVAILABLE", "I couldn't allocate an experiment code. Please try again.")

    if will_start:
        created = lifecycle.start_experiment(sb, experiment=created, user_id=user_id, session_id=session_id)

    return _ok(
        experiment_id=created["id"],
        experiment_code=created["experiment_code"],
        name=created["name"],
        status=created["status"],
        protocol=_brief(protocol),
        sample_codes=[s["sample_code"] for s in samples],
        needs_protocol=protocol is None,
    )


def start_experiment(*, sb, experiment, user_id, args: StartExperimentArgs, session_id=None):
    """`experiment` was resolved from args.experiment_ref and ownership-checked by the dispatcher."""
    protocol = load_protocol(sb, experiment.get("protocol_id"))
    steps = (protocol or {}).get("steps") or []

    def body(row: dict[str, Any], **extra: Any) -> dict[str, Any]:
        index = row.get("current_step_index") or 0
        step = steps[index] if 0 <= index < len(steps) else None
        return _ok(
            experiment_id=row["id"],
            experiment_code=row["experiment_code"],
            name=row["name"],
            status=row["status"],
            current_step={"index": step["index"], "name": step["name"]} if step else None,
            step_count=len(steps),
            **extra,
        )

    # Resuming a run in progress changes nothing, so it needs no confirmation.
    if experiment.get("status") == "RUNNING":
        return body(experiment, already_running=True)

    problem = lifecycle.start_error(experiment)
    if problem:
        return _err(problem["error"], problem["message"], **problem.get("detail", {}))

    if not args.confirmed:
        return _err(
            "NEEDS_CONFIRMATION",
            f"Ask the user to confirm starting {experiment['experiment_code']}.",
            experiment_code=experiment["experiment_code"],
            name=experiment["name"],
        )

    started = lifecycle.start_experiment(sb, experiment=experiment, user_id=user_id, session_id=session_id)
    return body(started, already_running=False)
