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
