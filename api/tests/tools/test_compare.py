"""get_sample_history(compare_previous): backend arithmetic, never the model's (specs/006 US2).

Contract: specs/006-experiment-search-compare/contracts/tools-search-compare.md §3.
The comparison writes nothing, so every case checks the row counts after setup.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.tools import handlers
from app.tools.models import CorrectMeasurementArgs, GetSampleHistoryArgs, RecordMeasurementArgs
from tests.conftest import OTHER_USER_ID, OWNER_ID, PROTOCOL_ID, seed_history, seeded_store

TABLES = ("experiments", "samples", "measurements", "deviations", "events")


def snapshot(sb):
    return tuple(sb.count(t) for t in TABLES)


@pytest.fixture
def sb():
    return seed_history(seeded_store())


@pytest.fixture
def experiment(sb):
    return next(e for e in sb.rows("experiments") if e["experiment_code"] == "STAB-104")


_clock = [datetime.now(timezone.utc) + timedelta(minutes=1)]


def record(sb, experiment, code="A17", value=4.3, type_="temperature", unit="C"):
    res = handlers.record_measurement(
        sb=sb, experiment=experiment, user_id=OWNER_ID, session_id="s",
        args=RecordMeasurementArgs(sample_code=code, measurement_type=type_, value=value, unit=unit),
    )
    assert res["success"], res
    # Strictly increasing times, so "latest" never depends on clock resolution.
    _clock[0] += timedelta(seconds=1)
    sb.rows("measurements")[-1]["recorded_at"] = _clock[0].isoformat()
    return res


def compare(sb, experiment, code="A17", **kwargs):
    before = snapshot(sb)
    res = handlers.get_sample_history(
        sb=sb, experiment=experiment, user_id=OWNER_ID, session_id="s",
        args=GetSampleHistoryArgs(sample_code=code, compare_previous=True, **kwargs),
    )
    assert snapshot(sb) == before
    return res


def comparison(res):
    assert res["success"], res
    return res["data"]["comparison"]


def add_run(sb, code, *, completed_ago, owner=OWNER_ID, protocol_id=PROTOCOL_ID, a17=5.0):
    done = datetime.now(timezone.utc) - completed_ago
    exp_id = f"x-{code}"
    sb.tables["experiments"].append({
        "id": exp_id, "experiment_code": code, "name": code, "protocol_id": protocol_id, "owner_id": owner,
        "status": "COMPLETED", "started_at": (done - timedelta(hours=1)).isoformat(), "completed_at": done.isoformat(),
    })
    sb.tables["samples"].append({"id": f"{exp_id}-A17", "experiment_id": exp_id, "sample_code": "A17"})
    sb.tables["measurements"].append({
        "id": f"{exp_id}-m", "experiment_id": exp_id, "sample_id": f"{exp_id}-A17", "measurement_type": "temperature",
        "value": a17, "unit": "C", "protocol_step_index": 1, "superseded_by": None,
        "recorded_at": (done - timedelta(minutes=30)).isoformat(),
    })


# -- the exact result ---------------------------------------------------------


def test_exact_result_against_the_same_step(sb, experiment):
    record(sb, experiment, value=4.3)
    c = comparison(compare(sb, experiment))
    spoken = c.pop("spoken")
    assert c == {
        "sample_code": "A17", "measurement_type": "temperature", "unit": "C",
        "current": 4.3, "current_step": {"index": 1, "name": "Record initial temperature"},
        "previous": 4.4, "previous_step": {"index": 1, "name": "Record initial temperature"},
        "same_step": True, "prev_experiment_code": "STAB-102",
        "delta": -0.1, "magnitude": 0.1, "direction": "lower", "pct": -2.3,
    }
    assert spoken == "In STAB-102, A17 was 4.4 C at this step. Today's 4.3 C is 0.1 C lower, 2.3 percent lower."


def test_a_later_step_compares_with_that_step(sb, experiment):
    experiment["current_step_index"] = 3
    record(sb, experiment, value=4.9)
    c = comparison(compare(sb, experiment))
    assert (c["previous"], c["delta"], c["direction"], c["pct"], c["same_step"]) == (4.6, 0.3, "higher", 6.5, True)


def test_no_same_step_value_uses_the_previous_runs_latest(sb, experiment):
    experiment["current_step_index"] = 2
    record(sb, experiment, value=4.3)
    c = comparison(compare(sb, experiment))
    assert (c["previous"], c["same_step"], c["previous_step"]["index"]) == (4.6, False, 3)
    assert "at step 4, Record second temperature" in c["spoken"]


# -- corrections --------------------------------------------------------------


def test_a_corrected_previous_value_uses_the_correction(sb, experiment):
    old = next(m for m in sb.rows("measurements") if m["id"] == "hist-2-A17-s1")
    sb.tables["measurements"].append({**old, "id": "hist-2-A17-s1b", "value": 4.5,
                                      "recorded_at": (datetime.fromisoformat(old["recorded_at"])
                                                      + timedelta(minutes=5)).isoformat()})
    old["superseded_by"] = "hist-2-A17-s1b"
    record(sb, experiment, value=4.3)
    assert comparison(compare(sb, experiment))["previous"] == 4.5


def test_a_corrected_current_value_uses_the_correction(sb, experiment):
    record(sb, experiment, value=4.3)
    res = handlers.correct_measurement(
        sb=sb, experiment=experiment, user_id=OWNER_ID, session_id="s",
        args=CorrectMeasurementArgs(sample_code="A17", measurement_type="temperature", new_value=4.5),
    )
    assert res["success"], res
    c = comparison(compare(sb, experiment))
    assert (c["current"], c["delta"], c["direction"]) == (4.5, 0.1, "higher")


# -- defaults -----------------------------------------------------------------


def test_omitted_type_uses_the_samples_latest_measurement(sb, experiment):
    record(sb, experiment, value=4.3)
    record(sb, experiment, type_="pH", value=7.0, unit=None)
    res = compare(sb, experiment)
    assert res["error"] == "NO_CORRESPONDING_MEASUREMENT"
    assert res["detail"]["which"] == "previous" and res["detail"]["measurement_type"] == "pH"
    assert comparison(compare(sb, experiment, measurement_type="temperature"))["previous"] == 4.4


# -- refusals -----------------------------------------------------------------


def test_unknown_sample(sb, experiment):
    assert compare(sb, experiment, code="Z99")["error"] == "SAMPLE_NOT_FOUND"


def test_nothing_recorded_in_this_run(sb, experiment):
    res = compare(sb, experiment)
    assert res["error"] == "NO_CORRESPONDING_MEASUREMENT"
    assert res["detail"] == {"which": "current", "sample_code": "A17", "measurement_type": None}


def test_no_previous_run():
    sb = seeded_store()
    experiment = sb.rows("experiments")[0]
    record(sb, experiment)
    res = compare(sb, experiment)
    assert res["error"] == "NO_PREVIOUS_RUN" and res["detail"] == {"protocol_code": "STAB"}


def test_no_protocol_means_no_previous_run(sb, experiment):
    record(sb, experiment)
    experiment["protocol_id"] = None
    assert compare(sb, experiment)["error"] == "NO_PREVIOUS_RUN"


def test_sample_missing_from_the_previous_run(sb, experiment):
    sb.tables["samples"] = [s for s in sb.rows("samples") if s["id"] != "hist-2-A18"]
    record(sb, experiment, code="A18", value=4.2)
    res = compare(sb, experiment, code="A18")
    assert res["error"] == "NO_CORRESPONDING_MEASUREMENT"
    assert res["detail"] == {"which": "previous", "sample_code": "A18", "measurement_type": "temperature",
                             "prev_experiment_code": "STAB-102"}


def test_unit_mismatch_is_refused_not_converted(sb, experiment):
    record(sb, experiment, value=39.7, unit="F")
    res = compare(sb, experiment)
    assert res["error"] == "UNIT_MISMATCH"
    assert res["detail"] == {"current_unit": "F", "previous_unit": "C", "prev_experiment_code": "STAB-102"}


# -- arithmetic edges ---------------------------------------------------------


def test_zero_previous_leaves_pct_undefined(sb, experiment):
    next(m for m in sb.rows("measurements") if m["id"] == "hist-2-A17-s1")["value"] = 0.0
    record(sb, experiment, value=4.3)
    c = comparison(compare(sb, experiment))
    assert (c["pct"], c["delta"], c["direction"]) == (None, 4.3, "higher")
    assert c["spoken"].endswith("; the percent change is undefined because the previous value was zero.")


def test_the_same_value(sb, experiment):
    record(sb, experiment, value=4.4)
    c = comparison(compare(sb, experiment))
    assert (c["delta"], c["magnitude"], c["direction"], c["pct"]) == (0.0, 0.0, "same", 0.0)
    assert c["spoken"] == "In STAB-102, A17 was 4.4 C at this step, the same as today."


def test_delta_keeps_the_finer_precision(sb, experiment):
    record(sb, experiment, value=4.35)
    c = comparison(compare(sb, experiment))
    assert (c["delta"], c["magnitude"], c["pct"]) == (-0.05, 0.05, -1.1)
    assert "0.05 C lower" in c["spoken"]


# -- which run is "previous" --------------------------------------------------


def test_other_users_and_other_protocols_are_ignored(sb, experiment):
    add_run(sb, "THEIRS-9", completed_ago=timedelta(hours=1), owner=OTHER_USER_ID)
    add_run(sb, "OTHER-9", completed_ago=timedelta(hours=1), protocol_id="another-protocol")
    record(sb, experiment)
    assert comparison(compare(sb, experiment))["prev_experiment_code"] == "STAB-102"


def test_latest_completion_wins_not_the_code(sb, experiment):
    add_run(sb, "STAB-099", completed_ago=timedelta(hours=1), a17=5.0)
    record(sb, experiment, value=4.3)
    c = comparison(compare(sb, experiment))
    assert (c["prev_experiment_code"], c["previous"], c["direction"]) == ("STAB-099", 5.0, "lower")


# -- PROTECTED: plain history is unchanged ------------------------------------


def test_without_compare_the_result_is_todays(sb, experiment):
    record(sb, experiment)
    plain = handlers.get_sample_history(sb=sb, experiment=experiment, user_id=OWNER_ID,
                                        args=GetSampleHistoryArgs(sample_code="A17"))
    typed = handlers.get_sample_history(sb=sb, experiment=experiment, user_id=OWNER_ID,
                                        args=GetSampleHistoryArgs(sample_code="A17", measurement_type="pH"))
    assert plain == typed and "comparison" not in plain["data"]
