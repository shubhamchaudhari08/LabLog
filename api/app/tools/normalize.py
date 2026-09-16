"""Resolve a spoken sample identifier to a real sample.

Layer 2 of the four-layer entity-accuracy defence (plan.md §A5). Layer 1 is ASR
bias via `input.keyterms`; layer 3 is a specific rejection carrying the valid
codes so the agent can suggest; layer 4 is barcode selection, held in reserve.

The alias map is built per experiment, from that experiment's own sample list.
It is never a global dictionary: `A1` may be a valid code in one experiment and
a mishearing of `A17` in another, and only the experiment's own sample set can
tell those apart (data-model.md §Resolution rule).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

_SPELLED_DIGITS = {
    "zero": "0",
    "oh": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "ten": "10",
    "eleven": "11",
    "twelve": "12",
    "thirteen": "13",
    "fourteen": "14",
    "fifteen": "15",
    "sixteen": "16",
    "seventeen": "17",
    "eighteen": "18",
    "nineteen": "19",
    "twenty": "20",
}

_WORD = re.compile(r"[a-z]+|[0-9]+")


def normalize_code(raw: str) -> str:
    """Casefold, map spelled-out digits, strip everything non-alphanumeric.

    "control one" -> "control1"      "CONTROL-01" -> "control01"
    "A seventeen" -> "a17"           "a 1 7"      -> "a17"
    """
    lowered = raw.strip().lower()
    tokens = _WORD.findall(lowered)
    mapped = [_SPELLED_DIGITS.get(t, t) for t in tokens]
    return "".join(mapped)


def _variants(code: str) -> set[str]:
    """Forms a normalised code might legitimately take.

    Leading zeros are the recurring nuisance: a speaker says "control one" for
    `CONTROL-01`, so `control1` and `control01` have to be the same key.
    """
    out = {code}
    # collapse zero-padding after a letter run: control01 -> control1
    collapsed = re.sub(r"(?<=[a-z])0+(?=\d)", "", code)
    out.add(collapsed)
    # and the reverse: control1 -> control01
    padded = re.sub(r"(?<=[a-z])(\d)$", r"0\1", code)
    out.add(padded)
    return out


@dataclass(frozen=True)
class Resolution:
    """Outcome of a lookup. Exactly one of `sample` / `candidates` is meaningful."""

    status: str  # "exact" | "normalized" | "ambiguous" | "not_found"
    sample: dict[str, Any] | None = None
    candidates: list[str] | None = None

    @property
    def ok(self) -> bool:
        return self.sample is not None


def resolve_sample(spoken: str | None, samples: list[dict[str, Any]]) -> Resolution:
    """Resolve `spoken` against this experiment's samples.

    Order matters: an exact match always wins, so a real code is never
    reinterpreted by the normaliser.
    """
    if not spoken or not spoken.strip():
        return Resolution("not_found", candidates=[s["sample_code"] for s in samples])

    for sample in samples:
        if sample["sample_code"] == spoken.strip():
            return Resolution("exact", sample=sample)

    # Case-insensitive exact, before falling through to fuzzier forms.
    target = spoken.strip().casefold()
    for sample in samples:
        if sample["sample_code"].casefold() == target:
            return Resolution("exact", sample=sample)

    spoken_variants = _variants(normalize_code(spoken))
    matches = [
        s for s in samples if _variants(normalize_code(s["sample_code"])) & spoken_variants
    ]

    if len(matches) == 1:
        return Resolution("normalized", sample=matches[0])
    if len(matches) > 1:
        # Two candidates is a question, never a coin flip (FR-016).
        return Resolution("ambiguous", candidates=[m["sample_code"] for m in matches])

    return Resolution("not_found", candidates=[s["sample_code"] for s in samples])
