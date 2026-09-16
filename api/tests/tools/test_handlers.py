"""T040, T060, T062, T066, T073, T075, T077, T080, T083, T087, T089 — handler behaviour.

The organising rule of this file, from the Constitution's Development Workflow
section:

    "For every rejected operation, tests MUST assert not only the returned
     error but also that no row was written. A handler that validates after
     writing satisfies every response assertion while corrupting the database."

So every rejection test below checks the row count too.
"""

from __future__ import annotations

import math

import pytest

from app.tools import handlers
from app.tools.models import (
    CompleteExperimentArgs,
    CompleteProtocolStepArgs,
    CorrectMeasurementArgs,
    CreateDeviationArgs,
    GetSampleHistoryArgs,
    NoArgs,
    RecordMeasurementArgs,
    RecordObservationArgs,
)
from tests.conftest import OWNER_ID


def call(handler, sb, experiment, args, session_id="sess-test"):
    return handler(sb=sb, experiment=experiment, user_id=OWNER_ID, args=args, session_id=session_id)


def record(sb, experiment, **kwargs):
    payload = {"sample_code": "A17", "measurement_type": "temperature", "value": 4.2, "unit": "C"}
    payload.update(kwargs)
    return call(handlers.record_measurement, sb, experiment, RecordMeasurementArgs(**payload))


# ---------------------------------------------------------------------------
# T040 — get_active_experiment
# ---------------------------------------------------------------------------
def test_get_active_experiment_returns_context(sb, experiment):
    result = call(handlers.get_active_experiment, sb, experiment, NoArgs())
    assert result["success"] is True
    data = result["data"]
    assert data["experiment_code"] == "STAB-104"
    assert data["status"] == "RUNNING"
    assert data["protocol"]["step_count"] == 6
    assert data["current_step"]["id"] == "initial_temp"
    assert [s["code"] for s in data["samples"]] == ["A17", "A18", "CONTROL-01"]


# ---------------------------------------------------------------------------
# T060 — record_measurement, happy path
# ---------------------------------------------------------------------------
def test_record_measurement_writes_row_and_event(sb, experiment):
    result = record(sb, experiment, raw_spoken_value="A seventeen is four point two Celsius")
    assert result["success"] is True

    assert sb.count("measurements") == 1
    row = sb.rows("measurements")[0]
    assert float(row["value"]) == 4.2
    assert row["unit"] == "C"
    assert row["measurement_type"] == "temperature"
    assert row["raw_spoken_value"] == "A seventeen is four point two Celsius"
    assert row["protocol_step_index"] == 1  # stamped from the experiment
    assert row["superseded_by"] is None
    assert row["created_by"] == OWNER_ID

    assert sb.count("events") == 1
    event = sb.rows("events")[0]
    assert event["event_type"] == "MEASUREMENT_CREATED"
    assert event["voice_session_id"] == "sess-test"


def test_response_echoes_stored_values_not_requested_ones(sb, experiment):
    # The agent's spoken confirmation is generated from this response. If
    # normalisation changed "control one" to CONTROL-01, the user must hear
    # CONTROL-01 — what was actually written.
    result = record(sb, experiment, sample_code="control one")
    assert result["success"] is True
    assert result["data"]["sample_code"] == "CONTROL-01"


def test_unit_resolves_from_the_protocol_step_default(sb, experiment):
    # Step 1 declares default_unit {"temperature": "C"}.
    result = record(sb, experiment, unit=None)
    assert result["success"] is True
    assert result["data"]["unit"] == "C"


# ---------------------------------------------------------------------------
# T062 — timestamps are server-generated
# ---------------------------------------------------------------------------
def test_caller_cannot_supply_a_timestamp(sb, experiment):
    # Structural: the model forbids unknown keys, so there is nowhere to put a
    # time. This is FR-006 enforced by the type system rather than by a check.
    with pytest.raises(Exception):
        RecordMeasurementArgs(
            sample_code="A17", measurement_type="temperature", value=4.2, recorded_at="2020-01-01"
        )


def test_recorded_at_is_present_and_server_side(sb, experiment):
    record(sb, experiment)
    assert sb.rows("measurements")[0]["recorded_at"]


# ---------------------------------------------------------------------------
# T066 — rejections. Each asserts NO ROW WAS WRITTEN.
# ---------------------------------------------------------------------------
def test_unknown_sample_rejected_with_valid_codes(sb, experiment):
    result = record(sb, experiment, sample_code="A99")
    assert result["success"] is False
    assert result["error"] == "SAMPLE_NOT_FOUND"
    assert result["detail"]["valid_samples"] == ["A17", "A18", "CONTROL-01"]
    assert sb.count("measurements") == 0
    assert sb.count("events") == 0


def test_ph_needs_no_unit(sb, experiment):
    result = record(sb, experiment, measurement_type="pH", value=7.4, unit=None)
    assert result["success"] is True and result["data"]["unit"] == "pH"


