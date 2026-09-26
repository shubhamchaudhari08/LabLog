"""The measurement vocabulary: one declaration, every other form derived.

Before this module the list lived in four places (keyterms, suggested units, the
tool field description and a pH special case) and they had already drifted:
rpm, voltage, current and humidity were biased for in speech recognition but had
no suggested units when the agent asked "what unit?".
"""

from __future__ import annotations

from app.tools import vocabulary
from app.tools.handlers import record_measurement
from app.tools.models import RecordMeasurementArgs
from app.tools.prompt import build_keyterms
from app.tools.schemas import TOOL_SCHEMAS
from app.db import ExperimentContext


def test_every_type_has_units_and_a_default():
    for entry in vocabulary.MEASUREMENT_TYPES:
        assert entry.units, entry.name
        assert entry.default_unit == entry.units[0]


def test_names_are_unique_case_insensitively():
    names = [t.name.casefold() for t in vocabulary.MEASUREMENT_TYPES]
    assert len(names) == len(set(names))


def test_lookup_is_case_insensitive_and_open():
    assert vocabulary.lookup("PH").name == "pH"
    assert vocabulary.lookup(" Temperature ").name == "temperature"
    # Unlisted types are allowed, just unknown (data-model.md: open fallback).
    assert vocabulary.lookup("osmolality") is None


def test_suggested_units_cover_every_listed_type():
    for entry in vocabulary.MEASUREMENT_TYPES:
        assert vocabulary.suggested_units(entry.name) == list(entry.units)
    assert vocabulary.suggested_units("osmolality") == []


def test_tool_description_names_every_type():
    schema = next(s for s in TOOL_SCHEMAS if s["name"] == "record_measurement")
    description = schema["parameters"]["properties"]["measurement_type"]["description"]
    for entry in vocabulary.MEASUREMENT_TYPES:
        assert entry.name in description


def test_keyterms_include_types_and_spoken_units():
    ctx = ExperimentContext(experiment={"experiment_code": "STAB-104"}, samples=[])
    terms = build_keyterms(ctx)
    for entry in vocabulary.MEASUREMENT_TYPES:
        assert entry.name in terms
        for spoken in entry.spoken_units:
            assert spoken in terms


def test_unit_prompt_suggests_units_for_types_that_had_none(sb, experiment):
    # rpm was in the keyterms but missing from the old suggestion table.
    result = record_measurement(
        sb=sb,
        experiment={**experiment, "current_step_index": 0},
        user_id=experiment["owner_id"],
        args=RecordMeasurementArgs(sample_code="A17", measurement_type="rpm", value=1200),
    )
    assert result["error"] == "UNIT_REQUIRED"
    assert result["detail"]["suggested_units"] == ["rpm"]
