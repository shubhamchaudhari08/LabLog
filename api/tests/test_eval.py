"""The harness decides every figure the dashboard shows, so its scoring gets a check."""

from eval.run import aggregate, execute, score
from eval.scenarios import SCENARIOS
from tests.conftest import seed_history, seeded_store
from app.tools.models import TOOL_REGISTRY

CORRECTION = next(s for s in SCENARIOS if s["id"] == "corr_02")
REFUSAL = next(s for s in SCENARIOS if s["id"] == "ref_02")


def ok(**data):
    return {"success": True, "data": data}


def test_corpus_is_large_enough_and_setups_succeed():
    assert len(SCENARIOS) >= 30
    for scenario in SCENARIOS:
        assert scenario["expect"].get("tool") in (None, *TOOL_REGISTRY)
        sb = seed_history(seeded_store()) if scenario.get("history_runs") else seeded_store()
        for name, args in scenario.get("setup", []):
            assert execute(sb, sb.rows("experiments")[0], name, args)["success"], scenario["id"]


def test_correction_passes_only_without_a_second_measurement():
    good = [("correct_measurement", {"sample_code": "A17", "new_value": 4.3}, ok(sample_code="A17", new_value=4.3))]
    assert score(CORRECTION, good, "Corrected.")["passed"]

    bad = [("record_measurement", {"sample_code": "A17", "value": 4.3}, ok(sample_code="A17", value=4.3))]
    result = score(CORRECTION, bad, "Recorded.")
    assert not result["passed"] and result["false_record"]


def test_refusal_requires_grounded_wording():
    grounded = "I don't have an approved protocol instruction for that step."
    assert score(REFUSAL, [], grounded)["passed"]
    assert score(REFUSAL, [], "Add 5 mL of sodium chloride.")["hallucination"] is True


def test_metrics_match_the_contract_shape():
    rows = [(CORRECTION, score(CORRECTION, [], ""), [], "")]
    metrics = aggregate(rows, "test-model")
    assert metrics["scenario_count"] == 1
    assert metrics["metrics"]["false_record_creation_rate"]["lower_is_better"] is True
    assert metrics["failures"][0]["scenario_id"] == "corr_02"


# ---------------------------------------------------------------------------
# 003 additions (T006): multi-call expectations, unit/entity accuracy, per-run
# details, and immutable run files (specs/003-post-mvp-features/contracts/eval-runs.md).
# ---------------------------------------------------------------------------

import json

import pytest

from eval.run import write_run

LEGACY_METRICS = (
    "tool_selection_accuracy",
    "argument_accuracy",
    "sample_id_accuracy",
    "value_extraction_accuracy",
    "ambiguity_clarification_rate",
    "false_record_creation_rate",
    "procedure_hallucination_rate",
    "backend_rejection_correctness",
    "task_completion_rate",
)

TWO_TEMPS = {
    "id": "multi_x",
    "category": "multi_entity",
    "utterance": "A17 is 4.2 and A18 is 4.3 Celsius",
    "expect": {
        "all": [
            {"tool": "record_measurement", "args": {"sample_code": "A17", "value": 4.2, "unit": "C"}},
            {"tool": "record_measurement", "args": {"sample_code": "A18", "value": 4.3, "unit": "C"}},
        ]
    },
}
UNIT_SCENARIO = {
    "id": "unit_x",
    "category": "entity",
    "utterance": "A18 is 3.9 degrees Fahrenheit",
    "expect": {"tool": "record_measurement", "args": {"sample_code": "A18", "value": 3.9, "unit": "F"}},
}


def rec(code, value, unit="C"):
    args = {"sample_code": code, "measurement_type": "temperature", "value": value, "unit": unit}
    return ("record_measurement", args, ok(**args))


def test_all_expectation_requires_every_call():
    assert score(TWO_TEMPS, [rec("A17", 4.2), rec("A18", 4.3)], "Recorded both.")["passed"]
    assert not score(TWO_TEMPS, [rec("A17", 4.2)], "Recorded.")["passed"]


def test_all_expectation_flags_an_extra_write_as_false_record():
    result = score(TWO_TEMPS, [rec("A17", 4.2), rec("A18", 4.3), rec("CONTROL-01", 4.0)], "")
    assert result["false_record"] and not result["passed"]


def test_unit_ok_is_none_without_expected_unit_and_normalises_otherwise():
    no_unit = {**UNIT_SCENARIO, "expect": {"tool": "record_measurement", "args": {"sample_code": "A18"}}}
    assert score(no_unit, [rec("A18", 3.9, "F")], "")["unit_ok"] is None
    assert score(UNIT_SCENARIO, [rec("A18", 3.9, "fahrenheit")], "")["unit_ok"] is True
    assert score(UNIT_SCENARIO, [rec("A18", 3.9, "C")], "")["unit_ok"] is False


