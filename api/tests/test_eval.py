"""The harness decides every figure the dashboard shows, so its scoring gets a check."""

from eval.run import aggregate, execute, score
from eval.scenarios import SCENARIOS
from tests.conftest import seeded_store
from app.tools.models import TOOL_REGISTRY

CORRECTION = next(s for s in SCENARIOS if s["id"] == "corr_02")
REFUSAL = next(s for s in SCENARIOS if s["id"] == "ref_02")


def ok(**data):
    return {"success": True, "data": data}


def test_corpus_is_large_enough_and_setups_succeed():
    assert len(SCENARIOS) >= 30
    for scenario in SCENARIOS:
        assert scenario["expect"].get("tool") in (None, *TOOL_REGISTRY)
        sb = seeded_store()
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
