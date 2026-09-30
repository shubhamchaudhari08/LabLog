"""Timed-step detection and duration wording (specs/004-step-timers research R-303).

The only place a protocol step's text becomes a timer duration. It exists once,
here, so the web never re-parses (Constitution Principle IV), and it is
deterministic, so the model never supplies a duration the protocol did not
state (FR-310).

A step is timed only when its text states exactly ONE duration. A range
("10-15 min") or two durations ("spin 5 min, then rest 10 min") yields none,
and the agent asks instead of choosing.

ponytail: digits only. "ten minutes" is a documented miss (R-303); the failure
is safe — no offer, and the user can still say the duration.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

MIN_SECONDS = 5
MAX_SECONDS = 86_400

_NUM = r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?"
_UNIT = r"hours?|hrs?|h|minutes?|mins?|min|seconds?|secs?|sec|s"
# A number that is not the tail of another token ("A17"), then a unit that is a
# whole word ("2 samples" is not 2 s). The hyphen allows "10-minute".
_ATOM = re.compile(
    rf"(?<![\w.,])(?P<num>{_NUM})\s*-?\s*(?P<unit>{_UNIT})\b",
    re.IGNORECASE,
)
_RANGE = re.compile(
    rf"(?<![\w.,])(?:{_NUM})\s*(?:-|–|—|to|or)\s*(?:{_NUM})\s*-?\s*(?:{_UNIT})\b",
    re.IGNORECASE,
)
# What may sit between the parts of one compound duration: "1 h 30 min",
# "1 hour and 30 minutes".
_JOIN = re.compile(r"\s*(?:,?\s*and\s*)?", re.IGNORECASE)


def _factor(unit: str) -> int:
    unit = unit.lower()
    if unit.startswith("h"):
        return 3600
    if unit.startswith("m"):
        return 60
    return 1


@dataclass(frozen=True)
class DurationMatch:
    seconds: int | None
    reason: Literal["single", "none", "range", "multiple"]
    span: str | None


def step_duration(text: str | None) -> DurationMatch:
    text = text or ""
    if _RANGE.search(text):
        return DurationMatch(None, "range", None)

    # Group adjacent atoms into compound durations, largest unit first.
    groups: list[list[re.Match[str]]] = []
    for atom in _ATOM.finditer(text):
        if groups:
            last = groups[-1][-1]
            between = text[last.end() : atom.start()]
            if _JOIN.fullmatch(between) and _factor(atom["unit"]) < _factor(last["unit"]):
                groups[-1].append(atom)
                continue
        groups.append([atom])

    if not groups:
        return DurationMatch(None, "none", None)
    if len(groups) > 1:
        return DurationMatch(None, "multiple", None)

    parts = groups[0]
    seconds = round(sum(float(p["num"].replace(",", "")) * _factor(p["unit"]) for p in parts))
    return DurationMatch(seconds, "single", text[parts[0].start() : parts[-1].end()])


def for_step(step: dict | None) -> DurationMatch:
    """A step's timer duration: its declared `expected_duration_seconds`, else its text.

    A declared duration is structured protocol data, so it wins over parsing the
    name, and a step like "Stability hold, 14-17 min" is timed without the range
    rule refusing it (specs/007 R-705).
    """
    if not step:
        return DurationMatch(None, "none", None)
    declared = step.get("expected_duration_seconds")
    if isinstance(declared, int) and not isinstance(declared, bool) and declared > 0:
        return DurationMatch(declared, "single", None)
    return step_duration(step.get("name"))


def _plural(count: int, word: str) -> str:
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


def format_duration(seconds: int) -> str:
    """How a duration is spoken back: "1 hour 30 minutes", "1 minute 30 seconds"."""
    hours, rest = divmod(max(0, int(seconds)), 3600)
    minutes, secs = divmod(rest, 60)
    parts = [
        _plural(value, word)
        for value, word in ((hours, "hour"), (minutes, "minute"), (secs, "second"))
        if value
    ]
    return " ".join(parts) or "0 seconds"