def test_missing_unit_with_no_protocol_default_is_rejected(sb, experiment):
    result = record(sb, experiment, measurement_type="mass", unit=None)
    assert result["success"] is False
    assert result["error"] == "UNIT_REQUIRED"
    assert sb.count("measurements") == 0


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf")])
def test_non_finite_values_are_rejected(sb, experiment, bad):
    # Pydantic accepts float('nan') as a valid float and Postgres numeric
    # accepts 'NaN'. A NaN measurement stores, displays, and silently breaks
    # every aggregate downstream (data-model.md V4).
    result = record(sb, experiment, value=bad)
    assert result["success"] is False
    assert result["error"] == "INVALID_VALUE"
    assert sb.count("measurements") == 0


def test_ambiguous_sample_asks_rather_than_guessing(sb, experiment):
    sb.rows("samples").append(
        {"id": "9", "experiment_id": experiment["id"], "sample_code": "A-17", "status": "active"}
    )
    result = record(sb, experiment, sample_code="a 1 7")
    assert result["success"] is False
    assert result["error"] == "SAMPLE_AMBIGUOUS"
    assert set(result["detail"]["candidates"]) == {"A17", "A-17"}
    assert sb.count("measurements") == 0


# ---------------------------------------------------------------------------
# T073, T075 — corrections supersede, never delete
# ---------------------------------------------------------------------------
def test_correction_supersedes_and_preserves_history(sb, experiment):
    record(sb, experiment, value=4.2)
    result = call(
        handlers.correct_measurement,
        sb,
        experiment,
        CorrectMeasurementArgs(sample_code="A17", measurement_type="temperature", new_value=4.3),
    )
    assert result["success"] is True
    assert result["data"]["previous_value"] == 4.2
    assert result["data"]["new_value"] == 4.3

    rows = sb.rows("measurements")
    assert len(rows) == 2, "correction must add a row, never overwrite one"

    original = next(r for r in rows if float(r["value"]) == 4.2)
    corrected = next(r for r in rows if float(r["value"]) == 4.3)
    assert original["superseded_by"] == corrected["id"]
    assert corrected["superseded_by"] is None
    assert corrected["correction_reason"]

    assert [e["event_type"] for e in sb.rows("events")] == [
        "MEASUREMENT_CREATED",
        "MEASUREMENT_CORRECTED",
    ]


def test_correction_without_a_prior_measurement_creates_nothing(sb, experiment):
    result = call(
        handlers.correct_measurement,
        sb,
        experiment,
        CorrectMeasurementArgs(sample_code="A17", measurement_type="temperature", new_value=4.3),
    )
    assert result["success"] is False
    assert result["error"] == "MEASUREMENT_NOT_FOUND"
    assert sb.count("measurements") == 0


def test_only_one_live_row_after_repeated_corrections(sb, experiment):
    record(sb, experiment, value=4.0)
    for value in (4.1, 4.2, 4.3):
        call(
            handlers.correct_measurement,
            sb,
            experiment,
            CorrectMeasurementArgs(
                sample_code="A17", measurement_type="temperature", new_value=value
            ),
        )
    live = [r for r in sb.rows("measurements") if r["superseded_by"] is None]
    assert len(live) == 1
    assert float(live[0]["value"]) == 4.3
    assert len(sb.rows("measurements")) == 4  # nothing was ever destroyed


# ---------------------------------------------------------------------------
# T077 — observations are not measurements
# ---------------------------------------------------------------------------
def test_observation_creates_no_measurement(sb, experiment):
    result = call(
        handlers.record_observation,
        sb,
        experiment,
        RecordObservationArgs(observation="A18 looks slightly cloudy", sample_code="A18"),
    )
    assert result["success"] is True
    assert sb.count("observations") == 1
    assert sb.count("measurements") == 0
    assert sb.rows("events")[0]["event_type"] == "OBSERVATION_CREATED"


def test_blank_observation_is_rejected(sb, experiment):
    result = call(
        handlers.record_observation, sb, experiment, RecordObservationArgs(observation="   ")
    )
    assert result["success"] is False
    assert result["error"] == "INVALID_ARGS"
    assert sb.count("observations") == 0


# ---------------------------------------------------------------------------
# T080 — protocol grounding
# ---------------------------------------------------------------------------
def test_next_step_comes_from_stored_data(sb, experiment):
    result = call(handlers.get_next_protocol_step, sb, experiment, NoArgs())
    assert result["success"] is True
    # Experiment sits at index 1; "next" is the step after the current one.
    assert result["data"]["step_index"] == 2
    assert result["data"]["id"] == "prep_complete"
    assert result["data"]["is_final"] is False


def test_past_the_last_step_is_final_not_an_error(sb, experiment):
    experiment["current_step_index"] = 5
    result = call(handlers.get_next_protocol_step, sb, experiment, NoArgs())
    assert result["success"] is True
    assert result["data"]["is_final"] is True


