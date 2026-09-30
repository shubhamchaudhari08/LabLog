"""Resolve spoken references to stored rows (specs/003-post-mvp-features R-204, R-206).

Resolution only ever searches rows the caller may use: their own experiments,
and their own or shared-library protocols. So another user's experiment code
resolves to EXPERIMENT_NOT_FOUND, never to a 403 that would confirm it exists.

An ambiguous reference is an error carrying the candidates, never a guess
(Constitution Principle I: unresolved ambiguity produces a question).
"""

from __future__ import annotations

from typing import Any


def _norm(text: Any) -> str:
    return " ".join(str(text or "").split()).casefold()


# Said around a protocol's name, not part of it: "the sample stability protocol".
# The agent passes what the user said (specs/007 R-716), so these arrive too.
_FILLER = {"the", "a", "an", "protocol"}


def _pick(rows: list[dict[str, Any]], tiers) -> list[dict[str, Any]]:
    """The hits of the first tier that matches anything."""
    for match in tiers:
        hits = [r for r in rows if match(r)]
        if hits:
            return hits
    return []


def readable_protocols(sb, user_id: str) -> list[dict[str, Any]]:
    own = sb.table("protocols").select("*").eq("owner_id", user_id).execute().data or []
    shared = sb.table("protocols").select("*").is_("owner_id", "null").execute().data or []
    return sorted(own + shared, key=lambda p: _norm(p.get("name")))


def _protocol_brief(p: dict[str, Any]) -> dict[str, Any]:
    return {"protocol_code": p.get("protocol_code"), "name": p.get("name"), "version": p.get("version")}


def resolve_protocol(sb, user_id: str, ref: str) -> dict[str, Any]:
    """{"protocol": row} or {"error", "message", "detail"}.

    Tiers, first match wins: exact code → exact name → "name version" → name
    containing every spoken word ("sample stability" → Sample Stability Evaluation).
    """
    rows = readable_protocols(sb, user_id)
    wanted = _norm(ref)
    words = [w for w in wanted.split() if w not in _FILLER]
    hits = _pick(
        rows,
        [
            lambda p: _norm(p.get("protocol_code")) == wanted,
            lambda p: _norm(p.get("name")) == wanted,
            lambda p: _norm(f"{p.get('name')} {p.get('version') or ''}") == wanted,
            lambda p: bool(words) and all(w in _norm(p.get("name")) for w in words),
        ],
    )
    if len(hits) == 1:
        return {"protocol": hits[0]}
    if hits:
        return {
            "error": "AMBIGUOUS_PROTOCOL",
            "message": f'"{ref}" matches {len(hits)} protocols. Which one?',
            "detail": {"candidates": [_protocol_brief(p) for p in hits[:5]]},
        }
    return {
        "error": "PROTOCOL_NOT_FOUND",
        "message": f'There is no protocol called "{ref}".',
        "detail": {"alternatives": [_protocol_brief(p) for p in rows[:5]]},
    }


def resolve_experiment(sb, user_id: str, ref: str) -> dict[str, Any]:
    """{"experiment": row} or an error body. Only the caller's own experiments are searched."""
    rows = sb.table("experiments").select("*").eq("owner_id", user_id).execute().data or []
    wanted = _norm(ref)
    hits = _pick(
        rows,
        [
            lambda e: _norm(e.get("experiment_code")) == wanted,
            lambda e: _norm(e.get("name")) == wanted,
        ],
    )
    if len(hits) == 1:
        return {"experiment": hits[0]}
    brief = lambda e: {"experiment_code": e.get("experiment_code"), "name": e.get("name"), "status": e.get("status")}  # noqa: E731
    if hits:
        return {
            "error": "AMBIGUOUS_EXPERIMENT",
            "message": f'"{ref}" matches {len(hits)} experiments. Which one?',
            "detail": {"candidates": [brief(e) for e in hits[:5]]},
        }
    open_ = [e for e in rows if e.get("status") in ("DRAFT", "READY", "RUNNING")]
    return {
        "error": "EXPERIMENT_NOT_FOUND",
        "message": f'You have no experiment called "{ref}".',
        "detail": {"alternatives": [brief(e) for e in open_[:5]]},
    }
