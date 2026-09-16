"""T035 — spoken sample identifier resolution.

Layer 2 of the entity-accuracy defence. These are the cases the Phase 0 spike
exists to enumerate; the ones below are the predictable ones, and T018 feeds the
observed ones back into this file.
"""

from __future__ import annotations

import pytest

from app.tools.normalize import normalize_code, resolve_sample

SAMPLES = [
    {"id": "1", "sample_code": "A17"},
    {"id": "2", "sample_code": "A18"},
    {"id": "3", "sample_code": "CONTROL-01"},
]


@pytest.mark.parametrize(
    "spoken,expected",
    [
        ("A17", "a17"),
        ("a 1 7", "a17"),
        ("A seventeen", "a17"),
        ("control one", "control1"),
        ("CONTROL-01", "control01"),
        ("Control 01", "control01"),
    ],
)
def test_normalisation(spoken, expected):
    assert normalize_code(spoken) == expected


def test_exact_match_wins():
    result = resolve_sample("A17", SAMPLES)
    assert result.status == "exact"
    assert result.sample["sample_code"] == "A17"


def test_case_insensitive_exact():
    assert resolve_sample("a17", SAMPLES).sample["sample_code"] == "A17"


@pytest.mark.parametrize(
    "spoken",
    ["control one", "CONTROL 01", "control-1", "Control One", "control 1"],
)
def test_control_aliases_resolve(spoken):
    result = resolve_sample(spoken, SAMPLES)
    assert result.ok, f"{spoken!r} should resolve"
    assert result.sample["sample_code"] == "CONTROL-01"


@pytest.mark.parametrize("spoken", ["A seventeen", "a 1 7", "a17"])
def test_spoken_alphanumerics_resolve(spoken):
    assert resolve_sample(spoken, SAMPLES).sample["sample_code"] == "A17"


def test_unknown_sample_returns_the_valid_codes():
    # The agent needs these to suggest a neighbour rather than apologise
    # vaguely (FR-013).
    result = resolve_sample("A99", SAMPLES)
    assert result.status == "not_found"
    assert result.candidates == ["A17", "A18", "CONTROL-01"]


def test_empty_input_is_not_found_not_a_crash():
    assert resolve_sample(None, SAMPLES).status == "not_found"
    assert resolve_sample("   ", SAMPLES).status == "not_found"


def test_ambiguity_is_reported_not_guessed():
    # Two samples that normalise identically must produce a question, never a
    # coin flip (FR-016).
    colliding = [
        {"id": "1", "sample_code": "AB-1"},
        {"id": "2", "sample_code": "AB1"},
    ]
    result = resolve_sample("A B one", colliding)
    assert result.status == "ambiguous"
    assert set(result.candidates) == {"AB-1", "AB1"}
    assert result.sample is None
