"""T033 â€” the tool schema shape the agent actually receives.

This file exists because the source brief specified the OpenAI-nested shape and
the live API requires a flat one. That error would have presented as the agent
silently refusing to call anything (research.md R-001 #1).
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.tools.models import PROFILES, TOOL_REGISTRY, TOOL_SCOPE, StepTimerArgs
from app.tools.schemas import TOOL_SCHEMAS, build_tool_schemas, tool_schemas

ALL_SCHEMAS = build_tool_schemas()


def test_tool_count_is_pinned():
    # Constitution amendment A-1: the ceiling is per session configuration (≤12),
    # not per registry. The bench set is pinned so a new bench tool has to be a
    # deliberate change, not drift: the MVP's eleven plus specs/004 step_timer
    # (research R-301), which reaches the cap.
    assert len(TOOL_SCHEMAS) == 12
    assert [s["name"] for s in TOOL_SCHEMAS] == list(PROFILES["bench"])
    for profile, names in PROFILES.items():
        assert len(names) <= 12, profile
        assert len(tool_schemas(profile)) == len(names)


def test_profiles_draw_from_one_registry():
    for names in PROFILES.values():
        assert set(names) <= set(TOOL_REGISTRY)
    assert set(TOOL_SCOPE) == set(TOOL_REGISTRY)
    assert set(TOOL_REGISTRY) == {n for names in PROFILES.values() for n in names}


def test_desk_profile_has_search():
    # specs/006: search is the desk's fourth tool (owner waived the A-1 eval, plan G14).
    assert [s["name"] for s in tool_schemas("desk")] == [
        "list_protocols",
        "search_experiments",
        "create_experiment",
        "start_experiment",
    ]


def test_get_sample_history_keeps_sample_code_required():
    # specs/006 R-401: comparison folds in as optional fields; today's calls are unchanged.
    schema = next(s for s in TOOL_SCHEMAS if s["name"] == "get_sample_history")
    assert schema["parameters"]["required"] == ["sample_code"]
    assert set(schema["parameters"]["properties"]) == {"sample_code", "compare_previous", "measurement_type"}


def test_schemas_are_flat_not_openai_nested():
    for schema in ALL_SCHEMAS:
        assert schema["type"] == "function"
        assert "name" in schema, "name must be top level, not nested under 'function'"
        assert "function" not in schema, (
            "OpenAI-nested shape detected. AssemblyAI expects the flat form â€” "
            "see contracts/aai-websocket.md Â§5."
        )
        assert isinstance(schema["description"], str) and schema["description"]
        assert schema["parameters"]["type"] == "object"


def test_every_tool_holds_rather_than_speaking_filler():
    # research.md R-004: our handlers are sub-second, so a spoken transition
    # phrase makes the interaction feel slower and emits an utterance that is
    # not grounded in a completed write.
    for schema in ALL_SCHEMAS:
        assert schema["execution_mode"] == "hold"
        assert 1 <= schema["timeout_seconds"] <= 300


def test_no_tool_accepts_a_timestamp():
    # Constitution Principle I / FR-006: all times are server-generated. This is
    # enforced structurally â€” there is nowhere to put a time.
    for schema in ALL_SCHEMAS:
        for name in schema["parameters"].get("properties", {}):
            assert not any(
                token in name.lower() for token in ("time", "_at", "date", "timestamp")
            ), f"{schema['name']}.{name} looks like a caller-supplied timestamp"


def test_record_measurement_requires_sample_value_and_type_but_not_unit():
    schema = next(s for s in TOOL_SCHEMAS if s["name"] == "record_measurement")
    required = set(schema["parameters"]["required"])
    assert required == {"sample_code", "measurement_type", "value"}
    # Unit is optional so the protocol default can resolve it; when it cannot,
    # the handler returns UNIT_REQUIRED and the agent asks (FR-014).
    assert "unit" not in required


def test_sample_code_carries_real_examples():
    # JSON Schema `examples` measurably improve argument extraction (R-010).
    schema = next(s for s in TOOL_SCHEMAS if s["name"] == "record_measurement")
    examples = schema["parameters"]["properties"]["sample_code"]["examples"]
    assert "A17" in examples and "CONTROL-01" in examples


def test_measurement_type_is_not_a_closed_enum():
    # A closed enum would make the agent coerce an unlisted type into a listed
    # one: data corruption disguised as a validation success.
    schema = next(s for s in TOOL_SCHEMAS if s["name"] == "record_measurement")
    assert "enum" not in schema["parameters"]["properties"]["measurement_type"]



def test_step_timer_args_both_or_neither():
    # specs/004 data-model §4: a value without a unit is ambiguous, not a default.
    with pytest.raises(ValidationError):
        StepTimerArgs(action="start", duration_value=10)
    with pytest.raises(ValidationError):
        StepTimerArgs(action="start", duration_unit="minutes")
    with pytest.raises(ValidationError):
        StepTimerArgs(action="start", duration_value=float("inf"), duration_unit="minutes")
    assert StepTimerArgs(action="start").duration_value is None
    # Zero passes the model on purpose: the handler answers DURATION_OUT_OF_RANGE,
    # which tells the agent the allowed range (spec US1 scenario 6).
    assert StepTimerArgs(action="start", duration_value=0, duration_unit="minutes").duration_value == 0


# The subset the voice agent is known to handle (contracts/aai-websocket.md §5).
# It does not validate schemas at session.update; one outside this subset is
# accepted silently and the tool can never be called. specs/007 R-711: a nested
# create_experiment.samples left desk sessions deaf until the tool timeout.
ROOT_KEYS = {"type", "properties", "required", "additionalProperties", "description"}
PROPERTY_KEYS = {
    "type", "description", "enum", "pattern", "format", "examples", "default",
    "minLength", "maxLength", "minimum", "maximum", "maxItems", "items",
}
SCALARS = {"string", "number", "integer", "boolean"}


def _subset_violations(name: str, parameters: dict) -> list[str]:
    problems = [f"{name}: root key {k}" for k in set(parameters) - ROOT_KEYS]
    for prop, spec in parameters.get("properties", {}).items():
        where = f"{name}.{prop}"
        problems += [f"{where}: key {k}" for k in set(spec) - PROPERTY_KEYS]
        kind = spec.get("type")
        if kind == "array":
            items = spec.get("items") or {}
            if items.get("type") not in SCALARS or set(items) - {"type", "enum", "pattern"}:
                problems.append(f"{where}: array items must be a plain scalar, got {items}")
        elif kind not in SCALARS:
            problems.append(f"{where}: type {kind!r} is not a scalar or an array of scalars")
    return problems


@pytest.mark.parametrize("profile", ["bench", "desk"])
def test_every_schema_stays_in_the_vendor_subset(profile):
    problems = [p for s in tool_schemas(profile) for p in _subset_violations(s["name"], s["parameters"])]
    assert problems == []


def test_create_experiment_takes_types_as_lists_of_spoken_codes():
    # specs/007 R-716: every argument string must be words the user said, so a
    # type is the list a code sits in, never a nested object or "A17:test".
    create = next(s for s in ALL_SCHEMAS if s["name"] == "create_experiment")
    properties = create["parameters"]["properties"]
    assert "samples" not in properties
    for field in ("sample_codes", "test_samples", "control_samples"):
        assert properties[field]["items"] == {"type": "string"}, field
    examples = [e for f in properties.values() for group in f.get("examples", []) for e in (group if isinstance(group, list) else [group])]
    assert not [e for e in examples if ":" in str(e)]


def test_bench_tools_ask_only_for_values_the_user_says():
    # voice-agent-stuck-actions (R-716 applied to bench): a transcript the model
    # writes, an unused step code and a zero-based index are all values the user
    # never said, and the voice agent drops a call carrying one.
    props = {s["name"]: s["parameters"]["properties"] for s in TOOL_SCHEMAS}
    assert "raw_spoken_value" not in props["record_measurement"]
    assert "step_id" not in props["complete_protocol_step"]
    assert "step_index" not in props["write_protocol_step"]
    assert props["write_protocol_step"]["step_number"]["minimum"] == 1
    for name, fields in props.items():
        for field, spec in fields.items():
            text = spec.get("description", "").lower()
            assert "transcription" not in text and "zero-based" not in text, f"{name}.{field}"


def test_records_can_say_every_sample_and_an_earlier_step():
    # .specify/bugs/observations-not-counted: both are values the user says
    # ("all samples", "for step 4"), so both stay grounded (R-716).
    props = {s["name"]: s["parameters"]["properties"] for s in TOOL_SCHEMAS}
    assert props["record_observation"]["all_samples"]["type"] == "boolean"
    for tool in ("record_observation", "record_measurement"):
        assert props[tool]["step_number"]["type"] == "integer"
        assert props[tool]["step_number"]["minimum"] == 1
    from app.db import ExperimentContext
    from app.tools.prompt import build_prompt

    prompt = build_prompt(ExperimentContext(experiment={"experiment_code": "X-1", "name": "x", "status": "RUNNING"}, samples=[]))
    assert "all_samples true" in prompt and "step_number" in prompt


def test_bench_prompt_says_when_the_run_is_not_running():
    # voice-agent-stuck-actions: a READY run got "The experiment is already
    # active", every record failed EXPERIMENT_NOT_RUNNING, and nothing said why.
    from app.db import ExperimentContext
    from app.tools.prompt import build_prompt

    ready = build_prompt(ExperimentContext(experiment={"experiment_code": "X-1", "name": "x", "status": "READY"}, samples=[]))
    assert "already active" not in ready
    assert "ready, not running" in ready and "Start button" in ready
    running = build_prompt(ExperimentContext(experiment={"experiment_code": "X-1", "name": "x", "status": "RUNNING"}, samples=[]))
    assert "already active" in running
    for prompt in (ready, running):
        assert "EXPERIMENT_NOT_RUNNING" in prompt
        # The old rule told the agent to complete a step the user had not asked to.
        assert "complete the current step first" not in prompt
        assert '"degrees"' in prompt and "step_number" in prompt


def test_prompt_never_asks_for_a_value_the_user_did_not_say():
    # specs/007 R-716: "Pass the protocol's CODE" made the model send STAB when the
    # user said "sample stability"; the vendor dropped the call and the agent went deaf.
    from app.tools.prompt import build_desk_prompt

    prompt = build_desk_prompt([], [])
    assert "CODE as protocol_ref" not in prompt
    assert "exactly as the user said it" in prompt


def test_bench_prompt_has_no_quotable_confirmation():
    # Owner report 2026-09-30: with 'Good: "Recorded. A17 temperature is 4.3..."'
    # in the prompt, the agent said "Recorded" without calling record_measurement
    # (live probe B1/B2 failed; B3/B4 without the example called the tool).
    from app.db import ExperimentContext
    from app.tools.prompt import build_prompt

    prompt = build_prompt(ExperimentContext(experiment={"experiment_code": "X-1", "name": "x", "status": "RUNNING"}, samples=[]))
    assert "Good:" not in prompt and '"Recorded.' not in prompt
    assert "Never say a reading" in prompt
    assert "STEP_INCOMPLETE" in prompt and "confirmed_incomplete" in prompt


def test_prompts_explain_samples_required():
    # specs/007 R-724: desk asks for the samples; bench says there is no override.
    from app.db import ExperimentContext
    from app.tools.prompt import build_desk_prompt, build_prompt

    desk = build_desk_prompt([], [])
    assert "SAMPLES_REQUIRED" in desk and "Never invent sample codes" in desk
    bench = build_prompt(ExperimentContext(experiment={"experiment_code": "X-1", "name": "x", "status": "RUNNING"}, samples=[]))
    assert "SAMPLES_REQUIRED at a step cannot be overridden" in bench