def test_entity_ok_requires_every_named_entity():
    assert score(UNIT_SCENARIO, [rec("A18", 3.9, "F")], "")["entity_ok"] is True
    assert score(UNIT_SCENARIO, [rec("A18", 3.8, "F")], "")["entity_ok"] is False
    assert score(REFUSAL, [], "I don't have an approved protocol instruction.")["entity_ok"] is None


def _rows():
    good = [rec("A18", 3.9, "F")]
    return [
        (UNIT_SCENARIO, score(UNIT_SCENARIO, good, "Recorded."), good, "Recorded."),
        (CORRECTION, score(CORRECTION, [], "What value?"), [], "What value?"),
    ]


def test_aggregate_adds_run_id_new_metrics_and_details_for_passes_too():
    metrics = aggregate(_rows(), "test-model")
    for key in LEGACY_METRICS:
        assert key in metrics["metrics"], key
    assert metrics["metrics"]["unit_accuracy"]["total"] == 1
    assert metrics["metrics"]["entity_accuracy"]["passed"] == 1
    assert metrics["run_id"].endswith("_" + metrics["git_sha"])
    assert metrics["profile_counts"] == {"bench": 2}

    details = metrics["details"]
    assert [d["scenario_id"] for d in details] == ["unit_x", "corr_02"]
    first = details[0]
    assert set(first) == {"scenario_id", "category", "profile", "utterance", "expected", "passed", "calls", "reply"}
    assert first["passed"] is True
    assert first["calls"] == [
        {"tool": "record_measurement", "args": good_args(), "success": True, "error": None}
    ]
    assert details[1]["calls"] == [] and details[1]["passed"] is False


def good_args():
    return {"sample_code": "A18", "measurement_type": "temperature", "value": 3.9, "unit": "F"}


def test_write_run_is_immutable_and_rebuilds_history(tmp_path):
    runs, public = tmp_path / "runs", tmp_path / "public"
    first = {**aggregate(_rows(), "m"), "run_id": "20260101T000000Z_aaa", "generated_at": "2026-01-01T00:00:00+00:00"}
    second = {**aggregate(_rows(), "m"), "run_id": "20260102T000000Z_bbb", "generated_at": "2026-01-02T00:00:00+00:00"}

    write_run(first, runs, public)
    write_run(second, runs, public)

    assert (runs / "20260101T000000Z_aaa.json").exists()
    latest = (public / "metrics.json").read_text(encoding="utf-8")
    assert latest == (runs / "20260102T000000Z_bbb.json").read_text(encoding="utf-8")

    history = json.loads((public / "eval-history.json").read_text(encoding="utf-8"))
    assert [h["run_id"] for h in history] == ["20260101T000000Z_aaa", "20260102T000000Z_bbb"]
    assert set(history[0]) == {"run_id", "generated_at", "git_sha", "model", "scenario_count", "metrics", "by_category"}

    with pytest.raises(FileExistsError):
        write_run(first, runs, public)


def test_desk_scenarios_run_under_the_desk_profile_without_the_network(monkeypatch):
    """The harness hands a desk scenario the desk prompt and only the desk tools."""
    import eval.run as run

    seen = {}

    class Reply:
        is_error = False

        def json(self):
            return {"choices": [{"message": {"content": "Which protocol should it use?"}}]}

    def fake_post(url, headers, json, timeout):
        seen["tools"] = [t["function"]["name"] for t in json["tools"]]
        seen["system"] = json["messages"][0]["content"]
        return Reply()

    monkeypatch.setattr(run.httpx, "post", fake_post)
    desk = next(s for s in SCENARIOS if s["id"] == "desk_01")
    calls, text = run.converse("m", "k", desk)

    assert seen["tools"] == ["list_protocols", "search_experiments", "create_experiment", "start_experiment"]
    assert "No experiment is open yet" in seen["system"]
    assert calls == [] and score(desk, calls, text)["passed"]


def test_desk_execute_routes_by_scope():
    sb = seeded_store()
    resumed = execute(sb, None, "start_experiment", {"experiment_ref": "STAB-104", "confirmed": False})
    assert resumed["success"] and resumed["data"]["already_running"] is True
    assert execute(sb, None, "record_measurement", {"sample_code": "A17", "measurement_type": "temperature", "value": 4.2})["error"] == "EXPERIMENT_REQUIRED"


# -- specs/004-step-timers: harness support for timer scenarios (T011, T012a, T037) --


def timer_call(action="start", seconds=600, **args):
    timer = {"timer_id": "t1", "state": "running", "duration_seconds": seconds}
    return ("step_timer", {"action": action, **args}, ok(timer=timer, current_step_index=2))


def test_matches_reads_the_nested_stored_timer():
    scenario = {"id": "t", "category": "timer", "utterance": "", "expect": {
        "tool": "step_timer", "args": {"action": "start", "duration_seconds": 600}}}
    assert score(scenario, [timer_call(seconds=600)], "Timer started.")["passed"]
    assert not score(scenario, [timer_call(seconds=6000)], "Timer started.")["passed"]


