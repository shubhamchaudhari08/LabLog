"""Generate the tool schemas AssemblyAI expects, from the Pydantic models.

⚠️ The shape here is FLAT:

    {"type": "function", "name": ..., "description": ..., "parameters": {...}}

NOT the OpenAI-nested form the source brief specifies:

    {"type": "function", "function": {"name": ..., ...}}     # WRONG — rejected

Verified against live documentation; see research.md R-001 correction #1 and
contracts/aai-websocket.md §5.

The conversion lives in exactly one function on purpose. When the vendor shape
changes, this is the only edit — which is what made discovering the nested-vs-flat
error a one-line fix rather than a ten-tool rewrite.
"""

from __future__ import annotations

from typing import Any

from .models import TOOL_REGISTRY, _Args

# Tool round trips are a single indexed query plus one or two inserts against a
# database in the same region. "hold" keeps the agent silent for that, rather
# than speaking a filler phrase in front of a sub-second write — which makes the
# interaction feel slower and emits an utterance not grounded in a completed
# write (research.md R-004).
DEFAULT_EXECUTION_MODE = "hold"
DEFAULT_TIMEOUT_SECONDS = 30


def _clean_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Strip Pydantic bookkeeping the agent does not need."""
    schema.pop("title", None)
    for prop in (schema.get("properties") or {}).values():
        prop.pop("title", None)
        # Pydantic renders `str | None` as anyOf[str, null]; flatten it to a
        # plain optional string, which reads more clearly to the model.
        any_of = prop.get("anyOf")
        if any_of and len(any_of) == 2:
            non_null = [m for m in any_of if m.get("type") != "null"]
            if len(non_null) == 1:
                prop.pop("anyOf")
                prop.update(non_null[0])
    schema.setdefault("properties", {})
    schema.setdefault("required", [])
    return schema


def to_tool_schema(
    name: str,
    model: type[_Args],
    description: str,
    *,
    execution_mode: str = DEFAULT_EXECUTION_MODE,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    return {
        "type": "function",
        "name": name,
        "description": description,
        "parameters": _clean_schema(model.model_json_schema()),
        "execution_mode": execution_mode,
        "timeout_seconds": timeout_seconds,
    }


def build_tool_schemas() -> list[dict[str, Any]]:
    return [to_tool_schema(n, m, d) for n, (m, d) in TOOL_REGISTRY.items()]


TOOL_SCHEMAS: list[dict[str, Any]] = build_tool_schemas()
