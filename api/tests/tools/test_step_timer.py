"""specs/004-step-timers — the step_timer handler (contracts/tools-step-timer.md).

Constitution, Development Workflow: every rejection asserts that no event was
written, not only the error it returned.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.tools import handlers
from app.tools.models import StepTimerArgs
from tests.conftest import OWNER_ID, TIMED_STEPS

T0 = datetime(2026, 9, 26, 14, 0, 0, tzinfo=timezone.utc)


class Clock:
    def __init__(self):
        self.now = T0

    def advance(self, seconds):
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def clock(monkeypatch):
    c = Clock()
    monkeypatch.setattr(handlers, "_utcnow", lambda: c.now)
    return c


@pytest.fixture
def timed(sb, experiment, clock):
    """STAB-104 on the timed protocol, at step 3 (index 2): "Centrifuge … for 10 minutes"."""
    sb.rows("protocols")[0]["steps"] = TIMED_STEPS
    experiment["current_step_index"] = 2
    return experiment


def timer(sb, experiment, session_id="sess-test", **args):
    return handlers.step_timer(
        sb=sb, experiment=experiment, user_id=OWNER_ID, args=StepTimerArgs(**args), session_id=session_id
    )


def start(sb, experiment, value=None, unit=None, **kw):
    duration = {"duration_value": value, "duration_unit": unit} if value is not None else {}
    return timer(sb, experiment, action="start", **duration, **kw)


def timer_events(sb, kind=None):
    return [e for e in sb.rows("events") if e["event_type"].startswith("TIMER_") and (kind is None or e["event_type"] == kind)]


# ---------------------------------------------------------------------------
# start
# ---------------------------------------------------------------------------
def test_start_explicit_duration_stores_and_returns_the_stored_timer(sb, timed):
    result = start(sb, timed, 10, "minutes")

    assert result["success"] is True
    data = result["data"]
    t = data["timer"]
    assert t["state"] == "running"
    assert t["duration_seconds"] == 600 and t["duration_spoken"] == "10 minutes"
    assert t["step_index"] == 2 and t["step_name"] == TIMED_STEPS[2]["name"]
    assert t["protocol_seconds"] == 600 and t["differs_from_protocol"] is False
    assert datetime.fromisoformat(t["ends_at"]) - datetime.fromisoformat(t["started_at"]) == timedelta(seconds=600)
    assert t["started_at"] == T0.isoformat()
    assert data["server_now"] == T0.isoformat()
    assert data["current_step_timer_seconds"] == 600

    [event] = timer_events(sb)
    assert event["event_type"] == "TIMER_STARTED"
    assert event["entity_type"] == "timer" and event["entity_id"] == t["timer_id"]
    assert event["payload"]["source"] == "voice" and event["payload"]["replaces"] is None
    assert event["payload"]["duration_spoken"] == "10 minutes"
    assert event["actor_id"] == OWNER_ID and event["voice_session_id"] == "sess-test"


def test_start_from_the_screen_is_recorded_as_screen(sb, timed):
    start(sb, timed, 1, "minutes", session_id=None)
    [event] = timer_events(sb)
    assert event["payload"]["source"] == "screen" and event["voice_session_id"] is None


def test_start_without_a_duration_uses_the_timed_step(sb, timed):
    assert start(sb, timed)["data"]["timer"]["duration_seconds"] == 600


def test_start_converts_hours_on_the_server(sb, timed):
    assert start(sb, timed, 1.5, "hours")["data"]["timer"]["duration_seconds"] == 5400


def test_start_with_another_duration_than_the_protocol_says_it_differs(sb, timed):
    t = start(sb, timed, 12, "minutes")["data"]["timer"]
    assert t["duration_seconds"] == 720 and t["differs_from_protocol"] is True


@pytest.mark.parametrize(("index", "reason"), [(1, "none"), (4, "range")])
def test_start_without_a_duration_on_an_untimed_step_asks(sb, timed, index, reason):
    timed["current_step_index"] = index
    before = sb.count("events")
    result = start(sb, timed)
    assert result["error"] == "DURATION_REQUIRED"
    assert result["detail"]["step_reason"] == reason
    assert result["detail"]["step_name"] == TIMED_STEPS[index]["name"]
    assert sb.count("events") == before


@pytest.mark.parametrize(
    ("value", "unit", "requested"),
    [(4, "seconds", 4), (25, "hours", 90000), (0, "seconds", 0), (-5, "minutes", -300)],
)
def test_start_out_of_range_writes_nothing(sb, timed, value, unit, requested):
    before = sb.count("events")
    result = start(sb, timed, value, unit)
    assert result["error"] == "DURATION_OUT_OF_RANGE"
    assert result["detail"] == {"requested_seconds": requested, "min_seconds": 5, "max_seconds": 86400}
    assert sb.count("events") == before


def test_second_start_is_refused_and_names_the_running_timer(sb, timed, clock):
    first = start(sb, timed, 10, "minutes")["data"]["timer"]
    clock.advance(60)
    before = sb.count("events")
    result = start(sb, timed, 5, "minutes")
    assert result["error"] == "TIMER_ALREADY_RUNNING"
    assert result["detail"]["timer"]["timer_id"] == first["timer_id"]
    assert result["detail"]["timer"]["remaining_seconds"] == 540
    assert sb.count("events") == before


def test_a_completed_timer_does_not_block_a_new_one(sb, timed, clock):
    start(sb, timed, 10, "seconds")
    clock.advance(11)
    assert start(sb, timed, 10, "seconds")["success"] is True


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------
def test_status_with_no_timer_is_a_success_with_none(sb, timed):
    result = timer(sb, timed, action="status")
    assert result["success"] is True
    assert result["data"]["timer"] is None
    assert result["data"]["current_step_timer_seconds"] == 600
    assert result["data"]["current_step_timer_reason"] == "single"
    assert result["data"]["current_step_timer_spoken"] == "10 minutes"


def test_status_counts_down_then_completes_on_the_server_clock(sb, timed, clock):
    start(sb, timed, 10, "minutes")
    clock.advance(100)
    running = timer(sb, timed, action="status")["data"]["timer"]
    assert running["state"] == "running" and running["remaining_seconds"] == 500
    clock.advance(500)
    done = timer(sb, timed, action="status")["data"]["timer"]
    assert done["state"] == "completed" and done["remaining_seconds"] == 0


def test_status_writes_nothing(sb, timed):
    start(sb, timed, 10, "minutes")
    before = sb.count("events")
    timer(sb, timed, action="status")
    assert sb.count("events") == before


@pytest.mark.parametrize("action", ["status", "cancel"])
def test_a_duration_on_status_or_cancel_is_invalid(sb, timed, action):
    before = sb.count("events")
    result = timer(sb, timed, action=action, duration_value=5, duration_unit="minutes")
    assert result["error"] == "INVALID_ARGS"
    assert sb.count("events") == before


# ---------------------------------------------------------------------------
# cancel and replace (US3)
# ---------------------------------------------------------------------------
def test_cancel_a_running_timer(sb, timed, clock):
    first = start(sb, timed, 10, "minutes")["data"]["timer"]
    clock.advance(30)
    result = timer(sb, timed, action="cancel")

    assert result["success"] is True
    assert result["data"]["timer"]["timer_id"] == first["timer_id"]
    assert result["data"]["timer"]["state"] == "cancelled"
    cancels = timer_events(sb, "TIMER_CANCELLED")
    assert len(cancels) == 1
    assert cancels[0]["entity_id"] == first["timer_id"]
    assert cancels[0]["payload"]["reason"] == "user" and cancels[0]["payload"]["remaining_seconds"] == 570
    assert timer(sb, timed, action="status")["data"]["timer"] is None


def test_cancel_with_nothing_running_writes_nothing(sb, timed):
    before = sb.count("events")
    assert timer(sb, timed, action="cancel")["error"] == "NO_TIMER_RUNNING"
    assert sb.count("events") == before


def test_cancel_after_completion_writes_nothing(sb, timed, clock):
    start(sb, timed, 10, "seconds")
    clock.advance(10)
    before = sb.count("events")
    assert timer(sb, timed, action="cancel")["error"] == "NO_TIMER_RUNNING"
    assert sb.count("events") == before


def test_replace_cancels_then_starts(sb, timed, clock):
    first = start(sb, timed, 10, "minutes")["data"]["timer"]
    clock.advance(60)
    before = len(timer_events(sb))
    second = start(sb, timed, 5, "minutes", replace=True)["data"]["timer"]

    new = timer_events(sb)[before:]  # insertion order
    assert [e["event_type"] for e in new] == ["TIMER_CANCELLED", "TIMER_STARTED"]
    assert new[0]["entity_id"] == first["timer_id"] and new[0]["payload"]["reason"] == "replaced"
    assert new[1]["payload"]["replaces"] == first["timer_id"]
    assert second["duration_seconds"] == 300
    assert timer(sb, timed, action="status")["data"]["timer"]["timer_id"] == second["timer_id"]


def test_replace_with_nothing_running_just_starts(sb, timed):
    result = start(sb, timed, 5, "minutes", replace=True)
    assert result["success"] is True
    assert [e["event_type"] for e in timer_events(sb)] == ["TIMER_STARTED"]
