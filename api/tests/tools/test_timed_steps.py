"""specs/004-step-timers US2 — the read tools say which steps are timed.

`timer_seconds` is additive: every existing key of a step is unchanged, and an
untimed step carries None (contracts/tools-step-timer.md §3).
"""

from __future__ import annotations

from app.db import ExperimentContext
from app.tools import handlers
from app.tools.models import CompleteProtocolStepArgs, NoArgs
from app.tools.prompt import build_prompt
from tests.conftest import OWNER_ID, PROTOCOL_STEPS, TIMED_STEPS


def call(handler, sb, experiment, args):
    return handler(sb=sb, experiment=experiment, user_id=OWNER_ID, args=args, session_id="sess-test")


def on_timed(sb, experiment, index):
    sb.rows("protocols")[0]["steps"] = TIMED_STEPS
    experiment["current_step_index"] = index


def test_active_experiment_marks_a_timed_current_step(sb, experiment):
    on_timed(sb, experiment, 2)
    assert call(handlers.get_active_experiment, sb, experiment, NoArgs())["data"]["current_step"]["timer_seconds"] == 600


def test_next_step_carries_its_duration(sb, experiment):
    on_timed(sb, experiment, 1)
    assert call(handlers.get_next_protocol_step, sb, experiment, NoArgs())["data"]["timer_seconds"] == 600


def test_a_range_step_is_not_timed(sb, experiment):
    on_timed(sb, experiment, 3)  # next is "Incubate 10-15 min"
    assert call(handlers.get_next_protocol_step, sb, experiment, NoArgs())["data"]["timer_seconds"] is None


def test_completing_onto_a_timed_step_says_so(sb, experiment):
    on_timed(sb, experiment, 1)
    data = call(handlers.complete_protocol_step, sb, experiment, CompleteProtocolStepArgs(confirmed_incomplete=True))["data"]
    assert data["current_step"]["timer_seconds"] == 600


def test_untimed_steps_carry_none_and_keep_every_other_key(sb, experiment):
    active = call(handlers.get_active_experiment, sb, experiment, NoArgs())["data"]["current_step"]
    assert active == {**PROTOCOL_STEPS[1], "timer_seconds": None}

    nxt = call(handlers.get_next_protocol_step, sb, experiment, NoArgs())["data"]
    assert nxt["timer_seconds"] is None
    assert {"step_index", "id", "name", "required_fields", "is_final"} <= set(nxt)

    done = call(handlers.complete_protocol_step, sb, experiment, CompleteProtocolStepArgs(confirmed_incomplete=True))["data"]
    assert done["current_step"] == {**PROTOCOL_STEPS[2], "timer_seconds": None}
    # The stored protocol is never mutated by the read.
    assert "timer_seconds" not in sb.rows("protocols")[0]["steps"][1]


def test_prompt_marks_a_timed_current_step(sb, experiment):
    on_timed(sb, experiment, 2)
    ctx = ExperimentContext(experiment=experiment, protocol=sb.rows("protocols")[0], samples=sb.rows("samples"))
    assert "(timed: 10 minutes)" in build_prompt(ctx)

    experiment["current_step_index"] = 1
    assert "(timed:" not in build_prompt(ctx)
