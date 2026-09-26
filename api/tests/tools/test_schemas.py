"""T033 â€” the tool schema shape the agent actually receives.

This file exists because the source brief specified the OpenAI-nested shape and
the live API requires a flat one. That error would have presented as the agent
silently refusing to call anything (research.md R-001 #1).
"""

from __future__ import annotations

from app.tools.models import TOOL_REGISTRY
from app.tools.schemas import TOOL_SCHEMAS


def test_tool_count_is_pinned():
    # Ten is the documented ceiling for selection accuracy; write_protocol_step
    # puts us one over, deliberately. The assertion stays pinned so the next
    # tool has to displace one rather than drift the count again.
    assert len(TOOL_SCHEMAS) == 11
    assert len(TOOL_REGISTRY) == 11


def test_schemas_are_flat_not_openai_nested():
    for schema in TOOL_SCHEMAS:
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
    for schema in TOOL_SCHEMAS:
        assert schema["execution_mode"] == "hold"
        assert 1 <= schema["timeout_seconds"] <= 300


def test_no_tool_accepts_a_timestamp():
    # Constitution Principle I / FR-006: all times are server-generated. This is
    # enforced structurally â€” there is nowhere to put a time.
    for schema in TOOL_SCHEMAS:
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

