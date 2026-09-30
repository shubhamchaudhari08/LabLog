"""specs/004-step-timers data-model §2 — timer state is derived, never written.

Pure tests: event rows are built by hand, no handler and no store. A timer is
running until its server end time, then completed; a cancelled timer is gone.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.tools.timers import completion_instructions, derive_timer

T0 = datetime(2026, 9, 26, 14, 0, 0, tzinfo=timezone.utc)


def started(timer_id, *, at=T0, seconds=600, step_index=2, step_name="Centrifuge", protocol_seconds=600, seq=0):
    return {
        "event_type": "TIMER_STARTED",
        "entity_type": "timer",
        "entity_id": timer_id,
        "created_at": f"2026-09-26T14:00:00.{seq:06d}+00:00",
        "payload": {
            "started_at": at.isoformat(),
            "ends_at": (at + timedelta(seconds=seconds)).isoformat(),
            "duration_seconds": seconds,
            "step_index": step_index,
            "step_name": step_name,
            "protocol_seconds": protocol_seconds,
            "source": "voice",
            "replaces": None,
        },
    }


def cancelled(timer_id, seq=9):
    return {
        "event_type": "TIMER_CANCELLED",
        "entity_type": "timer",
        "entity_id": timer_id,
        "created_at": f"2026-09-26T14:00:00.{seq:06d}+00:00",
        "payload": {"reason": "user"},
    }


def test_no_events_is_no_timer():
    assert derive_timer([], T0) is None


def test_running_until_the_end_time():
    timer = derive_timer([started("a")], T0 + timedelta(seconds=100.2))
    assert timer["state"] == "running"
    assert timer["remaining_seconds"] == 500  # ceil(499.8)
    assert timer["remaining_spoken"] == "8 minutes 20 seconds"


def test_completed_at_and_after_the_end_time():
    for later in (600, 900):
        timer = derive_timer([started("a")], T0 + timedelta(seconds=later))
        assert timer["state"] == "completed"
        assert timer["remaining_seconds"] == 0


def test_status_of_the_experiment_is_not_consulted():
    # The dispatcher refuses step_timer on a non-RUNNING experiment before any
    # handler runs, so there is no "stopped" state (data-model §2).
    timer = derive_timer([started("a")], T0)
    assert timer["state"] == "running"


def test_cancelled_timer_is_gone():
    assert derive_timer([cancelled("a"), started("a")], T0) is None


def test_the_uncancelled_newer_timer_survives_a_cancelled_older_one():
    events = [started("b", seq=2), cancelled("a", seq=1), started("a", seq=0)]
    assert derive_timer(events, T0)["timer_id"] == "b"


def test_the_latest_of_two_uncancelled_starts_wins():
    # research R-312: a leaked second start supersedes the first on read.
    later = T0 + timedelta(seconds=30)
    events = [started("a", seq=0), started("b", at=later, seq=1)]
    assert derive_timer(events, later)["timer_id"] == "b"


def test_differs_from_protocol():
    assert derive_timer([started("a", seconds=720)], T0)["differs_from_protocol"] is True
    assert derive_timer([started("a", seconds=600)], T0)["differs_from_protocol"] is False
    assert derive_timer([started("a", protocol_seconds=None)], T0)["differs_from_protocol"] is False


def test_view_carries_the_stored_values():
    timer = derive_timer([started("a")], T0)
    assert timer["timer_id"] == "a"
    assert timer["duration_seconds"] == 600
    assert timer["duration_spoken"] == "10 minutes"
    assert timer["step_index"] == 2 and timer["step_name"] == "Centrifuge"
    assert timer["ends_at"] == (T0 + timedelta(seconds=600)).isoformat()


def test_completion_instructions_are_server_authored():
    text = completion_instructions("10 minutes", 2, "Centrifuge samples")
    assert "10 minutes" in text and "step 3" in text and "Centrifuge samples" in text
    assert text.endswith("Do not add anything else.")
    # A protocol with no steps: the step clause is dropped, not filled with "None".
    assert completion_instructions("30 seconds", None, None) == (
        "Tell the user, in one short sentence, that the timer for 30 seconds is complete. "
        "Do not add anything else."
    )
