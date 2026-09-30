"""specs/007-step-scoped-completeness — requirements keyed on (step, sample, requirement).

Runs the real handlers against the in-memory store on "Sample Stability
Evaluation v1.0" (conftest.STABILITY_STEPS). Time comes from a fake clock patched
into handlers._utcnow, the same seam the specs/004 timer tests use; no tool
argument can carry a time.

Constitution, Development Workflow: every rejection also asserts nothing was written.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.tools import handlers
from app.tools.models import (
    CompleteExperimentArgs,
    CompleteProtocolStepArgs,
    CorrectMeasurementArgs,
    CreateDeviationArgs,
    CreateExperimentArgs,
    NoArgs,
    RecordMeasurementArgs,
    RecordObservationArgs,
    StepTimerArgs,
)
from tests.conftest import OWNER_ID, stability_store

T0 = datetime(2026, 9, 28, 9, 0, 0, tzinfo=timezone.utc)
SAMPLES = ("A17", "A18", "CONTROL-01")
# Step indices in STABILITY_STEPS.
REGISTER, INITIAL_TEMP, INITIAL_PH, INITIAL_APPEARANCE, START_HOLD, HOLD = range(6)
FINAL_TEMP, FINAL_PH, FINAL_APPEARANCE, REVIEW, COMPLETE = range(6, 11)


class Clock:
    def __init__(self):
        self.now = T0

    def advance(self, minutes: float) -> None:
        self.now += timedelta(minutes=minutes)


@pytest.fixture
def clock(monkeypatch):
    c = Clock()
    monkeypatch.setattr(handlers, "_utcnow", lambda: c.now)
    return c


@pytest.fixture
def sb():
    return stability_store()


@pytest.fixture
def experiment(sb):
    return sb.rows("experiments")[0]


# ---------------------------------------------------------------------------
# drivers — every write goes through a real handler
# ---------------------------------------------------------------------------


def call(handler, sb, experiment, args):
    return handler(sb=sb, experiment=experiment, user_id=OWNER_ID, args=args, session_id="sess-007")


def at(experiment, index):
    experiment["current_step_index"] = index


def measure(sb, experiment, code, kind, value, unit=None):
    args = {"sample_code": code, "measurement_type": kind, "value": value}
    if unit:
        args["unit"] = unit
    return call(handlers.record_measurement, sb, experiment, RecordMeasurementArgs(**args))


def observe(sb, experiment, code, text):
    return call(handlers.record_observation, sb, experiment, RecordObservationArgs(observation=text, sample_code=code))


def advance(sb, experiment, **kwargs):
    return call(handlers.complete_protocol_step, sb, experiment, CompleteProtocolStepArgs(**kwargs))


def check(sb, experiment):
    result = call(handlers.check_experiment_completeness, sb, experiment, NoArgs())
    assert result["success"] is True, result
    return result["data"]


def missing_for(state, step_index):
    return [m for m in state["missing"] if m["step_index"] == step_index]


def step_report(state, step_index):
    return next(s for s in state["steps"] if s["step_index"] == step_index)


def readings(sb, experiment, step, kind, values):
    at(experiment, step)
    for code, value in zip(SAMPLES, values):
        assert measure(sb, experiment, code, kind, value)["success"] is True


def observations(sb, experiment, step, texts=("clear", "clear", "clear")):
    at(experiment, step)
    for code, text in zip(SAMPLES, texts):
        assert observe(sb, experiment, code, text)["success"] is True


def run_hold(sb, experiment, clock, minutes):
    """Complete START_HOLD (which starts the hold), wait, complete the hold."""
    at(experiment, START_HOLD)
    entered = advance(sb, experiment)
    assert entered["data"]["started_step"]["code"] == "STABILITY_HOLD"
    clock.advance(minutes)
    return advance(sb, experiment)


def everything_but(sb, experiment, clock, *, skip=(), hold_minutes=15):
    """Record every requirement of the stability protocol except the named steps."""
    if INITIAL_TEMP not in skip:
        readings(sb, experiment, INITIAL_TEMP, "temperature", (4.2, 4.4, 4.1))
    if INITIAL_PH not in skip:
        readings(sb, experiment, INITIAL_PH, "pH", (7.1, 7.0, 7.2))
    if INITIAL_APPEARANCE not in skip:
        observations(sb, experiment, INITIAL_APPEARANCE)
    if HOLD not in skip:
        run_hold(sb, experiment, clock, hold_minutes)
    if FINAL_TEMP not in skip:
        readings(sb, experiment, FINAL_TEMP, "temperature", (4.5, 4.6, 4.3))
    if FINAL_PH not in skip:
        readings(sb, experiment, FINAL_PH, "pH", (7.1, 6.8, 7.2))
    if FINAL_APPEARANCE not in skip:
        observations(sb, experiment, FINAL_APPEARANCE)
    if REVIEW not in skip:
        at(experiment, REVIEW)
        advance(sb, experiment)


def deviations(sb, code=None):
    return [d for d in sb.rows("deviations") if code is None or d.get("code") == code]


# ---------------------------------------------------------------------------
# 1–3 step-scoped readings and observations
# ---------------------------------------------------------------------------


def test_1_initial_temperature_does_not_satisfy_final(sb, experiment):
    readings(sb, experiment, INITIAL_TEMP, "temperature", (4.2, 4.4, 4.1))
    state = check(sb, experiment)

    assert step_report(state, INITIAL_TEMP)["complete"] is True
    assert step_report(state, FINAL_TEMP)["complete"] is False
    final = missing_for(state, FINAL_TEMP)
    assert {m["sample_code"] for m in final} == set(SAMPLES)
    assert all(
        m["step_code"] == "FINAL_TEMP" and m["requirement_type"] == "measurement" and m["measurement_type"] == "temperature"
        for m in final
    )


def test_2_every_sample_needs_its_final_temperature(sb, experiment):
    at(experiment, FINAL_TEMP)
    measure(sb, experiment, "A17", "temperature", 4.5)
    measure(sb, experiment, "A18", "temperature", 4.6)

    final = missing_for(check(sb, experiment), FINAL_TEMP)
    assert [(m["sample_code"], m["measurement_type"]) for m in final] == [("CONTROL-01", "temperature")]
    assert final[0]["step_name"] == "Record final temperature"
    assert "CONTROL-01" in final[0]["message"]


def test_3_initial_observations_do_not_satisfy_final(sb, experiment):
    observations(sb, experiment, INITIAL_APPEARANCE)
    state = check(sb, experiment)

    assert step_report(state, INITIAL_APPEARANCE)["complete"] is True
    final = missing_for(state, FINAL_APPEARANCE)
    assert {(m["sample_code"], m["requirement_type"]) for m in final} == {(c, "observation") for c in SAMPLES}


def test_observation_for_one_sample_does_not_cover_another(sb, experiment):
    at(experiment, INITIAL_APPEARANCE)
    observe(sb, experiment, "A17", "clear")
    observe(sb, experiment, None, "the whole rack looks fine")  # run-level, no sample
    assert {m["sample_code"] for m in missing_for(check(sb, experiment), INITIAL_APPEARANCE)} == {"A18", "CONTROL-01"}


# ---------------------------------------------------------------------------
# 4–6 range validation: stored, flagged, never rejected
# ---------------------------------------------------------------------------


def test_4_out_of_range_temperature_is_saved_with_one_deviation(sb, experiment):
    at(experiment, INITIAL_TEMP)
    result = measure(sb, experiment, "A17", "temperature", 10.2, "C")

    assert result["success"] is True
    assert result["data"]["value"] == 10.2 and result["data"]["unit"] == "C"
    assert result["data"]["protocol_step"] == {"index": 1, "code": "INITIAL_TEMP", "name": "Record initial temperature"}
    warning = result["warning"]
    assert (warning["type"], warning["minimum"], warning["maximum"], warning["actual"]) == ("OUT_OF_RANGE", 2, 8, 10.2)

    assert [m["value"] for m in sb.rows("measurements")] == [10.2]
    [deviation] = deviations(sb)
    assert deviation["code"] == "OUT_OF_RANGE"
    assert deviation["measurement_id"] == result["data"]["measurement_id"] == warning["measurement_id"]
    assert deviation["protocol_step_index"] == INITIAL_TEMP
    assert deviation["id"] == warning["deviation_id"]
    assert [e["event_type"] for e in sb.rows("events")] == ["MEASUREMENT_CREATED", "DEVIATION_CREATED"]

    # The requirement is present: it is out of range, not missing.
    state = check(sb, experiment)
    assert "A17" not in {m["sample_code"] for m in missing_for(state, INITIAL_TEMP)}
    item = next(i for i in step_report(state, INITIAL_TEMP)["requirements"] if i["sample_code"] == "A17")
    assert item["satisfied"] is True and item["out_of_range"] is True


def test_5_in_range_measurement_creates_no_deviation(sb, experiment):
    at(experiment, INITIAL_TEMP)
    result = measure(sb, experiment, "A17", "temperature", 4.2, "C")
    assert result["success"] is True and "warning" not in result
    assert deviations(sb) == []


def test_6_ph_out_of_range_is_saved_with_a_deviation(sb, experiment):
    at(experiment, FINAL_PH)
    result = measure(sb, experiment, "A18", "pH", 8.1)
    assert result["success"] is True
    assert result["data"]["unit"] == "pH"
    assert (result["warning"]["minimum"], result["warning"]["maximum"]) == (6.5, 7.5)
    assert len(deviations(sb, "OUT_OF_RANGE")) == 1


def test_range_bounds_are_inclusive(sb, experiment):
    at(experiment, INITIAL_TEMP)
    for code, value in (("A17", 2), ("A18", 8)):
        assert "warning" not in measure(sb, experiment, code, "temperature", value)
    assert deviations(sb) == []


def test_reading_at_a_step_that_does_not_require_it_is_not_range_checked(sb, experiment):
    at(experiment, START_HOLD)
    result = measure(sb, experiment, "A17", "temperature", 30, "C")
    assert result["success"] is True and "warning" not in result
    # …and it satisfies neither temperature step.
    state = check(sb, experiment)
    assert "A17" in {m["sample_code"] for m in missing_for(state, INITIAL_TEMP)}
    assert "A17" in {m["sample_code"] for m in missing_for(state, FINAL_TEMP)}


def test_unit_contradicting_the_step_is_a_question_and_writes_nothing(sb, experiment):
    at(experiment, INITIAL_TEMP)
    result = measure(sb, experiment, "A17", "temperature", 39.2, "F")
    assert result["success"] is False and result["error"] == "UNIT_MISMATCH"
    assert result["detail"]["required_unit"] == "C"
    assert sb.count("measurements") == 0 and sb.count("events") == 0 and sb.count("deviations") == 0


def test_required_unit_fills_an_omitted_unit(sb, experiment):
    at(experiment, INITIAL_TEMP)
    assert measure(sb, experiment, "A17", "temperature", 4.2)["data"]["unit"] == "C"


# ---------------------------------------------------------------------------
# 7–12 the timed hold
# ---------------------------------------------------------------------------


def test_7_hold_never_started_is_incomplete(sb, experiment, clock):
    everything_but(sb, experiment, clock, skip=(HOLD,))
    state = check(sb, experiment)

    assert state["complete"] is False
    hold = missing_for(state, HOLD)
    assert [(m["check"], m["message"]) for m in hold] == [
        ("started", "Stability hold has not been started."),
        ("completed", "Stability hold has not been completed."),
    ]
    assert step_report(state, HOLD)["timing"]["status"] == "not_started"


def test_8_hold_started_but_not_completed_is_incomplete(sb, experiment, clock):
    at(experiment, START_HOLD)
    advance(sb, experiment)
    clock.advance(10)

    state = check(sb, experiment)
    assert state["complete"] is False
    assert [m["check"] for m in missing_for(state, HOLD)] == ["completed"]
    assert step_report(state, HOLD)["timing"]["status"] == "running"
    assert step_report(state, HOLD)["timing"]["started_at"] == T0.isoformat()


def test_9_hold_within_window_has_no_deviation(sb, experiment, clock):
    result = run_hold(sb, experiment, clock, 15)
    timing = result["data"]["timing"]
    assert (timing["elapsed_seconds"], timing["status"]) == (900, "within_window")
    assert "warning" not in result
    assert deviations(sb) == []
    assert missing_for(check(sb, experiment), HOLD) == []


@pytest.mark.parametrize(
    ("minutes", "code", "status"),
    [(13, "STEP_DURATION_TOO_SHORT", "too_short"), (20, "STEP_DURATION_TOO_LONG", "too_long")],
)
def test_10_11_hold_outside_window_is_complete_with_a_timing_deviation(sb, experiment, clock, minutes, code, status):
    result = run_hold(sb, experiment, clock, minutes)

    assert result["success"] is True
    assert result["data"]["timing"]["status"] == status
    assert result["data"]["timing"]["elapsed_seconds"] == minutes * 60
    assert result["warning"]["type"] == code
    [deviation] = deviations(sb)
    assert (deviation["code"], deviation["type"], deviation["protocol_step_index"]) == (code, "timing", HOLD)

    state = check(sb, experiment)
    assert missing_for(state, HOLD) == []  # completed, just not compliant
    assert step_report(state, HOLD)["timing"]["status"] == status
    assert step_report(state, HOLD)["timing"]["deviation_id"] == deviation["id"]

    completed = [e for e in sb.rows("events") if e["event_type"] == "PROTOCOL_STEP_COMPLETED"]
    assert completed[-1]["payload"]["elapsed_seconds"] == minutes * 60
    assert completed[-1]["payload"]["timing_status"] == status


def test_12_timing_deviation_does_not_block_completeness(sb, experiment, clock):
    everything_but(sb, experiment, clock, hold_minutes=20)
    state = check(sb, experiment)
    assert state["complete"] is True, state["missing"]
    assert state["summary"]["deviations"] >= 1


def test_hold_times_come_from_the_server_clock(sb, experiment, clock):
    run_hold(sb, experiment, clock, 16)
    started = next(e for e in sb.rows("events") if e["event_type"] == "PROTOCOL_STEP_STARTED")
    assert started["payload"]["started_at"] == T0.isoformat()
    assert started["payload"]["step_code"] == "STABILITY_HOLD"


def test_completing_an_unstarted_timed_step_is_refused_and_writes_nothing(sb, experiment, clock):
    at(experiment, HOLD)  # reached without the start step
    result = advance(sb, experiment)
    assert result["error"] == "STEP_NOT_STARTED"
    assert experiment["current_step_index"] == HOLD
    assert sb.count("events") == 0 and sb.count("deviations") == 0


def test_starting_the_timer_starts_the_step_with_the_declared_duration(sb, experiment, clock):
    at(experiment, HOLD)
    started = call(handlers.step_timer, sb, experiment, StepTimerArgs(action="start"))
    assert started["data"]["timer"]["duration_seconds"] == 900  # declared, not parsed from the name
    assert started["data"]["started_step"]["started_at"] == T0.isoformat()

    clock.advance(16)
    done = advance(sb, experiment)
    assert done["success"] is True and done["data"]["timing"]["status"] == "within_window"
    # One start only: a second timer does not restart the hold.
    assert sum(e["event_type"] == "PROTOCOL_STEP_STARTED" for e in sb.rows("events")) == 1


def test_timer_still_running_is_asked_before_the_hold_completes(sb, experiment, clock):
    at(experiment, HOLD)
    call(handlers.step_timer, sb, experiment, StepTimerArgs(action="start"))
    clock.advance(14.5)
    assert advance(sb, experiment)["error"] == "TIMER_STILL_RUNNING"
    assert deviations(sb) == []
    result = advance(sb, experiment, confirmed_early=True)
    assert result["data"]["timing"]["status"] == "within_window"


# ---------------------------------------------------------------------------
# 13–14 corrections
# ---------------------------------------------------------------------------


def test_13_a_correction_is_one_effective_measurement_and_one_correction(sb, experiment):
    at(experiment, FINAL_TEMP)
    original = measure(sb, experiment, "A18", "temperature", 4.6)["data"]["measurement_id"]
    corrected = call(
        handlers.correct_measurement, sb, experiment,
        CorrectMeasurementArgs(sample_code="A18", measurement_type="temperature", new_value=4.8),
    )
    assert corrected["data"]["previous_value"] == 4.6 and corrected["data"]["new_value"] == 4.8

    rows = {m["id"]: m for m in sb.rows("measurements")}
    assert rows[original]["value"] == 4.6  # the original is kept
    assert rows[original]["superseded_by"] == corrected["data"]["measurement_id"]

    state = check(sb, experiment)
    assert (state["summary"]["measurements"], state["summary"]["corrections"]) == (1, 1)
    item = next(i for i in step_report(state, FINAL_TEMP)["requirements"] if i["sample_code"] == "A18")
    assert item["value"] == 4.8


def test_14_correction_after_moving_on_still_satisfies_the_final_step(sb, experiment):
    readings(sb, experiment, INITIAL_TEMP, "temperature", (4.2, 4.4, 4.1))
    readings(sb, experiment, FINAL_TEMP, "temperature", (4.5, 4.6, 4.3))
    at(experiment, FINAL_PH)  # moved on, then corrected
    result = call(
        handlers.correct_measurement, sb, experiment,
        CorrectMeasurementArgs(sample_code="A18", measurement_type="temperature", new_value=4.8),
    )
    assert result["data"]["protocol_step"]["code"] == "FINAL_TEMP"
    assert result["data"]["previous_value"] == 4.6  # the final reading, not the initial one

    state = check(sb, experiment)
    assert missing_for(state, FINAL_TEMP) == [] and missing_for(state, INITIAL_TEMP) == []
    by_step = {s["step_index"]: s for s in state["steps"]}
    a18 = lambda idx: next(i for i in by_step[idx]["requirements"] if i["sample_code"] == "A18")  # noqa: E731
    assert (a18(INITIAL_TEMP)["value"], a18(FINAL_TEMP)["value"]) == (4.4, 4.8)


def test_correction_at_the_current_step_targets_that_step(sb, experiment):
    readings(sb, experiment, INITIAL_TEMP, "temperature", (4.2, 4.4, 4.1))
    readings(sb, experiment, FINAL_TEMP, "temperature", (4.5, 4.6, 4.3))
    at(experiment, INITIAL_TEMP)
    result = call(
        handlers.correct_measurement, sb, experiment,
        CorrectMeasurementArgs(sample_code="A18", measurement_type="temperature", new_value=4.5),
    )
    assert result["data"]["previous_value"] == 4.4


def test_correction_chain_resolves_to_the_last_value(sb, experiment):
    at(experiment, FINAL_TEMP)
    measure(sb, experiment, "A17", "temperature", 4.6)
    for value in (4.8, 4.7):
        call(
            handlers.correct_measurement, sb, experiment,
            CorrectMeasurementArgs(sample_code="A17", measurement_type="temperature", new_value=value),
        )
    assert sb.count("measurements") == 3
    state = check(sb, experiment)
    assert (state["summary"]["measurements"], state["summary"]["corrections"]) == (1, 2)
    item = next(i for i in step_report(state, FINAL_TEMP)["requirements"] if i["sample_code"] == "A17")
    assert item["value"] == 4.7


def test_correcting_into_range_keeps_the_original_deviation_and_adds_none(sb, experiment):
    at(experiment, INITIAL_TEMP)
    measure(sb, experiment, "A17", "temperature", 10.2)
    result = call(
        handlers.correct_measurement, sb, experiment,
        CorrectMeasurementArgs(sample_code="A17", measurement_type="temperature", new_value=4.2),
    )
    assert "warning" not in result
    assert len(deviations(sb)) == 1  # the record of what was said is not rewritten


def test_correcting_out_of_range_logs_a_deviation_for_the_new_value(sb, experiment):
    at(experiment, INITIAL_TEMP)
    measure(sb, experiment, "A17", "temperature", 4.2)
    result = call(
        handlers.correct_measurement, sb, experiment,
        CorrectMeasurementArgs(sample_code="A17", measurement_type="temperature", new_value=9.1),
    )
    assert result["warning"]["type"] == "OUT_OF_RANGE"
    assert deviations(sb)[0]["measurement_id"] == result["data"]["measurement_id"]


# ---------------------------------------------------------------------------
# 15–16 deviation review
# ---------------------------------------------------------------------------


def test_15_required_deviation_review(sb, experiment, clock):
    everything_but(sb, experiment, clock, skip=(REVIEW,), hold_minutes=20)
    before = check(sb, experiment)
    assert before["complete"] is False
    [item] = missing_for(before, REVIEW)
    assert item["requirement_type"] == "deviation_review"

    at(experiment, REVIEW)
    result = advance(sb, experiment)
    review = result["data"]["deviation_review"]
    assert (review["deviation_count"], review["open_deviation_count"]) == (1, 1)
    [event] = [e for e in sb.rows("events") if e["event_type"] == "DEVIATIONS_REVIEWED"]
    assert event["payload"]["reviewed_by"] == OWNER_ID
    assert event["payload"]["reviewed_at"] == clock.now.isoformat()
    assert event["payload"]["deviation_count"] == 1
    assert check(sb, experiment)["complete"] is True


def test_16_a_run_with_no_deviations_can_be_reviewed(sb, experiment):
    at(experiment, REVIEW)
    result = advance(sb, experiment)
    assert result["data"]["deviation_review"]["message"] == "No deviations found. Deviation review marked complete."
    assert missing_for(check(sb, experiment), REVIEW) == []


def test_a_deviation_after_the_review_makes_it_stale_and_it_can_be_redone(sb, experiment, clock):
    everything_but(sb, experiment, clock)
    assert check(sb, experiment)["complete"] is True

    at(experiment, COMPLETE)
    call(handlers.create_deviation, sb, experiment, CreateDeviationArgs(description="Fridge door left open"))
    [stale] = missing_for(check(sb, experiment), REVIEW)
    assert "after the last review" in stale["message"]

    # Away from the review step, the flag records the review and does not advance.
    result = advance(sb, experiment, deviations_reviewed=True)
    assert result["data"]["advanced"] is False and result["data"]["completed_step"] is None
    assert experiment["current_step_index"] == COMPLETE
    assert check(sb, experiment)["complete"] is True


def test_reviewing_twice_with_nothing_new_writes_one_event(sb, experiment):
    at(experiment, COMPLETE)
    advance(sb, experiment, deviations_reviewed=True)
    again = advance(sb, experiment, deviations_reviewed=True)
    assert again["data"]["deviation_review"]["already_reviewed"] is True
    assert sum(e["event_type"] == "DEVIATIONS_REVIEWED" for e in sb.rows("events")) == 1


def test_review_is_required_only_where_the_protocol_says_so(sb, experiment):
    from tests.conftest import PROTOCOL_STEPS

    sb.rows("protocols")[0]["steps"] = PROTOCOL_STEPS
    assert all(m["requirement_type"] != "deviation_review" for m in check(sb, experiment)["missing"])


# ---------------------------------------------------------------------------
# 17–18 sample composition
# ---------------------------------------------------------------------------


def create(sb, **args):
    return handlers.create_experiment(
        sb=sb, experiment=None, user_id=OWNER_ID, session_id="sess-007",
        args=CreateExperimentArgs(name="Stability run", protocol_ref="STAB", confirmed=True, **args),
    )


def created_experiment(sb, result):
    return next(e for e in sb.rows("experiments") if e["id"] == result["data"]["experiment_id"])


def test_17_sample_types_satisfy_the_composition(sb):
    result = create(sb, test_samples=["A17", "a18"], control_samples=["CONTROL-01"])
    assert result["success"] is True
    assert result["data"]["samples"] == [
        {"code": "A17", "sample_type": "test"},
        {"code": "A18", "sample_type": "test"},
        {"code": "CONTROL-01", "sample_type": "control"},
    ]
    created = [e for e in sb.rows("events") if e["event_type"] == "SAMPLE_CREATED"]
    assert [e["payload"]["sample_type"] for e in created[-3:]] == ["test", "test", "control"]

    state = check(sb, created_experiment(sb, result))
    assert missing_for(state, REGISTER) == []
    items = step_report(state, REGISTER)["requirements"]
    assert [(i["sample_type"], i["actual_count"]) for i in items] == [("test", 2), ("control", 1)]


def test_18_missing_control_sample(sb, experiment):
    # A run made before samples were checked at creation (FR-713) still reports it.
    sb.tables["samples"] = [s for s in sb.rows("samples") if s["sample_code"] != "CONTROL-01"]
    [item] = missing_for(check(sb, experiment), REGISTER)
    assert (item["requirement_type"], item["sample_type"], item["expected_count"], item["actual_count"]) == (
        "samples", "control", 1, 0,
    )


def test_sample_codes_alone_still_create_default_typed_samples(sb):
    # No protocol, so no composition to meet; untyped samples keep the default.
    result = handlers.create_experiment(
        sb=sb, experiment=None, user_id=OWNER_ID,
        args=CreateExperimentArgs(name="Draft run", sample_codes=["A17", "A18"], confirmed=True),
    )
    assert result["success"] is True
    assert {s["sample_type"] for s in result["data"]["samples"]} == {"experimental"}


def test_invalid_typed_sample_code_is_rejected_before_any_write(sb):
    experiments_before, events_before = sb.count("experiments"), sb.count("events")
    result = create(sb, test_samples=["A17 test!"])
    assert result["error"] == "INVALID_SAMPLE_CODE"
    assert (sb.count("experiments"), sb.count("events")) == (experiments_before, events_before)


def test_nested_samples_argument_is_refused_structurally():
    # R-716: a nested list stalls the voice agent; types ride in spoken-code lists.
    with pytest.raises(ValidationError):
        CreateExperimentArgs(name="x", confirmed=True, samples=[{"code": "A17"}])


def test_typed_and_untyped_lists_combine(sb):
    # data-model §8: the list a code is in is its type; sample_codes keeps the default.
    result = create(sb, sample_codes=["B1"], test_samples=["A17", "A18"], control_samples=["CONTROL-01"])
    assert result["data"]["samples"] == [
        {"code": "A17", "sample_type": "test"},
        {"code": "A18", "sample_type": "test"},
        {"code": "CONTROL-01", "sample_type": "control"},
        {"code": "B1", "sample_type": "experimental"},
    ]


def test_a_code_in_two_lists_is_a_duplicate(sb):
    before = sb.count("experiments")
    assert create(sb, test_samples=["A17"], control_samples=["a17"])["error"] == "DUPLICATE_SAMPLE_CODE"
    assert sb.count("experiments") == before


def test_confirmation_readback_lists_sample_types(sb):
    result = handlers.create_experiment(
        sb=sb, experiment=None, user_id=OWNER_ID,
        args=CreateExperimentArgs(name="Stability run", protocol_ref="STAB", confirmed=False,
                                  test_samples=["A17", "A18"], control_samples=["CONTROL-01"]),
    )
    assert result["error"] == "NEEDS_CONFIRMATION"
    assert result["detail"]["samples"] == [
        {"code": "A17", "sample_type": "test"},
        {"code": "A18", "sample_type": "test"},
        {"code": "CONTROL-01", "sample_type": "control"},
    ]


# ---------------------------------------------------------------------------
# 19 idempotency
# ---------------------------------------------------------------------------


def test_19_repeated_checks_and_completions_do_not_duplicate_deviations(sb, experiment, clock):
    at(experiment, INITIAL_TEMP)
    measure(sb, experiment, "A17", "temperature", 10.2)
    run_hold(sb, experiment, clock, 20)
    assert len(deviations(sb)) == 2

    for _ in range(3):
        check(sb, experiment)
        call(handlers.complete_experiment, sb, experiment, CompleteExperimentArgs(confirmed=True))
    assert len(deviations(sb)) == 2

    # The hold completed a second time (after being moved back) keeps one timing deviation.
    at(experiment, HOLD)
    clock.advance(5)
    advance(sb, experiment)
    assert len(deviations(sb, "STEP_DURATION_TOO_LONG")) == 1


# ---------------------------------------------------------------------------
# 20 legacy protocols, invalid protocols, gate order
# ---------------------------------------------------------------------------


def test_20_legacy_protocol_still_completes():
    from tests.conftest import seeded_store

    legacy = seeded_store()
    experiment = legacy.rows("experiments")[0]
    readings(legacy, experiment, 1, "temperature", (4.2, 4.3, 4.1))
    assert check(legacy, experiment)["complete"] is False  # step 4 asks for temperature too
    readings(legacy, experiment, 3, "temperature", (4.4, 4.5, 4.2))
    state = check(legacy, experiment)
    assert state["complete"] is True
    assert all("timing" not in s for s in state["steps"])  # untimed stays untimed
    assert "warning" not in measure(legacy, experiment, "A17", "temperature", 99)  # no range, no check


def test_malformed_requirements_are_reported_not_ignored(sb, experiment):
    sb.rows("protocols")[0]["steps"][1]["requirements"] = [{"type": "measurement"}]  # no measurement_type
    result = call(handlers.check_experiment_completeness, sb, experiment, NoArgs())
    assert result["error"] == "PROTOCOL_INVALID" and result["detail"]["step_index"] == 1
    gate = call(handlers.complete_experiment, sb, experiment, CompleteExperimentArgs(confirmed=True))
    assert gate["error"] == "PROTOCOL_INVALID"
    assert sb.rows("experiments")[0]["status"] == "RUNNING"
    # Recording is not blocked by it.
    assert measure(sb, experiment, "A17", "temperature", 4.2)["success"] is True


def test_incomplete_completion_carries_structured_missing_items(sb, experiment):
    result = call(handlers.complete_experiment, sb, experiment, CompleteExperimentArgs(confirmed=True))
    assert result["error"] == "INCOMPLETE"
    assert {"step_code", "step_name", "requirement_type", "sample_code"} <= set(result["detail"]["missing"][0])
    assert sb.rows("experiments")[0]["status"] == "RUNNING"


# ---------------------------------------------------------------------------
# Part 26 — the end-to-end acceptance scenario
# ---------------------------------------------------------------------------


def test_acceptance_stab_104(sb, clock):
    # A completed STAB-103 already exists, so the new run is STAB-104.
    sb.rows("experiments")[0].update(experiment_code="STAB-103", status="COMPLETED")
    result = create(sb, test_samples=["A17", "A18"], control_samples=["CONTROL-01"])
    assert (result["data"]["experiment_code"], result["data"]["status"]) == ("STAB-104", "RUNNING")
    run = created_experiment(sb, result)

    def spoken(step, kind, values):
        assert run["current_step_index"] == step
        for code, value in zip(SAMPLES, values):
            assert "warning" not in measure(sb, run, code, kind, value)
        advance(sb, run)

    def noted(step, texts):
        assert run["current_step_index"] == step
        for code, text in zip(SAMPLES, texts):
            observe(sb, run, code, text)
        advance(sb, run)

    advance(sb, run)  # samples registered
    spoken(INITIAL_TEMP, "temperature", (4.2, 4.4, 4.1))
    spoken(INITIAL_PH, "pH", (7.1, 7.0, 7.2))
    noted(INITIAL_APPEARANCE, ("clear", "slightly cloudy", "clear"))

    assert advance(sb, run)["data"]["started_step"]["code"] == "STABILITY_HOLD"  # "start the hold"
    clock.advance(20)
    hold = advance(sb, run)
    assert hold["warning"]["type"] == "STEP_DURATION_TOO_LONG"

    assert run["current_step_index"] == FINAL_TEMP
    for code, value in zip(SAMPLES, (4.5, 4.6, 4.3)):
        measure(sb, run, code, "temperature", value)
    fix = call(handlers.correct_measurement, sb, run,
               CorrectMeasurementArgs(sample_code="A18", measurement_type="temperature", new_value=4.8))
    assert (fix["data"]["previous_value"], fix["data"]["new_value"]) == (4.6, 4.8)
    advance(sb, run)
    spoken(FINAL_PH, "pH", (7.1, 6.8, 7.2))
    noted(FINAL_APPEARANCE, ("clear", "slight cloudiness remains", "clear"))

    assert run["current_step_index"] == REVIEW
    assert advance(sb, run)["data"]["deviation_review"]["deviation_count"] == 1

    state = check(sb, run)
    assert state["complete"] is True, state["missing"]
    assert state["summary"] == {
        "samples": 3, "measurements": 12, "observations": 6, "corrections": 1, "deviations": 1, "open_deviations": 1,
    }
    hold_view = step_report(state, HOLD)["timing"]
    assert (hold_view["elapsed_seconds"], hold_view["status"], hold_view["min_seconds"], hold_view["max_seconds"]) == (
        1200, "too_long", 840, 1020,
    )
    final = {i["sample_code"]: i["value"] for i in step_report(state, FINAL_TEMP)["requirements"]}
    assert final == {"A17": 4.5, "A18": 4.8, "CONTROL-01": 4.3}

    unconfirmed = call(handlers.complete_experiment, sb, run, CompleteExperimentArgs(confirmed=False))
    assert unconfirmed["error"] == "NEEDS_CONFIRMATION" and run["status"] == "RUNNING"

    done = call(handlers.complete_experiment, sb, run, CompleteExperimentArgs(confirmed=True))
    assert done["data"]["status"] == "COMPLETED"
    summary = done["data"]["summary"]
    assert (summary["sample_count"], summary["measurement_count"], summary["observation_count"],
            summary["correction_count"], summary["deviation_count"]) == (3, 12, 6, 1, 1)

    # Constitution II: every data row the run produced has an event.
    entity_ids = {e["entity_id"] for e in sb.rows("events")}
    for table in ("measurements", "observations", "deviations", "samples"):
        rows = [r for r in sb.rows(table) if r.get("experiment_id") == run["id"]]
        assert rows and all(r["id"] in entity_ids for r in rows), table


def test_a_declared_duration_alone_sets_the_timer_but_does_not_require_a_start(sb, experiment):
    step = sb.rows("protocols")[0]["steps"][START_HOLD]
    step["expected_duration_seconds"] = 120
    at(experiment, START_HOLD)
    assert call(handlers.get_active_experiment, sb, experiment, NoArgs())["data"]["current_step"]["timer_seconds"] == 120
    assert advance(sb, experiment)["success"] is True  # no STEP_NOT_STARTED


# ---------------------------------------------------------------------------
# Exact values and one-sided ranges (protocol form, specs/007)
# ---------------------------------------------------------------------------


def with_expectation(sb, step, **expectation):
    requirement = {"type": "measurement", "measurement_type": "pH", "scope": "all_samples", **expectation}
    sb.rows("protocols")[0]["steps"][step]["requirements"] = [requirement]


def test_exact_value_match_logs_nothing(sb, experiment):
    with_expectation(sb, INITIAL_PH, exact=7)
    at(experiment, INITIAL_PH)
    assert "warning" not in measure(sb, experiment, "A17", "pH", 7.00)
    assert deviations(sb) == []


def test_any_difference_from_an_exact_value_is_saved_and_logged(sb, experiment):
    with_expectation(sb, INITIAL_PH, exact=7)
    at(experiment, INITIAL_PH)
    result = measure(sb, experiment, "A17", "pH", 7.01)

    assert result["success"] is True and result["data"]["value"] == 7.01
    warning = result["warning"]
    assert (warning["type"], warning["expected"], warning["actual"]) == ("UNEXPECTED_VALUE", 7, 7.01)
    [deviation] = deviations(sb)
    assert (deviation["code"], deviation["measurement_id"]) == ("UNEXPECTED_VALUE", result["data"]["measurement_id"])
    assert "differs from the expected exactly 7" in deviation["description"]

    state = check(sb, experiment)
    item = next(i for i in step_report(state, INITIAL_PH)["requirements"] if i["sample_code"] == "A17")
    assert item["satisfied"] is True and item["out_of_range"] is True and item["expected"]["exact"] == 7


def test_one_sided_range(sb, experiment):
    with_expectation(sb, INITIAL_PH, min=6.5)
    at(experiment, INITIAL_PH)
    assert "warning" not in measure(sb, experiment, "A17", "pH", 9)
    assert measure(sb, experiment, "A18", "pH", 6.4)["warning"]["type"] == "OUT_OF_RANGE"


def test_expectation_without_a_unit_is_refused_unless_dimensionless():
    from app.tools.requirements import MeasurementRequirement

    with pytest.raises(ValidationError):
        MeasurementRequirement(measurement_type="temperature", min=2)
    assert MeasurementRequirement(measurement_type="ph", exact=7).unit == "pH"
    assert MeasurementRequirement(measurement_type="temperature").unit is None  # no expectation, no unit needed


def test_maximum_only_range(sb, experiment):
    with_expectation(sb, INITIAL_PH, max=7.5)
    at(experiment, INITIAL_PH)
    assert "warning" not in measure(sb, experiment, "A17", "pH", 7.5)  # the bound itself is allowed
    assert "warning" not in measure(sb, experiment, "A18", "pH", 1)
    result = measure(sb, experiment, "CONTROL-01", "pH", 7.6)
    assert result["success"] is True
    assert (result["warning"]["type"], result["warning"]["minimum"], result["warning"]["maximum"]) == ("OUT_OF_RANGE", None, 7.5)
    [deviation] = deviations(sb)
    assert "at most 7.5" in deviation["description"]


# ---------------------------------------------------------------------------
# Step gate (owner report 2026-09-30): moving on with readings missing asks
# first. One temperature of three, "next step", used to advance silently.
# ---------------------------------------------------------------------------


def step_events(sb, index):
    return [
        e for e in sb.rows("events")
        if e["event_type"] == "PROTOCOL_STEP_COMPLETED" and e["payload"].get("step_index") == index
    ]


def test_step_with_missing_readings_is_not_completed_without_a_yes(sb, experiment):
    at(experiment, INITIAL_TEMP)
    assert measure(sb, experiment, "A17", "temperature", 4.2)["success"] is True
    result = advance(sb, experiment)
    assert result["error"] == "STEP_INCOMPLETE"
    assert [(m["sample_code"], m["measurement_type"]) for m in result["detail"]["missing"]] == [
        ("A18", "temperature"), ("CONTROL-01", "temperature"),
    ]
    assert "A18" in result["message"] and "CONTROL-01" in result["message"]
    assert experiment["current_step_index"] == INITIAL_TEMP
    assert step_events(sb, INITIAL_TEMP) == []


def test_step_is_completed_anyway_after_a_yes(sb, experiment):
    at(experiment, INITIAL_TEMP)
    result = advance(sb, experiment, confirmed_incomplete=True)
    assert result["success"] is True
    assert experiment["current_step_index"] == INITIAL_PH
    assert len(step_events(sb, INITIAL_TEMP)) == 1
    # The run is still incomplete: skipping a step never satisfies it.
    assert missing_for(check(sb, experiment), INITIAL_TEMP)


def test_complete_step_advances_without_asking(sb, experiment):
    readings(sb, experiment, INITIAL_TEMP, "temperature", (4.2, 4.4, 4.1))
    assert advance(sb, experiment)["success"] is True
    assert experiment["current_step_index"] == INITIAL_PH


def test_missing_observations_gate_their_step(sb, experiment):
    at(experiment, INITIAL_APPEARANCE)
    assert observe(sb, experiment, "A17", "clear")["success"] is True
    result = advance(sb, experiment)
    assert result["error"] == "STEP_INCOMPLETE"
    assert {m["sample_code"] for m in result["detail"]["missing"]} == {"A18", "CONTROL-01"}


def test_steps_satisfied_by_completing_them_are_not_gated(sb, experiment, clock):
    # The review step is satisfied BY completing it; so is a step with no requirements.
    at(experiment, START_HOLD)
    assert advance(sb, experiment)["success"] is True
    at(experiment, REVIEW)
    assert advance(sb, experiment)["success"] is True


def test_a_spoken_unit_name_counts_as_the_required_unit(sb, experiment):
    # The agent must pass the unit as said (vendor rule, R-716): "Celsius" is C.
    at(experiment, INITIAL_TEMP)
    for code, unit in (("A17", "Celsius"), ("A18", "degrees Celsius"), ("CONTROL-01", "°C")):
        result = measure(sb, experiment, code, "temperature", 4.2, unit=unit)
        assert result["success"] is True, result
        assert result["data"]["unit"] == "C"
    assert {m["unit"] for m in sb.rows("measurements")} == {"C"}


def test_bare_degrees_is_stored_as_the_required_celsius(sb, experiment):
    # voice-agent-stuck-actions: "A17 is 4.2 degrees" at a C step looped on
    # UNIT_MISMATCH ("in C, not degrees") however often the user repeated it.
    at(experiment, INITIAL_TEMP)
    for code, unit in (("A17", "degrees"), ("A18", "degree"), ("CONTROL-01", "centigrade")):
        result = measure(sb, experiment, code, "temperature", 4.2, unit=unit)
        assert result["success"] is True, result
        assert result["data"]["unit"] == "C"
    assert {m["unit"] for m in sb.rows("measurements")} == {"C"}


def test_another_unit_is_still_refused(sb, experiment):
    at(experiment, INITIAL_TEMP)
    result = measure(sb, experiment, "A17", "temperature", 39.2, unit="degrees Fahrenheit")
    assert result["error"] == "UNIT_MISMATCH"
    assert sb.rows("measurements") == []


# ---------------------------------------------------------------------------
# Samples are a precondition (FR-713 to FR-715, research R-721 to R-723)
# ---------------------------------------------------------------------------

from app import lifecycle  # noqa: E402
from app.tools.models import StartExperimentArgs  # noqa: E402


def protocol_of(sb):
    return sb.rows("protocols")[0]


def listed(*pairs):
    return [{"code": c, "sample_type": t} for c, t in pairs]


def test_shortfall_names_each_type_it_needs(sb):
    problem = lifecycle.sample_shortfall(protocol_of(sb), listed(("A17", "test")))
    assert problem["error"] == "SAMPLES_REQUIRED"
    assert problem["detail"]["needed"] == [
        {"sample_type": "test", "count": 2, "have": 1},
        {"sample_type": "control", "count": 1, "have": 0},
    ]
    assert "2 test samples and 1 control sample" in problem["message"]


def test_shortfall_is_none_when_composition_is_met(sb):
    assert lifecycle.sample_shortfall(
        protocol_of(sb), listed(("A17", "test"), ("A18", "TEST"), ("C1", "control"))
    ) is None


def test_the_largest_count_per_type_wins_not_the_sum(sb):
    steps = protocol_of(sb)["steps"]
    steps[3]["requirements"] = [*steps[3]["requirements"], {"type": "samples", "sample_type": "control", "count": 1}]
    assert lifecycle.sample_shortfall(
        protocol_of(sb), listed(("A17", "test"), ("A18", "test"), ("C1", "control"))
    ) is None


def test_every_sample_protocol_needs_at_least_one_sample():
    from tests.conftest import seeded_store

    legacy = seeded_store().rows("protocols")[0]  # temperature for every sample, no composition
    problem = lifecycle.sample_shortfall(legacy, [])
    assert problem["detail"] == {"needed": [], "any_sample": True}
    assert lifecycle.sample_shortfall(legacy, listed(("A1", "experimental"))) is None


def test_no_protocol_or_a_malformed_step_is_not_checked(sb):
    assert lifecycle.sample_shortfall(None, []) is None
    protocol = protocol_of(sb)
    protocol["steps"][0]["requirements"] = [{"type": "samples"}]  # malformed: skipped, reported elsewhere
    problem = lifecycle.sample_shortfall(protocol, [])
    assert problem is not None and problem["detail"]["needed"] == []  # other steps still count


def test_voice_create_asks_for_samples_before_reading_back(sb):
    before = (sb.count("experiments"), sb.count("events"))
    result = handlers.create_experiment(
        sb=sb, experiment=None, user_id=OWNER_ID, session_id="s",
        args=CreateExperimentArgs(name="Run", protocol_ref="STAB", test_samples=["A1"], confirmed=False),
    )
    assert result["error"] == "SAMPLES_REQUIRED"
    assert (sb.count("experiments"), sb.count("events")) == before


def test_voice_start_of_a_short_ready_run_is_refused(sb, experiment):
    experiment["status"] = "READY"
    sb.tables["samples"] = [s for s in sb.rows("samples") if s["sample_code"] != "CONTROL-01"]
    result = handlers.start_experiment(
        sb=sb, experiment=experiment, user_id=OWNER_ID,
        args=StartExperimentArgs(experiment_ref="STAB-104", confirmed=True), session_id="s",
    )
    assert result["error"] == "SAMPLES_REQUIRED"
    assert experiment["status"] == "READY"


def test_resuming_a_running_run_is_not_rechecked(sb, experiment):
    sb.tables["samples"] = []
    result = handlers.start_experiment(
        sb=sb, experiment=experiment, user_id=OWNER_ID,
        args=StartExperimentArgs(experiment_ref="STAB-104", confirmed=False), session_id="s",
    )
    assert result["success"] is True and result["data"]["already_running"] is True


def test_every_sample_requirement_with_no_samples_is_missing(sb, experiment):
    sb.tables["samples"] = []
    missing = missing_for(check(sb, experiment), INITIAL_TEMP)
    assert [(m["requirement_type"], m["sample_code"], m.get("no_samples")) for m in missing] == [
        ("measurement", None, True),
    ]
    assert "No samples are registered" in missing[0]["message"]


def test_missing_composition_cannot_be_overridden_at_the_gate(sb, experiment):
    sb.tables["samples"] = [s for s in sb.rows("samples") if s["sample_code"] != "CONTROL-01"]
    at(experiment, REGISTER)
    for flag in (False, True):
        result = advance(sb, experiment, confirmed_incomplete=flag)
        assert result["error"] == "SAMPLES_REQUIRED"
        assert "only be added when an experiment is created" in result["message"]
    assert experiment["current_step_index"] == REGISTER


def test_zero_sample_reading_step_keeps_its_override(sb, experiment):
    sb.tables["samples"] = []
    at(experiment, INITIAL_TEMP)
    result = advance(sb, experiment)
    assert result["error"] == "STEP_INCOMPLETE"
    assert "no samples are registered" in result["message"]
    assert advance(sb, experiment, confirmed_incomplete=True)["success"] is True


# ---------------------------------------------------------------------------
# .specify/bugs/observations-not-counted — "all samples", and late records
# ---------------------------------------------------------------------------

from app.tools import completeness as completeness_engine  # noqa: E402


def note(sb, experiment, text, **kwargs):
    return call(handlers.record_observation, sb, experiment, RecordObservationArgs(observation=text, **kwargs))


def finish(sb, experiment):
    return call(handlers.complete_experiment, sb, experiment, CompleteExperimentArgs(confirmed=True))


def test_all_samples_records_one_observation_per_sample(sb, experiment):
    at(experiment, INITIAL_APPEARANCE)
    result = note(sb, experiment, "clear and colourless", all_samples=True)

    assert result["success"] is True, result
    assert result["data"]["sample_codes"] == list(SAMPLES)
    assert len(result["data"]["observation_ids"]) == 3
    rows = sb.rows("observations")
    assert {r["protocol_step_index"] for r in rows} == {INITIAL_APPEARANCE}
    assert all(r["sample_id"] and r["observation"] == "clear and colourless" for r in rows)
    events = [e for e in sb.rows("events") if e["event_type"] == "OBSERVATION_CREATED"]
    assert len(events) == 3 and all(e["payload"]["all_samples"] for e in events)
    assert step_report(check(sb, experiment), INITIAL_APPEARANCE)["complete"] is True


def test_all_samples_with_one_sample_or_none_writes_nothing(sb, experiment):
    at(experiment, INITIAL_APPEARANCE)
    both = note(sb, experiment, "clear", all_samples=True, sample_code="A17")
    assert both["error"] == "INVALID_ARGS"
    for sample in sb.rows("samples"):
        sample["status"] = "withdrawn"
    none = note(sb, experiment, "clear", all_samples=True)
    assert none["error"] == "NO_SAMPLES"
    assert sb.rows("observations") == [] and sb.rows("events") == []


def test_a_whole_run_note_still_does_not_count_but_says_why(sb, experiment):
    # The user's report: "all samples are clear" stored with no sample.
    at(experiment, INITIAL_APPEARANCE)
    note(sb, experiment, "all samples are clear")

    missing = missing_for(check(sb, experiment), INITIAL_APPEARANCE)
    assert {m["sample_code"] for m in missing} == set(SAMPLES)
    assert all(m["run_level_observation"] and completeness_engine.RUN_LEVEL_NOTE in m["message"] for m in missing)
    gate = advance(sb, experiment)
    assert gate["error"] == "STEP_INCOMPLETE"
    assert completeness_engine.RUN_LEVEL_NOTE in gate["message"]


def test_a_step_passed_with_its_observations_missing_can_still_be_completed(sb, experiment, clock):
    # The reported run: a whole-run note at step 4, "complete anyway", then the
    # end of the run refuses to complete. Before this fix nothing could unblock it.
    at(experiment, INITIAL_APPEARANCE)
    note(sb, experiment, "all samples are clear")
    assert advance(sb, experiment, confirmed_incomplete=True)["success"] is True
    everything_but(sb, experiment, clock, skip=(INITIAL_APPEARANCE,))
    at(experiment, COMPLETE)

    blocked = finish(sb, experiment)
    assert blocked["error"] == "INCOMPLETE"
    assert {m["step_index"] for m in blocked["detail"]["missing"]} == {INITIAL_APPEARANCE}

    late = note(sb, experiment, "all samples are clear", all_samples=True, step_number=INITIAL_APPEARANCE + 1)
    assert late["success"] is True, late
    assert late["data"]["late"] is True and late["data"]["protocol_step"]["index"] == INITIAL_APPEARANCE
    at_step_4 = [r for r in sb.rows("observations") if r["protocol_step_index"] == INITIAL_APPEARANCE]
    assert sorted(bool(r["sample_id"]) for r in at_step_4) == [False, True, True, True]  # the note, then one per sample
    late_events = [e for e in sb.rows("events") if e["event_type"] == "OBSERVATION_CREATED" and e["payload"].get("late")]
    assert len(late_events) == 3
    assert experiment["current_step_index"] == COMPLETE  # the run did not move back

    assert finish(sb, experiment)["success"] is True
    assert experiment["status"] == "COMPLETED"


def test_a_late_reading_is_judged_by_its_own_step(sb, experiment):
    at(experiment, FINAL_PH)
    result = call(
        handlers.record_measurement, sb, experiment,
        RecordMeasurementArgs(sample_code="A17", measurement_type="temperature", value=9.0, unit="degrees", step_number=2),
    )
    assert result["success"] is True, result
    assert result["data"]["unit"] == "C" and result["data"]["late"] is True
    assert result["warning"]["type"] == "OUT_OF_RANGE"  # INITIAL_TEMP expects 2 to 8 C
    assert sb.rows("measurements")[0]["protocol_step_index"] == INITIAL_TEMP
    assert deviations(sb)[0]["protocol_step_index"] == INITIAL_TEMP
    created = next(e for e in sb.rows("events") if e["event_type"] == "MEASUREMENT_CREATED")
    assert created["payload"]["late"] is True and created["payload"]["step_index"] == INITIAL_TEMP


def test_a_step_not_reached_or_not_there_is_refused(sb, experiment):
    at(experiment, INITIAL_TEMP)
    ahead = note(sb, experiment, "clear", sample_code="A17", step_number=INITIAL_APPEARANCE + 1)
    assert ahead["error"] == "STEP_NOT_REACHED"
    beyond = call(
        handlers.record_measurement, sb, experiment,
        RecordMeasurementArgs(sample_code="A17", measurement_type="temperature", value=4.2, step_number=99),
    )
    assert beyond["error"] == "STEP_NOT_FOUND"
    assert sb.rows("observations") == [] and sb.rows("measurements") == []
    with pytest.raises(ValidationError):
        RecordObservationArgs(observation="clear", step_number=0)


def test_the_current_step_is_not_late(sb, experiment):
    at(experiment, INITIAL_APPEARANCE)
    result = note(sb, experiment, "clear", sample_code="A17", step_number=INITIAL_APPEARANCE + 1)
    assert result["success"] is True and "late" not in result["data"]
    assert "late" not in sb.rows("events")[0]["payload"]
