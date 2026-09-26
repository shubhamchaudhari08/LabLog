"""T040, T060, T062, T066, T073, T075, T077, T080, T083, T087, T089 â€” handler behaviour.

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
    WriteProtocolStepArgs,
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
# T040 â€” get_active_experiment
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
# T060 â€” record_measurement, happy path
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
    # CONTROL-01 â€” what was actually written.
    result = record(sb, experiment, sample_code="control one")
    assert result["success"] is True
    assert result["data"]["sample_code"] == "CONTROL-01"


def test_unit_resolves_from_the_protocol_step_default(sb, experiment):
    # Step 1 declares default_unit {"temperature": "C"}.
    result = record(sb, experiment, unit=None)
    assert result["success"] is True
    assert result["data"]["unit"] == "C"


# ---------------------------------------------------------------------------
# T062 â€” timestamps are server-generated
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
# T066 â€” rejections. Each asserts NO ROW WAS WRITTEN.
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
# T073, T075 â€” corrections supersede, never delete
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
# T077 â€” observations are not measurements
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
# T080 â€” protocol grounding
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
# T083 â€” deviations
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
# T087, T089 â€” the completion gate
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


# ---------------------------------------------------------------------------
# write_protocol_step - the protocol dictated during the run
# ---------------------------------------------------------------------------


def test_add_step_refuses_to_edit_a_shared_protocol(sb, experiment):
    """The seeded STAB protocol is a library protocol; appending to it would
    rewrite the next step for every other run that references it."""
    before = list(sb.rows("protocols")[0]["steps"])

    result = call(
        handlers.write_protocol_step, sb, experiment, WriteProtocolStepArgs(name="Vortex for 30 s")
    )

    assert result["success"] is False
    assert result["error"] == "PROTOCOL_SHARED"
    assert sb.rows("protocols")[0]["steps"] == before
    assert sb.count("protocols") == 1


def test_new_protocol_starts_a_draft_and_records_dictated_steps(sb, experiment):
    experiment.update({"status": "DRAFT", "started_at": None, "protocol_id": None})
    sb.table("experiments").update(
        {"status": "DRAFT", "started_at": None, "protocol_id": None}
    ).eq("id", experiment["id"]).execute()

    # "Create a new protocol and start the current experiment" - no step yet.
    opened = call(handlers.write_protocol_step, sb, experiment, WriteProtocolStepArgs(new_protocol=True))
    assert opened["success"] is True
    assert opened["data"]["experiment_started"] is True
    assert opened["data"]["step"] is None
    assert experiment["status"] == "RUNNING"
    assert experiment["started_at"]

    # Nothing to read out, and nothing invented.
    nxt = call(handlers.get_next_protocol_step, sb, experiment, NoArgs())
    assert nxt["data"]["is_final"] is False
    assert "first step" in nxt["data"]["message"]

    first = call(
        handlers.write_protocol_step,
        sb,
        experiment,
        WriteProtocolStepArgs(name="Record initial temperature", required_fields=["temperature"]),
    )
    second = call(
        handlers.write_protocol_step, sb, experiment, WriteProtocolStepArgs(name="Incubate at 37 C")
    )

    steps = sb.rows("protocols")[-1]["steps"]
    assert [s["name"] for s in steps] == ["Record initial temperature", "Incubate at 37 C"]
    assert [s["index"] for s in steps] == [0, 1]
    assert first["data"]["step"]["required_fields"] == ["temperature"]
    # Dictating a step means you are now on it.
    assert second["data"]["step_index"] == 1
    assert experiment["current_step_index"] == 1

    # A measurement against the live-authored step records normally.
    assert record(sb, experiment)["success"] is True
    assert {e["event_type"] for e in sb.rows("events")} >= {
        "PROTOCOL_STEP_ADDED",
        "MEASUREMENT_CREATED",
    }


def test_add_step_refused_on_a_completed_experiment(sb, experiment):
    experiment["status"] = "COMPLETED"
    result = call(handlers.write_protocol_step, sb, experiment, WriteProtocolStepArgs(name="Too late"))
    assert result["error"] == "EXPERIMENT_CLOSED"
    assert sb.count("protocols") == 1



def test_step_can_be_reworded_and_rescoped_without_moving_the_user(sb, experiment):
    experiment["protocol_id"] = None
    call(handlers.write_protocol_step, sb, experiment, WriteProtocolStepArgs(name="Step one"))
    call(handlers.write_protocol_step, sb, experiment, WriteProtocolStepArgs(name="Step two"))

    result = call(
        handlers.write_protocol_step,
        sb,
        experiment,
        WriteProtocolStepArgs(
            step_index=0, name="Record initial temperature", required_fields=["temperature"]
        ),
    )

    assert result["data"]["action"] == "updated"
    steps = sb.rows("protocols")[-1]["steps"]
    assert steps[0]["name"] == "Record initial temperature"
    assert steps[0]["required_fields"] == ["temperature"]
    assert [s["name"] for s in steps] == ["Record initial temperature", "Step two"]
    # Rewording step 1 must not drag the user back off step 2.
    assert experiment["current_step_index"] == 1
    assert sb.rows("events")[-1]["event_type"] == "PROTOCOL_STEP_UPDATED"


def test_step_can_be_removed_and_the_rest_renumbered(sb, experiment):
    experiment["protocol_id"] = None
    for name in ("Step one", "Step two", "Step three"):
        call(handlers.write_protocol_step, sb, experiment, WriteProtocolStepArgs(name=name))

    result = call(
        handlers.write_protocol_step, sb, experiment, WriteProtocolStepArgs(step_index=1, remove=True)
    )

    assert result["data"]["action"] == "removed"
    steps = sb.rows("protocols")[-1]["steps"]
    assert [s["name"] for s in steps] == ["Step one", "Step three"]
    assert [s["index"] for s in steps] == [0, 1]
    assert experiment["current_step_index"] == 1
    assert sb.rows("events")[-1]["event_type"] == "PROTOCOL_STEP_REMOVED"


def test_step_with_data_recorded_against_it_cannot_be_removed(sb, experiment):
    experiment["protocol_id"] = None
    call(
        handlers.write_protocol_step,
        sb,
        experiment,
        WriteProtocolStepArgs(name="Record initial temperature"),
    )
    record(sb, experiment)

    result = call(
        handlers.write_protocol_step, sb, experiment, WriteProtocolStepArgs(step_index=0, remove=True)
    )

    # Renumbering would re-attribute a stored measurement to another step.
    assert result["error"] == "PROTOCOL_STEP_IN_USE"
    assert len(sb.rows("protocols")[-1]["steps"]) == 1
    # Rewording the same step is still allowed: the index does not move.
    reword = call(
        handlers.write_protocol_step,
        sb,
        experiment,
        WriteProtocolStepArgs(step_index=0, name="Record temperature at t0"),
    )
    assert reword["success"] is True


def test_starting_over_opens_a_new_protocol_and_keeps_the_discarded_one(sb, experiment):
    experiment["protocol_id"] = None
    call(handlers.write_protocol_step, sb, experiment, WriteProtocolStepArgs(name="Wrong step"))
    discarded = experiment["protocol_id"]

    result = call(
        handlers.write_protocol_step, sb, experiment, WriteProtocolStepArgs(new_protocol=True)
    )

    assert result["data"]["protocol_created"] is True
    assert experiment["protocol_id"] != discarded
    assert experiment["current_step_index"] == 0
    assert handlers._protocol(sb, experiment)["steps"] == []
    # The abandoned draft is still on disk, with its step intact.
    old = next(p for p in sb.rows("protocols") if p["id"] == discarded)
    assert [s["name"] for s in old["steps"]] == ["Wrong step"]


def test_unknown_step_index_is_rejected(sb, experiment):
    experiment["protocol_id"] = None
    call(handlers.write_protocol_step, sb, experiment, WriteProtocolStepArgs(name="Only step"))
    result = call(
        handlers.write_protocol_step, sb, experiment, WriteProtocolStepArgs(step_index=4, name="Nope")
    )
    assert result["error"] == "STEP_NOT_FOUND"
    assert len(sb.rows("protocols")[-1]["steps"]) == 1