def test_step_index_is_clamped_not_overrun(sb, experiment):
    experiment["current_step_index"] = 5
    result = call(
        handlers.complete_protocol_step, sb, experiment, CompleteProtocolStepArgs()
    )
    assert result["success"] is True
    assert sb.rows("experiments")[0]["current_step_index"] == 5
    assert result["data"]["is_final"] is True


def test_completing_a_step_advances_by_one(sb, experiment):
    call(handlers.complete_protocol_step, sb, experiment, CompleteProtocolStepArgs())
    assert sb.rows("experiments")[0]["current_step_index"] == 2
    assert sb.rows("events")[0]["event_type"] == "PROTOCOL_STEP_COMPLETED"


# ---------------------------------------------------------------------------
# T083 — deviations
# ---------------------------------------------------------------------------
def test_deviation_defaults(sb, experiment):
    result = call(
        handlers.create_deviation,
        sb,
        experiment,
        CreateDeviationArgs(description="Preparation delayed forty minutes", type="timing"),
    )
    assert result["success"] is True
    row = sb.rows("deviations")[0]
    assert row["severity"] == "medium"
    assert row["status"] == "open"
    assert row["type"] == "timing"
    assert sb.rows("events")[0]["event_type"] == "DEVIATION_CREATED"


# ---------------------------------------------------------------------------
# T087, T089 — the completion gate
# ---------------------------------------------------------------------------
def test_completeness_lists_what_is_missing_per_sample(sb, experiment):
    record(sb, experiment, sample_code="A17")
    result = call(handlers.check_experiment_completeness, sb, experiment, NoArgs())
    assert result["data"]["complete"] is False
    missing = result["data"]["missing"]
    step1 = next(m for m in missing if m["step_index"] == 1)
    assert set(step1["samples"]) == {"A18", "CONTROL-01"}


def test_complete_requires_explicit_confirmation(sb, experiment):
    result = call(
        handlers.complete_experiment, sb, experiment, CompleteExperimentArgs(confirmed=False)
    )
    assert result["error"] == "NEEDS_CONFIRMATION"
    assert sb.rows("experiments")[0]["status"] == "RUNNING"


def test_complete_refuses_while_data_is_missing(sb, experiment):
    result = call(
        handlers.complete_experiment, sb, experiment, CompleteExperimentArgs(confirmed=True)
    )
    assert result["error"] == "INCOMPLETE"
    assert result["detail"]["missing"]
    assert sb.rows("experiments")[0]["status"] == "RUNNING"


def test_completeness_is_rechecked_inside_the_handler(sb, experiment):
    # The model could otherwise call complete_experiment directly and skip the
    # check. A gate the caller can skip is not a gate.
    for code in ("A17", "A18", "CONTROL-01"):
        record(sb, experiment, sample_code=code)
    experiment["current_step_index"] = 3
    for code in ("A17", "A18", "CONTROL-01"):
        record(sb, experiment, sample_code=code)

    result = call(
        handlers.complete_experiment, sb, experiment, CompleteExperimentArgs(confirmed=True)
    )
    assert result["success"] is True
    assert sb.rows("experiments")[0]["status"] == "COMPLETED"
    assert sb.rows("experiments")[0]["completed_at"]
    summary = result["data"]["summary"]
    assert summary["measurement_count"] == 6
    assert summary["samples_measured"] == 3


# ---------------------------------------------------------------------------
# Cross-cutting: the audit invariant (SC-008)
# ---------------------------------------------------------------------------
def test_every_data_row_has_an_event(sb, experiment):
    record(sb, experiment, sample_code="A17")
    call(
        handlers.record_observation,
        sb,
        experiment,
        RecordObservationArgs(observation="looks fine", sample_code="A18"),
    )
    call(
        handlers.create_deviation, sb, experiment, CreateDeviationArgs(description="delayed")
    )
    call(
        handlers.correct_measurement,
        sb,
        experiment,
        CorrectMeasurementArgs(sample_code="A17", measurement_type="temperature", new_value=4.9),
    )

    event_entity_ids = {e["entity_id"] for e in sb.rows("events")}
    for table in ("measurements", "observations", "deviations"):
        for row in sb.rows(table):
            if row.get("superseded_by") is not None:
                continue  # superseded rows are covered by their CREATED event
            assert row["id"] in event_entity_ids, f"{table} row {row['id']} has no event"


def test_sample_history_returns_current_values_only(sb, experiment):
    record(sb, experiment, value=4.2)
    call(
        handlers.correct_measurement,
        sb,
        experiment,
        CorrectMeasurementArgs(sample_code="A17", measurement_type="temperature", new_value=4.3),
    )
    result = call(
        handlers.get_sample_history, sb, experiment, GetSampleHistoryArgs(sample_code="A17")
    )
    values = [m["value"] for m in result["data"]["measurements"]]
    assert values == [4.3]
