"""specs/004-step-timers FR-320 — completing a step whose timer is still running asks first.

The guard is the handler's, not only the prompt's: after a reconnect, or for a
timer started on screen, the agent may not know a timer is running. With no
running timer on the step, complete_protocol_step behaves exactly as before.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.tools import handlers
from app.tools.models import CompleteProtocolStepArgs, StepTimerArgs
from tests.conftest import OWNER_ID, TIMED_STEPS

T0 = datetime(2026, 9, 26, 14, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def clock(monkeypatch):
    state = {"now": T0}
    monkeypatch.setattr(handlers, "_utcnow", lambda: state["now"])
    return state


@pytest.fixture
def timed(sb, experiment, clock):
    sb.rows("protocols")[0]["steps"] = TIMED_STEPS
    experiment["current_step_index"] = 2
    return experiment


def complete(sb, experiment, **args):
    # These tests are about the timer guard; the missing-readings gate has its own.
    args.setdefault("confirmed_incomplete", True)
    return handlers.complete_protocol_step(
        sb=sb, experiment=experiment, user_id=OWNER_ID, args=CompleteProtocolStepArgs(**args), session_id="s"
    )


def start_timer(sb, experiment, minutes=10):
    return handlers.step_timer(
        sb=sb,
        experiment=experiment,
        user_id=OWNER_ID,
        args=StepTimerArgs(action="start", duration_value=minutes, duration_unit="minutes"),
        session_id="s",
    )


def status(sb, experiment):
    return handlers.step_timer(
        sb=sb, experiment=experiment, user_id=OWNER_ID, args=StepTimerArgs(action="status"), session_id="s"
    )["data"]["timer"]


def test_completing_the_timed_step_asks_first_and_writes_nothing(sb, timed, clock):
    start_timer(sb, timed)
    clock["now"] = T0 + timedelta(seconds=180)
    before = sb.count("events")

    result = complete(sb, timed)

    assert result["error"] == "TIMER_STILL_RUNNING"
    assert result["detail"] == {
        "remaining_seconds": 420,
        "remaining_spoken": "7 minutes",
        "step_name": TIMED_STEPS[2]["name"],
        "duration_spoken": "10 minutes",
    }
    assert timed["current_step_index"] == 2
    assert sb.rows("experiments")[0]["current_step_index"] == 2
    assert sb.count("events") == before


def test_confirmed_early_completes_and_the_timer_keeps_running(sb, timed):
    start_timer(sb, timed)
    result = complete(sb, timed, confirmed_early=True)

    assert result["success"] is True
    assert timed["current_step_index"] == 3
    running = status(sb, timed)
    assert running["state"] == "running" and running["step_index"] == 2


def test_the_guard_only_covers_the_timers_own_step(sb, timed):
    start_timer(sb, timed)
    complete(sb, timed, confirmed_early=True)  # now on step index 3, timer still on 2
    assert complete(sb, timed)["success"] is True
    assert timed["current_step_index"] == 4


def test_a_completed_timer_does_not_guard(sb, timed, clock):
    start_timer(sb, timed)
    clock["now"] = T0 + timedelta(minutes=10)
    assert complete(sb, timed)["success"] is True


def test_without_a_timer_completion_is_unchanged(sb, experiment):
    # The pre-feature path: STAB-104 at index 1, no timer events at all.
    result = complete(sb, experiment)
    assert result["success"] is True
    assert result["data"]["completed_step"]["index"] == 1
    assert result["data"]["current_step"]["index"] == 2
    assert experiment["current_step_index"] == 2
