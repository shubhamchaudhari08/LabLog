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
import inspect
import json
import os
import re
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
from tests.conftest import OWNER_ID, PROTOCOL_STEPS, seed_history, seeded_store

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


def execute(sb, experiment, name, args, tz="UTC"):
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
    handler = getattr(handlers, name)
    # tz only for handlers that declare it, as the dispatcher does (specs/006 contract §1).
    extra = {"tz": tz} if "tz" in inspect.signature(handler).parameters else {}
    return handler(sb=sb, experiment=experiment, user_id=OWNER_ID, args=parsed, session_id="eval", **extra)


def session_for(sb, profile):
    """(experiment, system prompt, gateway tools, opening turns) for a scenario's profile."""
    if profile == "desk":
        open_runs = [e for e in sb.rows("experiments") if e.get("status") not in ("COMPLETED", "CANCELLED")]
        prompt = build_desk_prompt(readable_protocols(sb, OWNER_ID), open_runs)
        return None, prompt, gateway_tools(tool_schemas("desk")), []
    experiment = sb.rows("experiments")[0]
    protocol = sb.rows("protocols")[0]
    ctx = ExperimentContext(experiment=experiment, protocol=protocol, samples=sb.rows("samples"))
    return experiment, build_prompt(ctx), GATEWAY_TOOLS, _opening(experiment, protocol)


def _opening(experiment, protocol):
    """The fixed MVP opening, unless a scenario moved the run (specs/004 `steps` / `at_step`)."""
    steps, index = protocol.get("steps") or [], experiment.get("current_step_index", 0)
    if steps is PROTOCOL_STEPS and index == 1:
        return OPENING
    step = steps[index] if 0 <= index < len(steps) else None
    where = f" Step {index + 1} of {len(steps)}: {step['name']}." if step else ""
    return [OPENING[0], {"role": "assistant", "content": f"STAB-104 is running.{where}"}]


def converse(model, key, scenario):
    # ponytail: in-memory store driven by the real handlers — measures the
    # validation layer, not Postgres. Point at a disposable Supabase experiment
    # if database-level behaviour ever needs measuring too.
    sb = seeded_store()
    if scenario.get("history_runs"):  # specs/006: previous runs to search and compare
        seed_history(sb)
    # specs/004: a scenario may run against other protocol steps or another
    # current step. Applied before session_for so the prompt reflects it.
    if scenario.get("steps"):
        sb.rows("protocols")[0]["steps"] = scenario["steps"]
    if "at_step" in scenario:
        sb.rows("experiments")[0]["current_step_index"] = scenario["at_step"]
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
            data = result.get("data") or {}
            # A timer result nests the stored timer (specs/004 contracts/tools-step-timer.md).
            stored = {**args, **data, **(data.get("timer") or {})}
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


def _is_write(name, args, result):
    """A successful mutating call. step_timer status is a read (specs/004 T037)."""
    if name == "step_timer" and (args or {}).get("action") == "status":
        return False
    return name in MUTATING_TOOLS and bool(result.get("success"))


def score(scenario, calls, text):
    expect = scenario["expect"]
    writes = [name for name, args, result in calls if _is_write(name, args, result)]
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
    if "offer" in expect:
        # specs/004 FR-309: did the agent offer a timer, and start nothing? ("timed"
        # does not contain "timer", so "that step is timed" is not an offer.)
        started = any(
            name == "step_timer" and (args or {}).get("action") == "start" and result.get("success")
            for name, args, result in calls
        )
        r["offer_ok"] = ("timer" in text.lower()) == expect["offer"] and not (expect["offer"] and started)

    if "spoken" in expect:
        # specs/006 SC-401: the reply says what was expected, and every number in it
        # came from the backend's comparison, not from the model's arithmetic.
        comparison = next(
            (res["data"]["comparison"] for name, _, res in reversed(calls)
             if name == "get_sample_history" and res.get("success") and "comparison" in res.get("data", {})),
            None,
        )
        r["spoken_ok"] = all(word.lower() in text.lower() for word in expect["spoken"])
        r["numbers_ok"] = comparison is not None and set(_spoken_numbers(text)) <= _allowed_numbers(comparison)

    r["passed"] = (
        selected
        and r["args_ok"] is not False
        and not false_record
        and not r["hallucination"]
        and r.get("offer_ok") is not False
        and r.get("spoken_ok") is not False
        and r.get("numbers_ok") is not False
    )
    return r


# ponytail: regex number check; an LLM judge if phrasing drifts. The lookarounds
# skip digits inside codes (A17, STAB-102, CONTROL-01).
_NUMBER = re.compile(r"(?<![\w.-])\d+(?:\.\d+)?(?![\w-])")


def _spoken_numbers(text):
    return [n.rstrip("0").rstrip(".") if "." in n else n for n in _NUMBER.findall(text)]


def _allowed_numbers(comparison):
    values = [comparison.get(k) for k in ("current", "previous", "magnitude")]
    values.append(abs(comparison["pct"]) if comparison.get("pct") is not None else None)
    for key in ("current_step", "previous_step"):
        if comparison.get(key):
            values.append(comparison[key]["index"] + 1)
    allowed = set()
    for v in values:
        if v is not None:
            text = f"{v:g}" if isinstance(v, float) else str(v)
            allowed.add(text)
    return allowed


# Categories added after the baseline, left out of by_profile so it stays comparable.
NEW_CATEGORIES = ("timer", "search", "comparison")


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
            # specs/006 SC-401: said the expected words, and only the backend's numbers.
            "comparison_exactness": _rate(
                [r.get("spoken_ok") is not False and r.get("numbers_ok") is not False
                 for sc, r, _, _ in results if sc["category"] == "comparison"]
            ),
        },
        "by_category": dict(by_cat),
        "profile_counts": dict(profiles),
        # Constitution amendment A-1: a grown profile's own selection accuracy must
        # not drop. Timer scenarios are excluded so the figure covers the same
        # scenario set as runs before specs/004 (T012a); specs/006's search and
        # comparison likewise, reported under by_category instead.
        "by_profile": {
            profile: _rate(
                [r["selected"] for sc, r, _, _ in results
                 if sc.get("profile", "bench") == profile and sc["category"] not in NEW_CATEGORIES]
            )
            for profile in profiles
        },
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
