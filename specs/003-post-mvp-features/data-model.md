# Data Model: Post-MVP Product Features

**Additive only.** No table is dropped, no column is removed, and no existing column changes meaning. The baseline is `supabase/migrations/0001_init.sql` + `0002_protocol_events.sql`.

## 1. Schema changes: migration `0003_post_mvp.sql`

```sql
-- Phase D: previous-run lookup (R-207)
create index if not exists experiments_prev_run_idx
  on experiments (protocol_id, owner_id, status, completed_at desc);

-- Phase E: search sub-queries (R-208)
create index if not exists samples_code_idx      on samples (sample_code);
create index if not exists deviations_exp_idx    on deviations (experiment_id);
create index if not exists experiments_owner_created_idx
  on experiments (owner_id, created_at desc);

-- Realtime: the workspace reflects samples added mid-run (R-209)
alter publication supabase_realtime add table samples;
```

Nothing else changes. No `eval_runs` table (R-203), no `v_experiment_stats` view (R-211), and no `experiments.vocabulary` column, because vocabulary is derived (§4).

## 2. Experiment lifecycle

```text
                 create_experiment (no protocol)
   (none) ───────────────────────────────────────► DRAFT
     │                                               │ associate_protocol
     │  create_experiment (protocol resolved)        ▼
     └─────────────────────────────────────────────► READY ◄─┐ associate_protocol (re-associate)
                                                     │        │
                                  start_experiment   │────────┘
                                  (confirmed=true)   ▼
   DRAFT ── write_protocol_step(new_protocol) ────► RUNNING ── complete_experiment ──► COMPLETED
            [PROTECTED P-1, unchanged]
```

| Transition | Guard | Error when violated |
|---|---|---|
| → DRAFT/READY | `confirmed=true`, name 1–200 chars, protocol resolves if given | `NEEDS_CONFIRMATION`, `INVALID_ARGS`, `PROTOCOL_NOT_FOUND`, `AMBIGUOUS_PROTOCOL` |
| DRAFT/READY → READY | the experiment is not started | `EXPERIMENT_ALREADY_STARTED` |
| READY → RUNNING | `confirmed=true`; `protocol_id` is set; status is READY | `NEEDS_CONFIRMATION`, `NO_PROTOCOL`, `INVALID_STATE` |

Server-written fields: `experiment_code` (R-205), `owner_id` (the verified caller), `status`, `started_at`, `current_step_index`, `created_at`, and `updated_at` (trigger).

## 3. New event types (the `events.event_type` vocabulary is extended; no column changes)

| event_type | entity_type | entity_id | payload |
|---|---|---|---|
| `EXPERIMENT_CREATED` | experiment | experiment id | `{experiment_code, name, protocol_id, status}` |
| `PROTOCOL_ASSOCIATED` | experiment | experiment id | `{protocol_id, protocol_code, previous_protocol_id, status_from, status_to}` |
| `EXPERIMENT_STARTED` | experiment | experiment id | `{protocol_id, status_from: "READY"}` |
| `SAMPLE_CREATED` | sample | sample id | `{sample_code, sample_type, source: "voice" \| "ui"}` |

`experiment_id` is always set on these rows. `actor_id` is the caller. `voice_session_id` is set when the change came from `/tools`. Reads (`list_protocols`, `search_experiments`, `compare_with_previous_run`) write no events, as with the existing `get_*` tools.

**Invariant, extended**: every `experiments` row created by 003 has ≥1 `EXPERIMENT_CREATED` event. Every `samples` row created by 003 has a `SAMPLE_CREATED` event. The quickstart §5 query asserts both.

## 4. Derived structures (no storage)

### Tool profile (R-201)

```python
Profile = Literal["desk", "setup", "bench"]

def profile_for(experiment: dict | None) -> Profile:
    if experiment is None:                                  return "desk"
    if experiment["status"] in ("DRAFT", "READY"):          return "setup"
    return "bench"
```

