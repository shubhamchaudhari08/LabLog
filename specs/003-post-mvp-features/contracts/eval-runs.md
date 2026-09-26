# Contract: Eval run files (additive amendment to 001 `eval-metrics.md`)

**Status**: DRAFT · **Producer**: `api/eval/run.py` · **Consumer**: `web/app/(app)/reliability/page.tsx`

The 001 `metrics.json` shape is **unchanged, and every existing key keeps its meaning**. This contract adds fields and files only.

## Files

| Path | Written | Mutable? | Committed? |
|---|---|---|---|
| `api/eval/runs/<yyyymmddTHHMMSSZ>_<sha>.json` | once per **complete** run | **Never** | Yes |
| `web/public/metrics.json` | every run (a copy of the newest run file) | regenerated | Yes |
| `web/public/eval-history.json` | every run (a summary of all run files) | regenerated | Yes |

A partial run (gateway failure) writes **nothing**. This is 001 behaviour, preserved.

## Additions to the run record

- `run_id` (string, = file stem)
- `metrics.unit_accuracy`: scenarios whose expected args include `unit`. Passes when the stored unit matches after normalisation.
- `metrics.entity_accuracy`: scenarios naming any of sample, value or unit. Passes when **all** named entities match.
- `metrics.comparison_exactness`: scenarios with `expect.result`. Passes when the tool result matches **and** every `expect.spoken` string appears in the reply.
- `profile_counts`: scenario count per profile.
- `details[]`: one entry per scenario, **passes included** (shape: data-model §6).

## `eval-history.json`

```jsonc
[
  { "run_id": "…", "generated_at": "…", "git_sha": "abc1234", "model": "…",
    "scenario_count": 63, "metrics": { /* same as run */ }, "by_category": { /* same */ } }
]
```

The array is ordered oldest first. The page draws the trend from it without re-deriving anything.

## Page obligations

- Every figure shown is read from these files. No figure is computed client-side except the display formatting, and the percentage of a pass/total pair already in the file.
- Export JSON is the run file verbatim. Export CSV has one row per `details[]` entry: `scenario_id, category, profile, utterance, passed, tools, errors, reply`.
- Failures and passes are both shown (Principle V).
