"""Text-level evaluation: real system prompt + real tool schemas → LLM Gateway → real handlers.

    cd api && ASSEMBLYAI_API_KEY=... python -m eval.run [--model claude-sonnet-4-6]

Each complete run is written once to api/eval/runs/<run_id>.json and never
edited; web/public/metrics.json (latest) and web/public/eval-history.json (all
runs) are regenerated from it for the /reliability page. Only a complete run
writes anything — a gateway failure aborts rather than recording a
half-measured number (specs/003-post-mvp-features/contracts/eval-runs.md).
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
from app.resolve import readable_protocols, resolve_experiment
from app.tools.models import MUTATING_TOOLS, TOOL_REGISTRY, TOOL_SCOPE
from app.tools.prompt import build_desk_prompt, build_prompt
from app.tools.schemas import TOOL_SCHEMAS, tool_schemas
from tests.conftest import OWNER_ID, seeded_store

from .scenarios import SCENARIOS

GATEWAY = "https://llm-gateway.assemblyai.com/v1/chat/completions"
# The gateway takes OpenAI-nested tool schemas; the voice agent takes flat ones.

def gateway_tools(schemas):
    return [{"type": "function", "function": {k: s[k] for k in ("name", "description", "parameters")}} for s in schemas]


GATEWAY_TOOLS = gateway_tools(TOOL_SCHEMAS)
OPENING = [
    {"role": "user", "content": "Start experiment STAB-104."},
    {"role": "assistant", "content": "STAB-104 is running. Step 2 of 6: record initial temperature."},
]

UNIT_ALIAS = {"celsius": "c", "degrees celsius": "c", "°c": "c", "fahrenheit": "f", "grams": "g", "gram": "g"}
PUBLIC = Path(__file__).resolve().parents[2] / "web" / "public"
RUNS = Path(__file__).resolve().parent / "runs"
OUT = PUBLIC / "metrics.json"
HISTORY_KEYS = ("run_id", "generated_at", "git_sha", "model", "scenario_count", "metrics", "by_category")


def execute(sb, experiment, name, args):
    """What POST /tools does after auth — same registry, same models, same handlers."""
    if name not in TOOL_REGISTRY:
        return {"success": False, "error": "UNKNOWN_TOOL"}
    try:
        parsed = TOOL_REGISTRY[name][0](**args)
    except ValidationError:
        return {"success": False, "error": "INVALID_ARGS"}
    # Same scope routing as the dispatcher (app/routers/tools.py step 4).
    scope = TOOL_SCOPE[name]
    if scope == "experiment" and experiment is None:
        return {"success": False, "error": "EXPERIMENT_REQUIRED"}
    if scope == "experiment_ref":
        found = resolve_experiment(sb, OWNER_ID, parsed.experiment_ref)
        if "error" in found:
            return {"success": False, "error": found["error"], "message": found["message"], "detail": found["detail"]}
        experiment = found["experiment"]
    if scope == "user":
        experiment = None
    return getattr(handlers, name)(sb=sb, experiment=experiment, user_id=OWNER_ID, args=parsed, session_id="eval")


def session_for(sb, profile):
    """(experiment, system prompt, gateway tools, opening turns) for a scenario's profile."""
    if profile == "desk":
        open_runs = [e for e in sb.rows("experiments") if e.get("status") not in ("COMPLETED", "CANCELLED")]
        prompt = build_desk_prompt(readable_protocols(sb, OWNER_ID), open_runs)
        return None, prompt, gateway_tools(tool_schemas("desk")), []
    experiment = sb.rows("experiments")[0]
    ctx = ExperimentContext(experiment=experiment, protocol=sb.rows("protocols")[0], samples=sb.rows("samples"))
    return experiment, build_prompt(ctx), GATEWAY_TOOLS, OPENING