`PROFILES: dict[Profile, tuple[str, ...]]` lives in `tools/models.py` beside `TOOL_REGISTRY`, and every name in it must be a registry key (asserted by test). `TOOL_SCHEMAS` becomes `tool_schemas(profile)`. The bench schema list must equal today's `TOOL_SCHEMAS` + `compare_with_previous_run` (regression test).

### Vocabulary set (Phase F)

This is not persisted. It is derived per request by `build_keyterms(ctx)` (existing, PROTECTED P-3) and extended in order: sample codes → experiment code → **protocol step names** (new) → vocabulary terms → fixed words, then truncated to 100. Desk mode uses protocol codes and names readable by the user, followed by vocabulary terms.

## 5. Tool argument models (Pydantic, `extra="forbid"`, no time fields)

```python
class ListProtocolsArgs(_Args):
    pass                                              # alias of NoArgs, kept distinct for the registry

class CreateExperimentArgs(_Args):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    protocol_ref: str | None = None                   # code, name, or "name version"
    sample_codes: list[str] | None = Field(None, max_length=50)
    confirmed: bool = Field(..., description="True only after the user confirmed out loud.")

class AssociateProtocolArgs(_Args):
    experiment_ref: str | None = None                 # code or name; defaults to the bound experiment
    protocol_ref: str

class StartExperimentArgs(_Args):
    experiment_ref: str | None = None
    confirmed: bool

class CompareWithPreviousRunArgs(_Args):
    sample_ref: str | None = None
    measurement_type: str | None = None

class SearchExperimentsArgs(_Args):
    protocol_ref: str | None = None
    status: Literal["DRAFT","READY","RUNNING","PAUSED","COMPLETED","CANCELLED"] | None = None
    date_range: Literal["today","yesterday","this_week","last_week","this_month"] | None = None
    has_deviations: bool | None = None
    contains_sample: str | None = None
    measurement_type: str | None = None
    free_text: str | None = Field(None, max_length=100)
```

Registry `scope` (R-204): `list_protocols`, `search_experiments` and `create_experiment` are `user`. `associate_protocol` and `start_experiment` are `experiment_ref`. `compare_with_previous_run` and all 11 existing tools are `experiment`. `MUTATING_TOOLS` is unchanged. Lifecycle tools enforce their own status guards, as `write_protocol_step` already does.

## 6. Eval run record (file, R-203)

`api/eval/runs/<yyyymmddTHHMMSSZ>_<sha>.json` has the 001 `metrics.json` shape (PROTECTED contract) **plus** these fields:

```jsonc
{
  "run_id": "20260926T031500Z_abc1234",
  "profile_counts": { "desk": 9, "setup": 6, "bench": 48 },
  "metrics": { /* existing nine */, "unit_accuracy": {...}, "comparison_exactness": {...} },
  "by_category": { /* existing */ },
  "failures": [ /* existing */ ],
  "details": [
    { "scenario_id": "norm_01", "category": "normal_capture", "profile": "bench",
      "utterance": "...", "expected": {...}, "passed": true,
      "calls": [{ "tool": "record_measurement", "args": {...}, "success": true, "error": null }],
      "reply": "Recorded. A17 temperature is 4.2 degrees Celsius." }
  ]
}
```

`web/public/eval-history.json` is `[{run_id, generated_at, git_sha, model, scenario_count, metrics, by_category}]`, oldest first, and is regenerated from the run directory on every eval run. Run files are never edited after they are written.

## 7. Scenario shape (extended, backwards-compatible)

Existing keys are unchanged. New optional keys:
- `profile`: `"desk" | "setup" | "bench"` (default `"bench"`). This selects the prompt and tool schemas and the seeded context. `desk` has no experiment. `setup` has a DRAFT experiment named `STAB-DRAFT`.
- `expect.result`: a dict of exact values the tool **result** must contain (for example `{"delta": -0.3, "pct": -6.5}`), used by `comparison_exactness`.
- `expect.spoken`: a list of strings that must appear in the agent's reply (for example `["-0.3"]`, or with the sign rendered as words by a normaliser). This asserts that the agent narrates the backend's number.
