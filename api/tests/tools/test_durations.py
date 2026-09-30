"""specs/004-step-timers data-model §3 — timed-step detection.

The parser is the only thing that turns protocol text into a timer duration, so
the model never supplies one the protocol did not state (FR-308, FR-310). Every
row of the data-model table is a case here; a row that stops passing is a
behaviour change, not a test to update.
"""

from __future__ import annotations

import pytest

from app.tools.durations import MAX_SECONDS, MIN_SECONDS, format_duration, step_duration


@pytest.mark.parametrize(
    ("text", "seconds", "reason"),
    [
        ("Centrifuge at 4,000 rpm for 10 minutes", 600, "single"),
        ("Incubate 1 h 30 min at 37 C", 5400, "single"),
        ("Incubate for 1.5 hours", 5400, "single"),
        ("Vortex 30 s", 30, "single"),
        ("Let stand for a 10-minute rest", 600, "single"),
        ("Incubate 10-15 min", None, "range"),
        ("Incubate 10 to 15 minutes", None, "range"),
        ("Spin 5 min, then rest 10 min", None, "multiple"),
        ("Add 10 mL buffer", None, "none"),
        ("Centrifuge at 12000 rpm", None, "none"),
        ("Incubate overnight", None, "none"),
        ("Wait ten minutes", None, "none"),
        ("Record initial temperature", None, "none"),
    ],
)
def test_data_model_table(text, seconds, reason):
    match = step_duration(text)
    assert match.seconds == seconds
    assert match.reason == reason


def test_compound_with_and_is_one_duration():
    assert step_duration("Incubate 1 hour and 30 minutes").seconds == 5400


def test_span_is_the_matched_text():
    assert step_duration("Centrifuge at 4,000 rpm for 10 minutes").span == "10 minutes"
    assert step_duration("Record initial temperature").span is None


def test_unit_letters_inside_words_are_not_units():
    # "2 samples" must not read as 2 seconds; "1 M NaCl" must not read as minutes.
    assert step_duration("Split into 2 samples").reason == "none"
    assert step_duration("Add 1 M NaCl").reason == "none"


@pytest.mark.parametrize(
    ("seconds", "spoken"),
    [
        (600, "10 minutes"),
        (5400, "1 hour 30 minutes"),
        (90, "1 minute 30 seconds"),
        (60, "1 minute"),
        (3600, "1 hour"),
        (5, "5 seconds"),
        (86400, "24 hours"),
        (1, "1 second"),
    ],
)
def test_format_duration(seconds, spoken):
    assert format_duration(seconds) == spoken


def test_bounds():
    assert (MIN_SECONDS, MAX_SECONDS) == (5, 86400)
