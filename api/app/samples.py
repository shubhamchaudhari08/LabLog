"""Sample codes: one validation, shared by every path that registers samples.

The quick-create form, the sample-add endpoint and (later) the voice
create_experiment tool all go through here, so a code accepted by one is
accepted by all (Constitution Principle IV). Validation is separate from
writing so callers can reject a whole request before the first insert
("Rejections must not corrupt").
"""

from __future__ import annotations

import re
from typing import Any, Literal

from .audit import write_event
from .tools.requirements import SAMPLE_TYPE_PATTERN

SAMPLE_CODE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]{0,31}$")
# The pattern a protocol's sample requirement uses, so a type that can be
# registered is a type a protocol can ask for (Principle IV).
SAMPLE_TYPE = re.compile(SAMPLE_TYPE_PATTERN)
DEFAULT_SAMPLE_TYPE = "experimental"  # the column default, kept for callers that give none


def normalize_sample_code(code: str | None) -> str | None:
    """Stripped and uppercased, or None if it is not a valid code."""
    text = (code or "").strip().upper()
    return text if SAMPLE_CODE.fullmatch(text) else None


def validate_sample_codes(codes: list[str]) -> tuple[list[str], dict[str, Any] | None]:
    """(normalised codes, None) or ([], an error body naming the first bad code)."""
    seen: list[str] = []
    for raw in codes:
        code = normalize_sample_code(raw)
        if code is None:
            return [], {
                "error": "INVALID_SAMPLE_CODE",
                "message": f'"{raw}" is not a valid sample code. Use letters, digits and hyphens, starting with a letter or digit.',
                "detail": {"code": raw, "pattern": SAMPLE_CODE.pattern},
            }
        if code in seen:
            return [], {
                "error": "DUPLICATE_SAMPLE_CODE",
                "message": f"{code} is listed twice.",
                "detail": {"code": code},
            }
        seen.append(code)
    return seen, None


def validate_samples(
    specs: list[dict[str, Any]],
) -> tuple[list[str], dict[str, str], dict[str, Any] | None]:
    """(codes, {code: sample_type}, None) or ([], {}, an error body).

    `specs` are {"code", "sample_type"?}. Types are lowercased; an omitted type
    takes the column default. Codes go through validate_sample_codes unchanged.
    """
    codes, problem = validate_sample_codes([str(s.get("code") or "") for s in specs])
    if problem:
        return [], {}, problem
    types: dict[str, str] = {}
    for code, spec in zip(codes, specs):
        raw = spec.get("sample_type")
        if raw is None or not str(raw).strip():
            continue
        kind = str(raw).strip().lower()
        if not SAMPLE_TYPE.fullmatch(kind):
            return [], {}, {
                "error": "INVALID_SAMPLE_TYPE",
                "message": f'"{raw}" is not a valid sample type. Use a word such as test or control.',
                "detail": {"code": code, "sample_type": raw, "pattern": SAMPLE_TYPE.pattern},
            }
        types[code] = kind
    return codes, types, None


def add_samples(
    sb,
    experiment: dict[str, Any],
    codes: list[str],
    *,
    actor_id: str,
    session_id: str | None = None,
    source: Literal["ui", "voice"],
    sample_types: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Insert already-validated codes, then audit each. Returns the stored rows."""
    stored = []
    for code in codes:
        kind = (sample_types or {}).get(code, DEFAULT_SAMPLE_TYPE)
        row = (
            sb.table("samples")
            .insert({"experiment_id": experiment["id"], "sample_code": code, "sample_type": kind})
            .execute()
        ).data[0]
        write_event(
            sb,
            experiment_id=experiment["id"],
            event_type="SAMPLE_CREATED",
            entity_type="sample",
            entity_id=row["id"],
            payload={"sample_code": code, "sample_type": row.get("sample_type", kind), "source": source},
            actor_id=actor_id,
            voice_session_id=session_id,
        )
        stored.append(row)
    return stored