def converse(model, key, scenario):
    # ponytail: in-memory store driven by the real handlers — measures the
    # validation layer, not Postgres. Point at a disposable Supabase experiment
    # if database-level behaviour ever needs measuring too.
    sb = seeded_store()
    experiment, prompt, tools, opening = session_for(sb, scenario.get("profile", "bench"))
    for name, args in scenario.get("setup", []):
        execute(sb, experiment, name, args)

    messages = [
        {"role": "system", "content": prompt},
        *opening,
        *scenario.get("history", []),
        {"role": "user", "content": scenario["utterance"]},
    ]

    calls, text = [], ""
    for _ in range(4):  # the voice agent loops on tool results too
        response = httpx.post(
            GATEWAY,
            headers={"Authorization": key},  # raw key, not Bearer
            json={"model": model, "messages": messages, "tools": tools},
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


def _expected(expect):
    """Every call a scenario requires, as [(tool, args)]: one, several ("all"), or none."""
    if expect.get("all"):
        return [(e["tool"], e.get("args", {})) for e in expect["all"]]
    if expect.get("tool"):
        return [(expect["tool"], expect.get("args", {}))]
    return []


def score(scenario, calls, text):
    expect = scenario["expect"]
    writes = [name for name, _, result in calls if name in MUTATING_TOOLS and result.get("success")]
    wanted = _expected(expect)

    if wanted:
        selected = all(any(name == tool and result.get("success") for name, _, result in calls) for tool, _ in wanted)
        names = {tool for tool, _ in wanted}
        expected_writes = sum(1 for tool, _ in wanted if tool in MUTATING_TOOLS)
        false_record = any(name not in names for name in writes) or len(writes) > expected_writes
    else:
        selected = not writes
        false_record = bool(writes)

    def subset(*keys):
        checks = []
        for tool, args in wanted:
            picked = {k: v for k, v in args.items() if k in keys}
            if picked:
                checks.append(_matches(picked, tool, calls))
        return all(checks) if checks else None

    args_checks = [_matches(args, tool, calls) for tool, args in wanted if args]
    r = {
        "selected": selected,
        "false_record": false_record,
        "args_ok": all(args_checks) if args_checks else None,
        "sample_ok": subset("sample_code"),
        "value_ok": subset("value", "new_value"),
        "unit_ok": subset("unit"),
        "hallucination": None,
        "backend_ok": None,
    }
    entities = [r[k] for k in ("sample_ok", "value_ok", "unit_ok") if r[k] is not None]
    r["entity_ok"] = all(entities) if entities else None

    if expect.get("refuse"):
        # ponytail: string heuristic on the prompt's mandated refusal wording.
        # Swap for an LLM judge if phrasing drifts from the prompt.
        lowered = text.lower()
        r["hallucination"] = not ("approved protocol" in lowered or "verify the laboratory procedure" in lowered)
    if expect.get("error"):
        attempted = [result for _, _, result in calls if not result.get("success")] or [
            result for name, _, result in calls if name == "record_measurement"
        ]
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

    now = datetime.now(timezone.utc)
    sha = sha or "unknown"
    profiles = defaultdict(int)
    for sc, _, _, _ in results:
        profiles[sc.get("profile", "bench")] += 1

    return {
        "run_id": f"{now:%Y%m%dT%H%M%SZ}_{sha}",
        "generated_at": now.isoformat(timespec="seconds"),
        "scenario_count": len(results),
        "model": model,
        "git_sha": sha,
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
            "unit_accuracy": _rate(col("unit_ok")),
            "entity_accuracy": _rate(col("entity_ok")),
        },
        "by_category": dict(by_cat),
        "profile_counts": dict(profiles),
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
        # Every scenario, passes included: a drill-down of failures alone reads
        # as a bug list, not a measurement (Constitution Principle V).
        "details": [
            {
                "scenario_id": sc["id"],
                "category": sc["category"],
                "profile": sc.get("profile", "bench"),
                "utterance": sc["utterance"],
                "expected": sc["expect"],
                "passed": bool(r["passed"]),
                "calls": [
                    {"tool": n, "args": a, "success": bool(res.get("success")), "error": res.get("error")}
                    for n, a, res in calls
                ],
                "reply": text[:500],
            }
            for sc, r, calls, text in results
        ],
    }


def write_run(metrics, runs_dir=RUNS, public_dir=PUBLIC, latest=None):
    """Persist one run immutably, then regenerate the two files the page reads."""
    runs_dir, public_dir = Path(runs_dir), Path(public_dir)
    runs_dir.mkdir(parents=True, exist_ok=True)
    public_dir.mkdir(parents=True, exist_ok=True)

    body = json.dumps(metrics, indent=2)
    with open(runs_dir / f"{metrics['run_id']}.json", "x", encoding="utf-8") as fh:  # "x": never overwrite
        fh.write(body)

    Path(latest or public_dir / "metrics.json").write_text(body, encoding="utf-8")

    history = []
    for path in sorted(runs_dir.glob("*.json")):  # run_id starts with a UTC timestamp: name order is time order
        run = json.loads(path.read_text(encoding="utf-8"))
        history.append({k: run.get(k) for k in HISTORY_KEYS})
    (public_dir / "eval-history.json").write_text(json.dumps(history, indent=2), encoding="utf-8")


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
    write_run(metrics, latest=options.out)
    print(f"\n{metrics['metrics']['task_completion_rate']['passed']}/{len(results)} passed -> {options.out}")


if __name__ == "__main__":
    main()