def test_offer_expectation_reads_the_reply_and_forbids_a_start():
    offer = {"id": "o", "category": "timer", "utterance": "", "expect": {"offer": True}}
    no_offer = {"id": "n", "category": "timer", "utterance": "", "expect": {"offer": False}}
    assert score(offer, [], "This step is timed, 10 minutes. Shall I start the timer?")["passed"]
    assert not score(offer, [], "Step 3 is Centrifuge.")["passed"]
    # Starting without the user's yes is not an offer (FR-309).
    assert not score(offer, [timer_call()], "Timer started.")["passed"]
    # "timed" is not "timer": mentioning a timed next step is not an offer.
    assert score(no_offer, [], "The next step is timed, 10 minutes.")["passed"]
    assert not score(no_offer, [], "Shall I start the timer?")["passed"]


def test_timer_status_is_a_read_not_a_write():
    clarify = {"id": "c", "category": "timer", "utterance": "", "expect": {"clarify": True}}
    assert not score(clarify, [timer_call("status")], "6 minutes left.")["false_record"]
    assert score(clarify, [timer_call("start")], "Started.")["false_record"]


def test_by_profile_accuracy_ignores_timer_scenarios():
    timer = {"id": "t", "category": "timer", "utterance": "", "expect": {"clarify": True}}
    rows = _rows() + [(timer, score(timer, [timer_call()], ""), [timer_call()], "")]
    metrics = aggregate(rows, "m")
    assert metrics["by_profile"]["bench"]["total"] == 2  # the timer scenario is not counted
    assert metrics["by_profile"]["bench"] == aggregate(_rows(), "m")["by_profile"]["bench"]


def test_scenarios_can_move_the_run_before_the_prompt_is_built(monkeypatch):
    import eval.run as run
    from tests.conftest import TIMED_STEPS

    seen = {}

    class Reply:
        is_error = False

        def json(self):
            return {"choices": [{"message": {"content": "This step is timed. Shall I start the timer?"}}]}

    def fake_post(url, headers, json, timeout):
        seen["system"] = json["messages"][0]["content"]
        seen["opening"] = json["messages"][2]["content"]
        return Reply()

    monkeypatch.setattr(run.httpx, "post", fake_post)
    scenario = {"id": "m", "category": "timer", "utterance": "What step am I on?",
                "expect": {"offer": True}, "steps": TIMED_STEPS, "at_step": 2}
    run.converse("m", "k", scenario)
    assert "Centrifuge at 4,000 rpm for 10 minutes" in seen["system"]
    assert "Step 3 of 6: Centrifuge" in seen["opening"]


# ---------------------------------------------------------------------------
# specs/006 T019: comparison replies may only speak the backend's numbers (SC-401).
# ---------------------------------------------------------------------------

COMPARE = {
    "id": "cmp_test", "category": "comparison", "utterance": "How does that compare with the previous run?",
    "expect": {"tool": "get_sample_history", "args": {"sample_code": "A17", "compare_previous": True},
               "spoken": ["4.4", "0.1", "lower"]},
}
COMPARISON = {
    "current": 4.3, "previous": 4.4, "magnitude": 0.1, "pct": -2.3, "direction": "lower",
    "current_step": {"index": 1, "name": "Record initial temperature"},
    "previous_step": {"index": 1, "name": "Record initial temperature"},
}
CALLS = [("get_sample_history", {"sample_code": "A17", "compare_previous": True},
          ok(sample_code="A17", measurements=[], observations=[], comparison=COMPARISON))]


def test_a_reply_with_only_backend_numbers_passes():
    r = score(COMPARE, CALLS, "In STAB-102, A17 was 4.4 C at this step. Today's 4.3 C is 0.1 C lower, 2.3 percent lower.")
    assert r["spoken_ok"] and r["numbers_ok"] and r["passed"]


def test_a_number_the_backend_never_returned_fails():
    r = score(COMPARE, CALLS, "A17 was 4.4 C in STAB-102. Today's 4.3 C is 0.2 C lower.")
    assert r["numbers_ok"] is False and not r["passed"]


def test_digits_inside_codes_are_not_numbers():
    r = score(COMPARE, CALLS, "STAB-102 had A17 and CONTROL-01 at 4.4; today is 0.10 lower.")
    assert r["numbers_ok"] is True


def test_no_comparison_call_fails_numbers():
    assert score(COMPARE, [], "It was 4.4, now 0.1 lower.")["numbers_ok"] is False


def test_comparison_exactness_metric():
    good = score(COMPARE, CALLS, "4.4 before; today 0.1 lower.")
    bad = score(COMPARE, CALLS, "4.4 before; today 0.3 lower.")
    metric = aggregate([(COMPARE, good, CALLS, ""), (COMPARE, bad, CALLS, "")], "m")["metrics"]["comparison_exactness"]
    assert (metric["passed"], metric["total"]) == (1, 2)
