"""Text-level evaluation: real system prompt + real tool schemas → LLM Gateway → real handlers.

    cd api && ASSEMBLYAI_API_KEY=... python -m eval.run [--model claude-sonnet-4-6]

Writes web/public/metrics.json, which the /reliability page renders. Only a
complete run writes the file — a gateway failure aborts rather than recording a
half-measured number.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv
from pydantic import ValidationError

from app.db import ExperimentContext
from app.tools import handlers
from app.tools.models import MUTATING_TOOLS, TOOL_REGISTRY
from app.tools.prompt import build_prompt
from app.tools.schemas import TOOL_SCHEMAS
from tests.conftest import OWNER_ID, seeded_store

from .scenarios import SCENARIOS

GATEWAY = "https://llm-gateway.assemblyai.com/v1/chat/completions"
# The gateway takes OpenAI-nested tool schemas; the voice agent takes flat ones.

GATEWAY_TOOLS = [
    {"type": "function", "function": {k: s[k] for k in ("name", "description", "parameters")}}
    for s in TOOL_SCHEMAS
]
OPENING = [
    {"role": "user", "content": "Start experiment STAB-104."},
    {"role": "assistant", "content": "STAB-104 is running. Step 2 of 6: record initial temperature."},
]

UNIT_ALIAS = {"celsius": "c", "degrees celsius": "c", "°c": "c", "fahrenheit": "f", "grams": "g", "gram": "g"}
OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "metrics.json"


def execute(sb, experiment, name, args):
    """What POST /tools does after auth — same registry, same models, same handlers."""
    if name not in TOOL_REGISTRY:
        return {"success": False, "error": "UNKNOWN_TOOL"}
    try:
        parsed = TOOL_REGISTRY[name][0](**args)
    except ValidationError:
        return {"success": False, "error": "INVALID_ARGS"}
    return getattr(handlers, name)(sb=sb, experiment=experiment, user_id=OWNER_ID, args=parsed, session_id="eval")


def converse(model, key, scenario):
    # ponytail: in-memory store driven by the real handlers — measures the
    # validation layer, not Postgres. Point at a disposable Supabase experiment
    # if database-level behaviour ever needs measuring too.
    sb = seeded_store()
    experiment = sb.rows("experiments")[0]
    for name, args in scenario.get("setup", []):
        execute(sb, experiment, name, args)

    ctx = ExperimentContext(experiment=experiment, protocol=sb.rows("protocols")[0], samples=sb.rows("samples"))
    messages = [
        {"role": "system", "content": build_prompt(ctx)},
        *OPENING,
        *scenario.get("history", []),
        {"role": "user", "content": scenario["utterance"]},
    ]

    calls, text = [], ""
    for _ in range(4):  # the voice agent loops on tool results too
        response = httpx.post(
            GATEWAY,
            headers={"Authorization": key},  # raw key, not Bearer
            json={"model": model, "messages": messages, "tools": GATEWAY_TOOLS},
            timeout=90,
        )
        if response.is_error:
            # The gateway explains itself in the body ("Your account does not have
            # access to this LLM Gateway model"); a bare 400 hides that.
            raise SystemExit(f"LLM Gateway {response.status_code} for model {model}: {response.text[:500]}")
        tool_calls, text = [], ""
        for choice in response.json()["choices"]:  # the gateway may split calls across choices
            content = choice["message"].get("content")
            text += content if isinstance(content, str) else ""
            tool_calls += choice["message"].get("tool_calls") or []
        if not tool_calls:
            break
        messages.append({"role": "assistant", "content": text or None, "tool_calls": tool_calls})
        for call in tool_calls:
            name = call["function"]["name"]
            args = json.loads(call["function"]["arguments"] or "{}")
            result = execute(sb, experiment, name, args)
            calls.append((name, args, result))
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result)})
    return calls, text


def _norm(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    text = str(value).strip().lower()
    return UNIT_ALIAS.get(text, text)


def _matches(expected, name, calls):
    """Compare against STORED values (result data wins over raw arguments)."""
    for called, args, result in calls:
        if called == name and result.get("success"):
            stored = {**args, **(result.get("data") or {})}
            if all(_norm(stored.get(k)) == _norm(v) for k, v in expected.items()):
                return True
    return False


def score(scenario, calls, text):
    expect = scenario["expect"]
    writes = [name for name, _, result in calls if name in MUTATING_TOOLS and result.get("success")]
    tool, args = expect.get("tool"), expect.get("args", {})

    if tool:
        selected = any(name == tool and result.get("success") for name, _, result in calls)
        false_record = any(name != tool for name in writes)
    else:
        selected = not writes
        false_record = bool(writes)

    def subset(*keys):
        picked = {k: v for k, v in args.items() if k in keys}
        return _matches(picked, tool, calls) if picked else None

    r = {
        "selected": selected,
        "false_record": false_record,
        "args_ok": _matches(args, tool, calls) if args else None,
        "sample_ok": subset("sample_code"),
        "value_ok": subset("value", "new_value"),
        "hallucination": None,
        "backend_ok": None,
    }
    if expect.get("refuse"):
        # ponytail: string heuristic on the prompt's mandated refusal wording.
        # Swap for an LLM judge if phrasing drifts from the prompt.
        lowered = text.lower()
        r["hallucination"] = not ("approved protocol" in lowered or "verify the laboratory procedure" in lowered)
    if expect.get("error"):
        attempted = [result for name, _, result in calls if name == "record_measurement"]
        r["backend_ok"] = any(x.get("error") == expect["error"] for x in attempted) if attempted else None

    r["passed"] = selected and r["args_ok"] is not False and not false_record and not r["hallucination"]
    return r


def _rate(flags, lower_is_better=False):
    known = [f for f in flags if f is not None]
    passed, total = sum(known), len(known)
    value = (1 - passed / total if lower_is_better else passed / total) if total else None
    metric = {"value": None if value is None else round(value, 3), "passed": passed, "total": total}
    return {**metric, "lower_is_better": True} if lower_is_better else metric


def aggregate(results, model):
    by_cat = defaultdict(lambda: {"total": 0, "passed": 0})
    for sc, r, _, _ in results:
        by_cat[sc["category"]]["total"] += 1
        by_cat[sc["category"]]["passed"] += int(r["passed"])
    col = lambda key: [r[key] for _, r, _, _ in results]  # noqa: E731
    try:
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    except OSError:
        sha = "unknown"

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scenario_count": len(results),
        "model": model,
        "git_sha": sha or "unknown",
        "metrics": {
            "tool_selection_accuracy": _rate(col("selected")),
            "argument_accuracy": _rate(col("args_ok")),
            "sample_id_accuracy": _rate(col("sample_ok")),
            "value_extraction_accuracy": _rate(col("value_ok")),
            "ambiguity_clarification_rate": _rate([r["passed"] for sc, r, _, _ in results if sc["category"] == "ambiguity"]),
            "false_record_creation_rate": _rate([not f for f in col("false_record")], lower_is_better=True),
            "procedure_hallucination_rate": _rate([None if h is None else not h for h in col("hallucination")], lower_is_better=True),
            "backend_rejection_correctness": _rate(col("backend_ok")),
            "task_completion_rate": _rate(col("passed")),
        },
        "by_category": dict(by_cat),
        "failures": [
            {
                "scenario_id": sc["id"],
                "category": sc["category"],
                "utterance": sc["utterance"],
                "expected": sc["expect"],
                "actual": [{"tool": n, "error": res.get("error")} for n, _, res in calls] or "no tool call",
                "note": text[:200],
            }
            for sc, r, calls, text in results
            if not r["passed"]
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=os.environ.get("EVAL_MODEL", "claude-sonnet-4-6"))
    parser.add_argument("--out", type=Path, default=OUT)
    options = parser.parse_args()
    load_dotenv()  # same api/.env the server reads (app/main.py)
    key = os.environ.get("ASSEMBLYAI_API_KEY")
    if not key:
        raise SystemExit("ASSEMBLYAI_API_KEY is not set. Put it in api/.env or export it.")

    results = []
    for scenario in SCENARIOS:
        calls, text = converse(options.model, key, scenario)
        r = score(scenario, calls, text)
        results.append((scenario, r, calls, text))
        print(f"{'PASS' if r['passed'] else 'FAIL'}  {scenario['id']:<8} {scenario['utterance']}")

    metrics = aggregate(results, options.model)
    options.out.parent.mkdir(parents=True, exist_ok=True)
    options.out.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"\n{metrics['metrics']['task_completion_rate']['passed']}/{len(results)} passed -> {options.out}")


if __name__ == "__main__":
    main()
