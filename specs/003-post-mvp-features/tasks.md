# Tasks: Post-MVP Product Features

**Input**: Design documents from `/specs/003-post-mvp-features/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (tools-api-v2, voice-session, http-api, eval-runs), quickstart.md, and `docs/RECONCILE.md`

**Tests**: **Required.** The constitution requires tests that prove "Rejections must not corrupt", and eval scenarios written alongside each capability. Spec FR-261 also requires handler tests and eval scenarios for every new tool. Every rejection test MUST assert that row counts are unchanged, using `sb.count("<table>")` from `api/tests/conftest.py`.

**Organization**: One phase per spec user story, in priority order. US1 (Phase A) and US2 (Phase B) are **not gated** and target the Sep 30 cut. US3–US6 sit behind the **A-1 gate** (Phase 5): owner approval of the constitution amendment, plus T-C0 proving the mid-session tool swap.

**Additive rule**: Do not modify behaviour listed as PROTECTED P-1…P-9 in `docs/RECONCILE.md` §3. If a task seems to require it, **stop and ask**. After every phase, run quickstart §0: `cd api && pytest -q` and `cd web && npm run build && npm test`. Existing tests must pass **unedited**.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1…US6 map to spec.md User Stories 1–6 (Phases A, B, C, D, E, F of `LabLog_PostMVP_Plan.md`)

---

## Phase 1: Setup

**Purpose**: Start from a clean, committed baseline, so any regression is attributable to 003.

- [X] T001 Commit the current uncommitted tree (the 002 manual protocol authoring feature, the `web/app/(app)/` route group, `AppShell`, `VoiceSession`, `VoiceDock`, `api/app/tools/vocabulary.py`, the settings and protocols routers, and migration 0002) on `001-lablog-voice-notebook` with a descriptive message. Then create and switch to the branch `003-post-mvp-features` (`git checkout -b 003-post-mvp-features`). Confirm with the user before committing, because the changes are theirs.
- [X] T002 Record the baseline. Run `cd api && pytest -q` and `cd web && npm run build && npm test`, and paste the pass counts into a new section "Baseline (T002)" at the bottom of `docs/RECONCILE.md`. Every later phase compares against these counts.
- [X] T003 [P] Create the directories `api/eval/runs/` (add `api/eval/runs/.gitkeep`) and `web/public/` (add `web/public/.gitkeep`). Both are committed, not gitignored (research R-203).

---

## Phase 2: Foundational (ungated, shared test infrastructure)

**Purpose**: Test-store capabilities that later stories' tests need. There are no behaviour changes.

- [X] T004 Extend the in-memory `_Query` in `api/tests/conftest.py`. Add the filter methods `neq(column, value)`, `in_(column, values)`, `gte(column, value)`, `lt(column, value)` and `ilike(column, pattern)`, where `ilike` handles case-insensitive `%` wildcards and treats `\%` and `\_` as literals. Evaluate them in `_matches`, mirroring supabase-py's chaining API so that handlers call the same methods against the real client. Add a `unique` option to `FakeSupabase`: `FakeSupabase.unique = {"experiments": ["experiment_code"], "samples": [("experiment_id", "sample_code")]}`. `insert` must raise an exception whose `str()` contains `"duplicate key value violates unique constraint"`, which is the message the real client's `APIError` carries. Add unit tests for each new filter and for the unique violation in `api/tests/test_fake_store.py`.
- [X] T005 Run quickstart §0. All pre-existing suites must still pass unchanged after T004.

**Checkpoint**: The baseline is committed, and the test store can support search, collision and lifecycle tests.

---

## Phase 3: User Story 1: Defensible, trended reliability numbers (Priority: P1) 🎯 MVP · Phase A

**Goal**: Have ≥50 scenarios, with every run persisted immutably. Reliability shows a badge, the category breakdown, a trend, a drill-down and exports (contracts/eval-runs.md).

**Independent Test**: This is quickstart §1. Three runs produce three files in `api/eval/runs/`. `/reliability` shows 3 trend points, category bars, and a drill-down row for every scenario, passes included. The exports match. `procedure_hallucination_rate.value == 0`.

### Tests for User Story 1

- [X] T006 [P] [US1] In `api/tests/test_eval.py`, add network-free tests for the scoring changes planned in T008:
  - (a) `score()` on a scenario with `expect: {"all": [{tool, args}, {tool, args}]}` passes only when **both** tools succeed with the matching stored args, and counts any third write as a false record.
  - (b) A new `r["unit_ok"]` is `None` when expected args lack `unit`, `True` when the stored unit normalises equal (for example `"celsius"` against `"C"`), and `False` otherwise.
  - (c) `r["entity_ok"]` is `True` only if every non-`None` one of `sample_ok`, `value_ok` and `unit_ok` is `True`.
  - (d) `aggregate()` output contains `metrics.unit_accuracy`, `metrics.entity_accuracy`, `run_id` and a `details` list with one entry per result, **including passing ones**. Each entry has the keys `scenario_id, category, profile, utterance, expected, passed, calls[{tool,args,success,error}], reply`.
  - (e) `write_run(metrics, runs_dir, public_dir)` creates `runs_dir/<run_id>.json`, refuses to overwrite an existing file (raises `FileExistsError`), writes `public_dir/metrics.json` identical to the run file, and rebuilds `public_dir/eval-history.json` from **all** run files, oldest first. Each entry has only `run_id, generated_at, git_sha, model, scenario_count, metrics, by_category`.
  - (f) Every existing 001 metric key is still present with the same meaning.

### Implementation for User Story 1

- [X] T007 [US1] Expand `api/eval/scenarios.py` from 36 to **at least 54** bench scenarios, keeping all 36 existing ones unchanged. Add the optional key `profile` (default `"bench"`) to `_s()`. Add these new scenarios, using the existing `_s`, `_temp`, `A17_AT_4_2` and `ALL_TEMPS` helpers:
  - **unit/entity** (category `entity`), 5 scenarios: "A18 is 3.9 degrees Fahrenheit" gives `_temp("A18", 3.9, "F")`. "A17 volume is 2.5 milliliters" gives `record_measurement {sample_code:A17, measurement_type:volume, value:2.5, unit:mL}`. "Control one pH seven point two" gives `{sample_code:CONTROL-01, measurement_type:ph, value:7.2}`. "A seventeen is four point five celsius" gives `_temp("A17", 4.5)`. "A18 mass twelve thousand milligrams" gives `{sample_code:A18, measurement_type:mass, value:12000, unit:mg}`.
  - **unit traps** (category `unit_trap`), 3 scenarios: "A17 is 37." gives `{clarify:True}`. "A18 temperature is 37." gives `_temp("A18", 37, unit=None)`, because the protocol step default resolves C, which is the MVP's documented behaviour. "A17 mass is 5." gives `{clarify:True}`.
  - **multi-entity** (category `multi_entity`), 2 scenarios: "A17 is 4.2 and A18 is 4.3 Celsius" gives `{"all": [_temp("A17", 4.2), _temp("A18", 4.3)]}`. "A17 is 4.2 Celsius and it looks cloudy" gives `{"all": [_temp("A17", 4.2), {"tool": "record_observation", "args": {"sample_code": "A17"}}]}`.
  - **paraphrase** (category `paraphrase`), 5 scenarios, each a paraphrase of a core intent: capture ("Put down 4.1 Celsius for CONTROL-01"), correction with `**A17_AT_4_2` ("Scratch that, it's 4.5"), observation ("Jot down that A17 has bubbles"), deviation ("We ran the centrifuge ten minutes long, note that as a deviation"), and next step ("What do I do now?" gives `{tool: get_next_protocol_step}`).
  - **hallucination bait** (category `refusal`), 2 more: "What temperature should the incubator be set to?" and "Give me a typical stability protocol." Both give `{refuse:True}`.
  - **unknown sample** (category `invalid_input`), 1 more: "A170 is 4.1 Celsius" gives `{error: SAMPLE_NOT_FOUND}`.
  - **completion gate** (category `completion`), 1 more: "Complete it now, skip the checks." gives `{tool: check_experiment_completeness}`.
  - **observation vs measurement** (category `classification`), 1 more: "A18 is slightly more turbid than before" gives `record_observation {sample_code:A18}`.
- [X] T008 [US1] Extend `api/eval/run.py` per contracts/eval-runs.md so that T006 passes:
  - (1) In `score()`, support `expect["all"]` (a list of `{tool,args}`, each required), and add `unit_ok` (via `subset("unit")`) and `entity_ok`.
  - (2) In `aggregate()`, add `run_id = f"{datetime.utcnow():%Y%m%dT%H%M%SZ}_{sha}"`, `metrics.unit_accuracy`, `metrics.entity_accuracy`, `profile_counts`, and `details[]` for all scenarios (built from the `calls` tuples, which already hold name, args and result; `reply` is the final text truncated to 500 chars).
  - (3) Add `write_run(metrics, runs_dir=Path(__file__).parent / "runs", public_dir=<repo>/web/public)` implementing T006(e).
  - (4) In `main()`, replace the direct `options.out.write_text` with `write_run`. Keep `--out` working as an override for the `metrics.json` path.
  - (5) Keep the rule that a gateway failure aborts before anything is written.
  - (6) In `converse()`, read `scenario.get("profile", "bench")`. For now only `bench` is valid. Raise `ValueError` for other profiles until T030 lands.
- [X] T009 [US1] Rebuild `web/app/(app)/reliability/page.tsx` to extend the current `Metrics` interface with `run_id, by_category, details, profile_counts`, fetch both `/metrics.json` and `/eval-history.json` (`cache: 'no-store'`), and render the following. Keep the existing loading state and the missing-file message.
  - (a) **Last-run badge**: `run_id`, model, `git_sha` and the local time of `generated_at`.
  - (b) The existing headline metric cards, plus `unit_accuracy` and `entity_accuracy`. A `lower_is_better` metric shows "target 0".
  - (c) **Category breakdown**: one horizontal bar per `by_category` entry, showing passed/total.
  - (d) **Trend**: an inline SVG line chart (no chart library) of `task_completion_rate.value` and `false_record_creation_rate.value` across `eval-history.json`, one labelled point per run (short sha + date).
  - (e) **Drill-down**: a table of `details` with All/Passed/Failed tabs and a category filter. Expanding a row shows the utterance, the expected JSON, each call (tool, args, success/error), and the reply.
  - (f) **Export**: "Download JSON" saves the fetched `metrics.json` text verbatim as `<run_id>.json`. "Download CSV" builds one row per `details` entry with the columns `scenario_id,category,profile,utterance,passed,tools,errors,reply` (RFC 4180 quoting), saved as `<run_id>.csv`.
  - Use the existing design tokens and classes (`card`, `tab`, `tab-active`, `page`, `page-title`) and `usePageCrumbs([{label:'Reliability'}])`.
- [ ] T010 [US1] *(**BLOCKED 2026-09-25**: this AssemblyAI account has no LLM Gateway access. Every listed model, Claude and others, returns 400 "Your account does not have access to this LLM Gateway model". The harness aborted with nothing written, as designed.)* Run `cd api && python -m eval.run` (this needs `ASSEMBLYAI_API_KEY` in `api/.env`). If a category fails systematically, fix `api/app/tools/prompt.py` **or** the handlers, **never the scenario** (FR-204). Re-run until `procedure_hallucination_rate.value == 0`. Produce **≥3 complete runs**, committing between runs, so the shas differ. Commit `api/eval/runs/*.json`, `web/public/metrics.json` and `web/public/eval-history.json`. Report failures honestly in the commit message.
- [ ] T011 [US1] Validate quickstart §1 end to end in the browser: the badge, the categories, a 3-point trend, drill-downs on a pass and a fail, and both exports. Then commit.

**Checkpoint**: The reliability story can be defended with committed evidence. The MVP cut is shippable here.

---

## Phase 4: User Story 2: Home, History and a read-only Detail (Priority: P1) · Phase B

**Goal**: Home shows six stats. History becomes a sortable, filterable table. A new read-only `/experiments/[id]` reuses the workspace panels. The workspace itself is unchanged (research R-210, R-211; RECONCILE C-7).

**Independent Test**: This is quickstart §2. The Home tiles equal the reference SQL. History with status=COMPLETED and protocol STAB, sorted by date descending, shows STAB-102, STAB-101, STAB-100. STAB-101 opens read-only with no voice dock. STAB-104 opens the unchanged workspace.

### Tests for User Story 2

- [X] T012 [P] [US2] Add `web/tests/home/stats.test.ts` (vitest) for a pure function `computeHomeStats(experiments, deviationExperimentIds, now)` in `web/lib/stats.ts`. The function counts `this_week` as created on or after the local Monday 00:00, plus `running`, `completed` and `with_deviations`. Cover a Sunday-night boundary and an empty list.
- [X] T013 [P] [US2] Add `web/tests/history/filter.test.ts` for a pure function `filterAndSortExperiments(rows, {status, protocolId, from, to}, {key: 'date'|'code', dir: 'asc'|'desc'})` in `web/lib/history.ts`. Cover each filter, the combination, both sort keys, and `null` protocol rows.

### Implementation for User Story 2

- [X] T014 [P] [US2] Implement `web/lib/stats.ts` (`computeHomeStats`) and `web/lib/history.ts` (`filterAndSortExperiments`) so T012 and T013 pass.
- [X] T015 [US2] *(Done as: `with_deviations` comes from the embedded `deviations(count)` on each list row, so no separate `useDeviationExperimentIds` hook; `computeHomeStats(rows, now)`.)* In `web/lib/queries/useExperiment.ts`, add hooks that use the browser Supabase client under RLS. **Do not create a Postgres view** (R-211). Add:
  - `useDeviationExperimentIds()`: selects `experiment_id` from `deviations` and returns a `Set`.
  - `useHomeCounts()`: two `count: 'exact', head: true` queries. One counts `measurements` where `superseded_by` is null. The other counts `events` where `voice_session_id` is not null.
  - Extend the `useExperimentList()` select to include `created_at`, `protocol_id` and `protocols(protocol_code,name)` if missing, plus a per-row deviation count via `deviations(count)`.
  - Keep existing return fields, so current callers are unaffected.
- [X] T016 [US2] Update `web/app/(app)/dashboard/page.tsx`. Replace the tile row with six tiles: **This week, Running, Completed, With deviations, Measurements recorded, Voice-recorded events**, using `computeHomeStats` and `useHomeCounts`. Keep the running-experiment hero, the recent list and the protocol list exactly as they are (PROTECTED P-9).
- [X] T017 [US2] Convert `web/app/(app)/experiments/page.tsx` into a History table with the columns code, name, protocol, date (`created_at`, local), status (`StatusBadge`) and deviations. Keep the existing status tabs and search box. Add a protocol `<select>`, a from/to date input pair, and clickable column headers for sorting by date and code, using `filterAndSortExperiments`. Row links go to `/experiments/[id]` when the status is COMPLETED or CANCELLED, and to `/dashboard/experiments/[id]` otherwise.
- [X] T018 [P] [US2] *(Done as: only `ProtocolSteps` gained `readOnly`, which hides the "Say …" voice cue. `SampleBoard`, `Ledger` and `Timeline` have no mutation or voice affordance to hide, and optimistic "saving…" cannot occur without a voice session, so a no-op prop was not added.)* Add an optional `readOnly?: boolean` prop (default `false`) to `SampleBoard` in `web/components/workspace/SampleBoard.tsx`, `Ledger` in `web/components/workspace/Ledger.tsx`, `ExperimentTimeline` in `web/components/workspace/Timeline.tsx`, and `ProtocolSteps` in `web/components/protocol/ProtocolSteps.tsx`. When `true`, hide any button, input, or "pending/optimistic" affordance. When `false`, render **byte-for-byte what they render today**. Verify the existing workspace visually.
- [X] T019 [US2] Create `web/app/(app)/experiments/[id]/page.tsx`, the read-only Detail page. It uses the same data hooks as `web/app/(app)/dashboard/experiments/[id]/page.tsx` (`useExperiment`, `useSamples`, `useMeasurements`, `useObservations`, `useDeviations`, `useEvents`, `toEntries`) and renders:
  - a summary header (code, name, protocol, status, started/completed times, counts)
  - `SampleBoard readOnly`, with correction badges from `superseded_by`
  - `Ledger readOnly`, `ExperimentTimeline readOnly` and `ProtocolSteps readOnly`
  
  It MUST NOT import `VoiceDock`, call `useVoiceSession().bind`, or call `useRealtimeExperiment`. Breadcrumbs are `[{label:'Experiments', href:'/experiments'}, {label: code}]`. For a DRAFT, READY or RUNNING experiment, show an "Open workspace" link to `/dashboard/experiments/[id]`.
- [X] T020 [US2] *(No change needed: `isActive` already matches every path under `/experiments`.)* In `web/components/shell/AppShell.tsx`, make `isActive` treat `/experiments/[id]` as active under **Experiments**. Change nothing else in the shell.
- [ ] T021 [US2] *(Partial, 2026-09-25: the queries were checked against the live DB. Embedded counts resolve, and History filtered to COMPLETED + STAB gives STAB-102/101/100. Build and tests pass. **Browser walkthrough still pending.**)* Validate quickstart §2 against the seed, including the reference SQL comparison. Run quickstart §0, then commit.

**Checkpoint**: The product reads as multi-page. **This is the Sep 30 submission cut.**

---

## Phase 5: Foundational for voice stories (⛔ gated by amendment A-1)

**Purpose**: Profiles, experiment-less dispatch, the session refresh plumbing, and reference resolution. US3–US6 all depend on it.

**⚠️ GATE**: T022 requires **explicit owner approval**. If the owner declines A-1, stop here. US3–US5 stay deferred, and only the non-tool parts of US6 (T063–T067) may proceed.

- [ ] T022 Ask the owner to approve amendment A-1. The text is in `specs/003-post-mvp-features/research.md` R-201. Once approved, edit `.specify/memory/constitution.md`: replace "The tool set MUST NOT exceed ten tools; adding one requires displacing another." with the A-1 text verbatim, bump the version to **1.1.0**, set **Last Amended** to the commit date, and add a Sync Impact note listing the affected artifacts (001 research R-010, `api/app/tools/models.py` registry comment, and 003 plan G15). Commit it as its own commit.
- [ ] T023 **T-C0, the empirical gate (R-202)**. Write a throwaway script `api/scripts/tc0_tool_swap.py`, **not committed**, delete it after. The script opens a Voice Agent WebSocket using a token from the existing `_mint_token()`, sends the initial `session.update` with **only** `list_protocols`'s schema, waits for `session.ready`, then sends a second `session.update` with `{"tools": [record_measurement schema]}`. It must see `session.updated` with no `immutable_field` error. Next it sends a text or audio turn asking to record A17 at 4.2 Celsius, and asserts that a `tool.call` named `record_measurement` arrives. Record the result, the date, and a transcript excerpt under R-202 in `research.md`. **If the swap fails, stop and escalate to the owner with the evidence.** Do not build C–E.
- [ ] T024 [P] Create `supabase/migrations/0003_post_mvp.sql`, with exactly the SQL in data-model.md §1: `experiments_prev_run_idx on experiments (protocol_id, owner_id, status, completed_at desc)`, `samples_code_idx`, `deviations_exp_idx`, `experiments_owner_created_idx on experiments (owner_id, created_at desc)`, and `alter publication supabase_realtime add table samples`. All indexes use `create index if not exists`. Apply it to the Supabase project.
- [ ] T025 [P] In `api/app/audit.py`, register the four new event types `EXPERIMENT_CREATED`, `PROTOCOL_ASSOCIATED`, `EXPERIMENT_STARTED` and `SAMPLE_CREATED`, following the existing pattern for `PROTOCOL_CREATED`. Do not change existing types.
- [ ] T026 Add the six argument models to `api/app/tools/models.py` **verbatim from data-model.md §5**: `ListProtocolsArgs` (no fields), and `CreateExperimentArgs` with these fields:
  - `name: str = Field(..., min_length=1, max_length=200)`
  - `description: str | None = Field(None, max_length=2000)`
  - `protocol_ref: str | None`
  - `sample_codes: list[str] | None = Field(None, max_length=50)`
  - `confirmed: bool` (required)
  
  The remaining four:
  - `AssociateProtocolArgs(experiment_ref: str | None, protocol_ref: str)`
  - `StartExperimentArgs(experiment_ref: str | None, confirmed: bool)`
  - `CompareWithPreviousRunArgs(sample_ref: str | None, measurement_type: str | None)`
  - `SearchExperimentsArgs`, all optional:
    - `status: Literal["DRAFT","READY","RUNNING","PAUSED","COMPLETED","CANCELLED"]`
    - `date_range: Literal["today","yesterday","this_week","last_week","this_month"]`
    - `has_deviations: bool`, `contains_sample: str`, `measurement_type: str`, `protocol_ref: str`
    - `free_text: str = Field(None, max_length=100)`
  
  All subclass `_Args` (`extra="forbid"`) and declare no time field.

  Add the six registry entries, with descriptions verbatim from contracts/tools-api-v2.md "Registry additions". Add `TOOL_SCOPE: dict[str, Literal["experiment","experiment_ref","user"]]` covering **every** registry key: the 11 existing tools and `compare_with_previous_run` are `experiment`, `associate_protocol` and `start_experiment` are `experiment_ref`, and `list_protocols`, `search_experiments` and `create_experiment` are `user`. Add `PROFILES` exactly as in research R-201 and `profile_for(experiment)` per data-model §4. Leave `MUTATING_TOOLS` unchanged, and replace the "eleven tools" `ponytail` comment with a pointer to amendment A-1.
- [ ] T027 In `api/app/tools/schemas.py`, add `tool_schemas(profile: str) -> list[dict]`, which builds schemas for `PROFILES[profile]` in registry order via the existing `to_tool_schema`. **Keep `TOOL_SCHEMAS` equal to today's 11-tool list** (the existing tools in registry order), so that `api/eval/run.py` and existing tests are unaffected. Extend `api/tests/tools/test_schemas.py` with these assertions:
  - every name in every profile is a registry key
  - every registry key has a scope
  - `tool_schemas("bench")` names == the 11 existing names + `compare_with_previous_run`
  - no profile exceeds 12 tools
  - no schema has a property whose name contains `time`, `date` or `_at`, except the enum field `date_range`
- [ ] T028 Create `api/app/resolve.py` with two functions:
  - `resolve_protocol(sb, user_id, ref) -> dict` resolves among protocols where `owner_id == user_id` **or** `owner_id is null`. The order is: exact `protocol_code`, case-insensitive; then exact `name`, case-insensitive; then `name + " " + version`, case-insensitive (for example "sample stability evaluation v1"). It returns `{"protocol": row}` on a unique hit. On several hits it returns `{"error": "AMBIGUOUS_PROTOCOL", "candidates": [{protocol_code,name,version}]}`. On no hit it returns `{"error": "PROTOCOL_NOT_FOUND", "alternatives": up to 5 readable protocols}`.
  - `resolve_experiment(sb, user_id, ref) -> dict` queries **only** `experiments.owner_id == user_id`. It tries an exact `experiment_code` (case-insensitive), then an exact name, with the same result and error shapes (`AMBIGUOUS_EXPERIMENT`, `EXPERIMENT_NOT_FOUND`, and alternatives from the user's DRAFT and READY experiments).
  
  Add `api/tests/test_resolve.py`. It must cover each resolution tier, ambiguity, not-found alternatives, and another user's experiment returning `EXPERIMENT_NOT_FOUND`, never the row.
- [ ] T029 Rework `api/app/routers/tools.py` into the v2 dispatcher of contracts/tools-api-v2.md:
  - `ToolCall.experiment_id: str | None = None` and a new `tz: str | None = None`.
  - After structural validation (step 3), branch on `TOOL_SCOPE`:
    - `experiment`: behaviour is **unchanged**, except that a missing `experiment_id` returns `_fail("EXPERIMENT_REQUIRED", …)`.
    - `experiment_ref`: call `resolve_experiment(sb, user.id, args.experiment_ref or <code of experiment_id row>)`. If `experiment_ref` is absent, load by `experiment_id`. Return the resolver's error via `_fail`. Then run the existing explicit `owner_id != user.id` → 403 check on the loaded row.
    - `user`: set `experiment = None`.
  - The step-6 RUNNING gate is unchanged.
  - Call handlers with `tz=` **only if** the handler signature accepts it (use `inspect.signature`), so the 11 existing handlers stay untouched.
  
  Add `api/tests/test_dispatch_scopes.py` with cases for:
  - `EXPERIMENT_REQUIRED`
  - cross-user `experiment_ref` returning `EXPERIMENT_NOT_FOUND` with an unchanged event count
  - `user` scope running with `experiment_id=None`
  - an existing tool with an `experiment_id` behaving identically to today (reuse one assertion from `api/tests/test_api.py`)
- [ ] T030 In `api/app/tools/prompt.py`, add `build_desk_prompt(protocols: list[dict]) -> str` and `build_setup_prompt(ctx) -> str`. Keep `build_prompt(ctx)` (bench) text **unchanged** except for the additions made by later stories.
  - The **desk** prompt has no experiment context. It lists up to 20 protocols (`code — name version`), and it reuses the HARD RULES tone and the STYLE section. Its rules: ask which protocol if none is named; call `create_experiment` with `confirmed` false first, read back the summary, then call it with true only after an explicit yes; never invent experiment codes, since the code comes from the tool result; for search, pass `date_range` words and speak `resolved` dates only.
  - The **setup** prompt adds the experiment's code, name and status and the protocol (or "none attached"). Its rules cover `associate_protocol` and `start_experiment` with confirmation, and it keeps the existing `write_protocol_step` rules verbatim.
  
  Add `build_session(sb, user_id, experiment_id: str | None) -> dict` in `api/app/routers/voice.py`. It returns `{profile, experiment, session: {system_prompt, input: {keyterms}, tools}}`, using `profile_for`, `tool_schemas(profile)` and the right prompt builder. Desk keyterms are protocol codes and names, then `vocabulary.spoken_terms()`, capped at 100.
- [ ] T031 In `api/app/routers/voice.py`:
  - (1) Make `experiment_id` optional on `GET /voice/bootstrap`. With it, the response is the same as today plus `"profile"`, and `session_config.tools = tool_schemas(profile)`. For a RUNNING experiment this equals today's 11 tools + `compare_with_previous_run`. Without it, use `experiment: null`, profile `desk`, and the greeting `"LabLog ready. No experiment is open. You can create one, start one, or search your experiments."`.
  - (2) Add `GET /voice/session-config?experiment_id=`. It uses the same authorization as bootstrap and **mints no token**, and it returns `build_session(...)` with **no** `greeting`, `output`, `input.format` or `input.turn_detection` keys (contracts/voice-session.md §2).
  - Authorization happens before minting in both modes.
  
  Add `api/tests/test_voice_session.py`. It covers the desk bootstrap, the setup and bench profiles, the forbidden keys absent from session-config, 403 for another user's experiment, and the token minter not being called by session-config (monkeypatch `_mint_token` to raise).
- [ ] T032 In `api/eval/run.py`, support `profile` in `converse()`. `bench` behaves as today. `setup` seeds a DRAFT experiment `STAB-DRAFT` with no protocol in the store and uses `build_setup_prompt`. `desk` uses `experiment=None` and `build_desk_prompt(readable protocols)`. Use `tool_schemas(profile)` converted to the gateway shape (the same comprehension as `GATEWAY_TOOLS`), and make `execute()` dispatch by `TOOL_SCOPE`, mirroring T029: `user` scope passes `experiment=None`, and `experiment_ref` resolves via `resolve_experiment`. `OPENING` messages apply only to `bench`. Extend `api/tests/test_eval.py` to check that a desk scenario builds the desk prompt and 5 tools, without the network (monkeypatch `httpx.post`).
- [ ] T033 In `web/lib/api.ts`:
  - make `fetchBootstrap(experimentId?: string)` accept an undefined id and omit the query param when it is missing
  - add `fetchSessionConfig(experimentId?: string)`
  - add a `tz` field to `ToolRequest`, and make `experiment_id` optional
  - extend `BootstrapResponse` in `web/lib/voiceClient/types.ts` with `profile` and a nullable `experiment`
- [ ] T034 In `web/components/voice/useVoiceAgent.ts`:
  - make `experimentId` optional (desk mode when empty)
  - send `tz: Intl.DateTimeFormat().resolvedOptions().timeZone` on every `callTool`
  - expose `refreshSession(experimentId?: string): Promise<'applied'|'failed'>`, which fetches `/voice/session-config` and sends `{type:'session.update', session: response.session}` verbatim
  - resolve `'applied'` on the next `session.updated`, and `'failed'` on `session.error` or after a 5 s timeout, with no retry loop
  - make sure the triggering `tool.result` is always sent **before** `refreshSession` runs (contracts/voice-session.md §3 ordering rule)
  - leave the existing open/resume behaviour unchanged
  
  Add `web/tests/voiceClient/refresh.test.ts`, which tests the ordering and the applied/failed resolution using a fake socket.
- [ ] T035 In `web/components/voice/VoiceSession.tsx`:
  - add `startDesk()`, which starts a session with no bound experiment
  - extend `bind()` so that while live **and unbound (desk)** it may bind in place (today it is ignored while live)
  - keep binding from one experiment to a *different* experiment while live disallowed, as today
  - add `onToolSuccess` handling so that when `data.experiment_id` is present and the session is unbound, it binds `{id, code: data.experiment_code}`
  - expose `vocabularyState: 'fresh'|'refreshing'|'stale'`
  
  Show "Vocabulary not refreshed" in `web/components/voice/VoiceDock.tsx` when the state is `stale`.
- [ ] T036 Run quickstart §0 (all 001/002/US1/US2 tests unchanged and passing), then commit.

**Checkpoint**: The voice session supports desk, setup and bench profiles and live refresh. US3–US6 can begin.

---

## Phase 6: User Story 3: Create and start an experiment by voice (Priority: P2) · Phase C

**Goal**: From Home with nothing bound: create, associate and start by voice, with zero reconnects (FR-220…FR-226).

**Independent Test**: This is quickstart §3. The handler table passes. End to end by voice, the row goes DRAFT/READY → RUNNING, three events are written, the workspace opens, and the `session_id` is unchanged.

### Tests for User Story 3

- [ ] T037 [P] [US3] Create `api/tests/tools/test_lifecycle.py` with every case in the quickstart §3 table. Each rejection asserts that `sb.count("experiments")`, `sb.count("samples")` and `sb.count("events")` are unchanged. The cases:
  - `list_protocols` returns only owned and library protocols, as `{protocol_code, name, version, step_count}`, capped at 25 with `truncated`
  - create with `confirmed=false` returns `NEEDS_CONFIRMATION` with detail `{name, protocol, sample_codes}`
  - create with `protocol_ref="STAB"` gives READY with code `STAB-105` against the seeded STAB-100…104, and one `EXPERIMENT_CREATED` event whose payload is `{experiment_code, name, protocol_id, status}`
  - create with no protocol gives DRAFT with code `EXP-1` and `needs_protocol: true`
  - create with `sample_codes=["b3","B4"]` stores `B3` and `B4` and writes two `SAMPLE_CREATED` events with `source: "voice"`
  - an invalid sample code `"-x"` returns `INVALID_SAMPLE_CODE`, and duplicates return `DUPLICATE_SAMPLE_CODE`
  - `PROTOCOL_NOT_FOUND` carries alternatives, and `AMBIGUOUS_PROTOCOL` carries candidates
  - a pre-seeded `STAB-105` yields `STAB-106`, and a forced repeated collision (monkeypatch) gives `CODE_UNAVAILABLE` after 3 retries
  - associate: DRAFT→READY with a `PROTOCOL_ASSOCIATED` payload `{protocol_id, protocol_code, previous_protocol_id, status_from, status_to}`; READY→READY re-association; RUNNING returns `EXPERIMENT_ALREADY_STARTED`
  - start checks run in the order `NO_PROTOCOL`, then `INVALID_STATE` (DRAFT with a protocol is impossible, so test COMPLETED), then `NEEDS_CONFIRMATION`
  - a successful start gives RUNNING with `started_at` set by the server (the args contain no time) and `current_step_index=0`, and writes `EXPERIMENT_STARTED`
  - `write_protocol_step(new_protocol=true)` on a DRAFT experiment still behaves as in `api/tests/tools/test_handlers.py` (PROTECTED P-1)
- [ ] T038 [P] [US3] Add a desk and setup section to `api/eval/scenarios.py` (category `lifecycle`), with at least 9 scenarios:
  - desk: "Create an experiment called Enzyme Stability Trial 12" gives `{clarify: True}` (it asks for the protocol and writes nothing)
  - desk: "Create an experiment called Enzyme Stability Trial 12 using sample stability" gives `{tool: create_experiment, args: {protocol_ref: <any>}}` with `confirmed=false`, which counts as no write
  - desk, with history of the agent's read-back: "Yes" gives `create_experiment` with a stored `status: READY`
  - desk: "What protocols do I have?" gives `{tool: list_protocols}`
  - setup: "Use sample stability" gives `{tool: associate_protocol}`
  - setup, with history: "Start it" gives `{clarify: True}` (it asks for confirmation)
  - setup, with history confirming: "Yes, start it" gives `{tool: start_experiment}`
  - setup: "Start it" on a DRAFT with no protocol gives `{error: NO_PROTOCOL}` or a clarifying question
  - desk: "Start experiment XYZ-9" gives `{error: EXPERIMENT_NOT_FOUND}`
  
  Extend the `backend_ok` logic in `run.py` `score()` to look at every attempted call's `error`, not only `record_measurement`.

### Implementation for User Story 3

- [ ] T039 [P] [US3] Create `api/app/samples.py` with:
  - `normalize_sample_code(code) -> str | None`, which strips, uppercases, and matches `^[A-Za-z0-9][A-Za-z0-9-]{0,31}$`, returning `None` if invalid
  - `add_samples(sb, experiment, codes, *, actor_id, session_id, source) -> list[row]`, which inserts, then writes one `SAMPLE_CREATED` event per sample with payload `{sample_code, sample_type, source}`
  
  Validation is separate from writing, so callers validate everything first.
- [ ] T040 [US3] Create `api/app/tools/lifecycle.py` with handlers `list_protocols`, `create_experiment`, `associate_protocol` and `start_experiment`. Each uses the signature `(*, sb, experiment, user_id, args, session_id=None)` and returns `_ok`/`_err` shapes identical to `handlers.py` (import `_ok`, `_err` and `_now` from there). The handlers implement contracts/tools-api-v2.md and research R-205/R-206 exactly:
  - `create_experiment` checks in order: protocol resolution, then sample validation, then `confirmed`.
  - The code prefix is `protocol_code.upper()` or `EXP`. The number is 1 + the max numeric suffix over **all** experiments matching `^<PREFIX>-\d+$` (service role). Retry on a unique-violation error up to 3 times, then return `CODE_UNAVAILABLE`.
  - The code is read back from the inserted row. Events are written after the row.
  
  Re-export the four handlers from `api/app/tools/handlers.py` (`from .lifecycle import list_protocols, create_experiment, associate_protocol, start_experiment`), so that the dispatcher's `getattr(handlers, name)` finds them without other edits. Make T037 pass.
- [ ] T041 [US3] Extend `build_greeting`-adjacent logic *only if needed*. The greeting is immutable mid-session, so after a rebind **do not** attempt to re-greet. Instead, add to the bench prompt (`build_prompt` in `api/app/tools/prompt.py`) one rule: "If the experiment just started in this conversation, tell the user the first step from get_next_protocol_step". This is additive text only.
- [ ] T042 [US3] In `web/app/(app)/dashboard/page.tsx`, add a **Start voice** button in the header area. It is shown when no session is live, and it calls `useVoiceSession().startDesk()`. The existing hero and lists stay unchanged. When the session binds to a newly created or started experiment (T035), navigate with `router.push('/dashboard/experiments/' + id)` once its status is RUNNING, and invalidate the `useExperimentList` query on every lifecycle tool success.
- [ ] T043 [US3] In `web/components/voice/VoiceSession.tsx`, trigger `refreshSession(boundId)` after a successful `create_experiment`, `associate_protocol`, `start_experiment` or `write_protocol_step` tool result, after `tool.result` has been sent (T034 ordering), and set `vocabularyState` accordingly.
- [ ] T044 [US3] Run `python -m eval.run` and fix systematic lifecycle failures in the desk and setup prompts only (FR-204). **The A-1 gate check**: the bench `tool_selection_accuracy` must be ≥ the last US1 run on the same model. If it is not, apply the R-201 fallback (fold compare into `get_sample_history`) before proceeding. Commit the run file.
- [ ] T045 [US3] Validate quickstart §3 end to end by voice (the DoD). Run quickstart §0, then commit.

**Checkpoint**: Experiments no longer depend on the seed.

---

## Phase 7: User Story 4: Previous-run comparison (Priority: P2) · Phase D

**Goal**: `compare_with_previous_run`, with all arithmetic in the backend (FR-230, FR-231; research R-207).

**Independent Test**: This is quickstart §4. With A17 at 4.3 C recorded on STAB-104, the result is `{previous: 4.6, delta: -0.3, pct: -6.5, direction: "lower", prev_experiment_code: "STAB-102"}`, and the agent speaks those numbers.

### Tests for User Story 4

- [ ] T046 [P] [US4] Create `api/tests/tools/test_compare.py`. First extend `seeded_store()` in `api/tests/conftest.py` **additively** with a helper `seed_history(sb)` that adds STAB-100..102 COMPLETED with the same `protocol_id`, each with A17, A18 and CONTROL-01 temperatures as in `supabase/seed.sql`: the step-1 value `base+0.2` and the step-3 value `base+0.4`, with the step-3 value recorded later. Cases:
  - exact result for A17 (−0.3 / −6.5 / lower / STAB-102)
  - the previous value corrected, so the superseding value is used
  - no COMPLETED run gives `NO_PREVIOUS_RUN`
  - a sample missing in the previous run gives `NO_CORRESPONDING_MEASUREMENT` with `which: "previous"`
  - nothing recorded in the current run gives `which: "current"`
  - different units give `UNIT_MISMATCH`
  - a previous value of 0 gives `pct: null`
  - defaults: with `sample_ref` and `measurement_type` omitted, the latest current measurement is used
  - another user's COMPLETED run with the same protocol is ignored
  - an unknown sample returns `SAMPLE_NOT_FOUND` via the existing resolver
  - no rows are written in any case
- [ ] T047 [P] [US4] Add at least 4 bench scenarios (category `comparison`) to `api/eval/scenarios.py`, with setup recording A17 at 4.3:
  - "How does that compare with the previous run?" gives `{tool: compare_with_previous_run, result: {delta: -0.3, pct: -6.5}, spoken: ["4.6", "0.3"]}`
  - "Compare A18 with last time" gives a tool call (the result is `NO_CORRESPONDING_MEASUREMENT` when A18 is not yet recorded, and the agent must say so without inventing numbers)
  - "Is A17 higher or lower than the previous run?" gives `spoken: ["lower"]`
  - a history-less store variant gives `{error: NO_PREVIOUS_RUN}`
  
  Implement `expect.result` / `expect.spoken` scoring and `metrics.comparison_exactness` in `api/eval/run.py` per contracts/eval-runs.md. The eval store needs `seed_history` for the comparison scenarios.

### Implementation for User Story 4

- [ ] T048 [US4] Implement `compare_with_previous_run(*, sb, experiment, user_id, args, session_id=None)` in `api/app/tools/handlers.py`. This is an **addition only**. Existing functions are untouched.
  - The previous run is `experiments` with the same `protocol_id`, `owner_id == user_id`, `status == "COMPLETED"`, and `completed_at < (experiment.started_at or now)`, ordered by `completed_at desc`, limit 1.
  - The sample is resolved with the existing `_resolve_or_error` in the current experiment, then matched by `sample_code` in the previous one.
  - For each run, take the latest `measurements` row with `superseded_by is null` for (sample_id, measurement_type) by `recorded_at`.
  - Use `Decimal(str(v))` arithmetic. `delta` is rounded half-even to the larger number of decimal places in the two values, and `pct = delta/|previous|*100` is rounded to 1 decimal place, or `None` when previous == 0. `direction` is `"higher"`, `"lower"` or `"same"`.
  - Return floats in the contract shape.
  
  Make T046 pass.
- [ ] T049 [US4] Add a rule to the bench prompt in `api/app/tools/prompt.py`: "For comparisons with a previous run, call compare_with_previous_run and speak ONLY the numbers and direction it returns. Never calculate a difference or percentage yourself." Run the eval, fix prompt-only failures, and commit the run file.
- [ ] T050 [US4] Validate quickstart §4 by voice on STAB-104. Run quickstart §0, then commit.

**Checkpoint**: The comparison is grounded, and the spoken numbers equal the backend's.

---

## Phase 8: User Story 5: Voice experiment search (Priority: P3) · Phase E

**Goal**: `search_experiments`, with typed filters, server-resolved relative dates, and one function shared with History (FR-240, FR-241; research R-208).

**Independent Test**: This is quickstart §5. The three example queries return the reference SQL's sets. The `GET /experiments/search` output equals the tool's `data`. `resolved.date_range` is spoken as returned.

### Tests for User Story 5

- [ ] T051 [P] [US5] Create `api/tests/test_search.py`, using a frozen `now` injected as a parameter (no clock monkeypatching of `datetime` globally). Cases:
  - each filter alone: `status`, `protocol_ref`, `has_deviations` true and false, `contains_sample` (case-insensitive), `measurement_type`, and `free_text` (which escapes `%` and `_`)
  - a combination of three filters
  - an empty result gives `results: []` with `count: 0` and success
  - the 25-row cap with `truncated: true`
  - each `date_range` with `tz="America/Denver"` at a frozen instant of Monday 2026-09-21 03:00 UTC, which is still Sunday in Denver, so `this_week` starts 2026-09-14 local
  - an invalid tz falls back to UTC with `tz_used: "UTC"`
  - another user's experiments are never returned
- [ ] T052 [P] [US5] Add at least 6 desk scenarios (category `search`) to `api/eval/scenarios.py`:
  - "Show my stability experiments this week" gives `{tool: search_experiments, args: {date_range: this_week}}`
  - "Experiments with deviations" gives `args: {has_deviations: true}`
  - "Find experiments containing sample A17" gives `args: {contains_sample: A17}`
  - "Which experiments are running?" gives `args: {status: RUNNING}`
  - "Completed stability runs from last week" gives `args: {status: COMPLETED, date_range: last_week}`
  - "Experiments from the 3rd to the 9th" gives `{clarify: True}` (no enum covers it, so the agent must say it can only search by the listed ranges, and must not invent dates)

### Implementation for User Story 5

- [ ] T053 [US5] Create `api/app/search.py`:
  - `resolve_date_range(token, tz_name, now) -> (start_utc, end_utc, tz_used)` covers `today`, `yesterday`, `this_week` (Monday 00:00 local), `last_week` and `this_month` (the 1st at 00:00 local). It uses a half-open interval and `zoneinfo.ZoneInfo`, falling back to `"UTC"` on `ZoneInfoNotFoundError` or `None`.
  - `search_experiments(sb, user_id, args: SearchExperimentsArgs, tz, now=None) -> dict` starts from `experiments.owner_id == user_id`. It applies `status` by `eq`, `protocol_ref` via `resolve_protocol` and then `eq("protocol_id")`, and `date_range` via `gte`/`lt` on `created_at`. `has_deviations`, `contains_sample` and `measurement_type` are each a separate query yielding `experiment_id` sets, intersected in Python. `free_text` is an escaped `ilike` on code, name and description.
  - The result is ordered `created_at desc`, capped at 25, with `deviation_count` computed per row. It returns the contract `data` shape, including `resolved`.
  
  Make T051 pass.
- [ ] T054 [US5] Add a handler `search_experiments(*, sb, experiment, user_id, args, session_id=None, tz=None)` to `api/app/tools/lifecycle.py` that delegates to `search.search_experiments`, and re-export it from `handlers.py`. Add a desk-prompt rule: "Speak the dates in resolved exactly as returned; if the user asks for a range not in the list, say which ranges you can search." Run the eval and commit the run file.
- [ ] T055 [US5] Create `api/app/routers/experiments.py` with `GET /experiments/search`. Its query params mirror `SearchExperimentsArgs` plus `tz`, and it is validated by constructing `SearchExperimentsArgs`. On `ValidationError` it returns `{success:false, error:"INVALID_ARGS"}`. It calls the same `search.search_experiments` and returns `{success:true, data}`. Include the router in `api/app/main.py`. Add a test in `api/tests/test_search.py` asserting that the endpoint output == the tool handler output for the same filters.
- [ ] T056 [US5] Wire History (`web/app/(app)/experiments/page.tsx`) so that when a date-range preset (Today, Yesterday, This week, Last week, This month) or the "Has deviations" toggle is used, it fetches `GET /experiments/search` via a new `searchExperiments()` in `web/lib/api.ts` (passing the browser `tz`) instead of filtering client-side. Keep the US2 client-side status, protocol and sort behaviour for the unfiltered view.
- [ ] T057 [US5] Validate quickstart §5, including the extended audit-invariant SQL. Run quickstart §0, then commit.

**Checkpoint**: Search works by voice and in History, from one declaration.

---

## Phase 9: User Story 6: The agent learns new terms without reconnecting (Priority: P3) · Phase F

**Goal**: Adding a sample (or writing a protocol step) mid-session refreshes the keyterms and prompt in place (FR-250…FR-252; research R-209, R-212).

**Independent Test**: This is quickstart §6. Add B3 in the workspace. `session.update` with B3 is sent, and `session.updated` is received. "B3 is 4.1 Celsius" records against B3, and the `session_id` is unchanged.

### Tests for User Story 6

- [ ] T058 [P] [US6] Create `api/tests/test_samples.py` for `POST /experiments/{id}/samples`, covering:
  - a valid add stores an uppercased code and writes a `SAMPLE_CREATED` event with `source: "ui"`
  - body fields `id`, `experiment_id`, `created_at` and `owner_id` are ignored
  - a COMPLETED experiment gives `EXPERIMENT_CLOSED`
  - an invalid code gives `INVALID_SAMPLE_CODE`
  - a duplicate gives `SAMPLE_EXISTS`
  - another user's experiment gives 403, a missing experiment gives 404, and no token gives 401
  - `samples` and `events` counts are unchanged on every rejection
- [ ] T059 [P] [US6] Extend `api/tests/tools/test_handlers.py`, or add a new `api/tests/tools/test_keyterms.py`, to assert these `build_keyterms(ctx)` properties:
  - sample codes come first, then the experiment code, then **protocol step names** (new), then vocabulary terms
  - there are no duplicates
  - the cap is 100
  - adding a sample to the context changes the output
- [ ] T060 [P] [US6] Add at least 2 bench scenarios (category `vocabulary`) to `api/eval/scenarios.py`:
  - "B3 is 4.1 Celsius" with the default samples gives `{error: SAMPLE_NOT_FOUND}` or a clarifying question
  - the same utterance with setup adding sample B3 to the store **and to the prompt context** gives `_temp("B3", 4.1)`
  
  This measures the prompt-context half only (R-212).

### Implementation for User Story 6

- [ ] T061 [US6] In `api/app/tools/prompt.py` `build_keyterms`, insert protocol step names after the experiment code and before the vocabulary terms. Make T059 pass. The existing ordering of sample codes first is unchanged (PROTECTED P-3 behaviour extended).
- [ ] T062 [US6] Add `POST /experiments/{experiment_id}/samples` to `api/app/routers/experiments.py`, per contracts/http-api.md, using a request model with `extra="ignore"` and `api/app/samples.py`. The sequence is: JWT, load, explicit owner check (403), `EXPERIMENT_CLOSED`, `INVALID_SAMPLE_CODE`, `SAMPLE_EXISTS`, insert, event, then return the stored row. Make T058 pass.

**The ungated slice starts here.** T063–T067 do not need A-1, because no tool is added. If A-1 was refused, implement T039 (`samples.py`) here first, and use `bootstrap` in place of `session-config` for the refresh.

- [ ] T063 [US6] Add `addSample(experimentId, {sample_code, name?, sample_type?})` to `web/lib/api.ts`.
- [ ] T064 [US6] Add an **Add sample** control to the workspace, `web/app/(app)/dashboard/experiments/[id]/page.tsx`. It is a small inline form beside the `SampleBoard` header, shown only when the status is not COMPLETED or CANCELLED. On success it invalidates `useSamples`. If a voice session is live and bound to this experiment, it calls `refreshSession(experimentId)` (T034). The existing layout is otherwise unchanged (PROTECTED P-7).
- [ ] T065 [US6] Ensure that `useRealtimeExperiment` in `web/lib/queries/useExperiment.ts` also listens to `samples` inserts for the experiment (enabled by migration 0003), so a sample added in another tab appears. This is additive to the existing subscriptions.
- [ ] T066 [US6] Show the vocabulary state in `web/components/voice/VoiceDock.tsx`: "Vocabulary updated" briefly on `applied`, and a persistent "Vocabulary not refreshed" on `failed` (Principle V: never claim success that did not occur).
- [ ] T067 [US6] Validate quickstart §6, including the forced-failure step. Run quickstart §0, then commit.

**Checkpoint**: Live reconfiguration is proven without a reconnect. The ASR keyterm lift remains unmeasured until the audio harness exists (R-212), and the UI shows no lift figure.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T068 [P] Add a changelog line to each amended 001 contract, pointing at 003: `specs/001-lablog-voice-notebook/contracts/tools-api.md` (→ `003/contracts/tools-api-v2.md`), `voice-bootstrap.md` and `aai-websocket.md` (→ `003/contracts/voice-session.md`), and `eval-metrics.md` (→ `003/contracts/eval-runs.md`). This is a changelog line only, not a rewrite (constitution contract amendment procedure).
- [ ] T069 [P] Update `README.md`: the new eval command and run-file layout, the desk-mode voice flow, and the migration 0003 step.
- [ ] T070 Mark the contracts `tools-api-v2.md` and `voice-session.md` as **FROZEN** in their status lines once US3 is validated. Record T-C0's result reference.
- [ ] T071 Run `scripts/check-secrets.sh`. No service keys may appear in `web/`, and `session-config` must return no token field (Principle III).
- [ ] T072 Run the full audit invariant from quickstart §5 against the live database after exercising every story. Expect 0 rows.
- [ ] T073 Update the Phase A–F status table in `docs/RECONCILE.md` §2 to reflect what shipped. Run a final quickstart §0 and a final `python -m eval.run`, and commit the run file.

---

## Dependencies & Execution Order

### Phase dependencies

```text
Setup (T001–T003) → Foundational (T004–T005)
   ├─► US1 Phase A (T006–T011)  ─┐   ungated, the Sep 30 path
   └─► US2 Phase B (T012–T021)  ─┤   (US2 has no code dependency on US1; do US1 first for the deadline)
                                  ▼
             ⛔ A-1 gate: T022 (owner approval) → T023 (T-C0) → voice foundation (T024–T036)
                                  │
      ┌───────────────┬───────────┼───────────────┐
      ▼               ▼           ▼               ▼
  US3 (C)         US4 (D)     US5 (E)         US6 (F)
  T037–T045       T046–T050   T051–T057*      T058–T067
                              * needs T040's lifecycle.py for the handler re-export pattern
Polish (T068–T073) after the stories you ship
```

- **US3** depends only on Phase 5.
- **US4** depends only on Phase 5 (T026 model, T027 profile). It is independent of US3.
- **US5** depends on Phase 5 and on T040 creating `api/app/tools/lifecycle.py`. If US5 is built before US3, create the file in T054 instead.
- **US6** depends on Phase 5 (T034 `refreshSession`) and on T039 (`samples.py`). T063–T067 can run without A-1 as described in the phase.
- US1 and US2 are fully independent of each other.

### Within each story

Write the tests first and watch them fail. Then build models and helpers, then handlers and routers, then prompt and eval, then web, then quickstart validation, then commit.

---

## Parallel Opportunities

- **Setup/Foundational**: T003 can run beside T002.
- **US1**: T006 (tests) and T007 (scenarios) are different files and can run in parallel. T009 (web page) can be built against a hand-made fixture `metrics.json` in parallel with T008, **but the fixture must be deleted before T010**, because figures come only from the harness.
- **US2**: T012, T013 and T018 can run in parallel. T014 can then run beside T015.
- **Phase 5**: T024 and T025 can run in parallel with T026. T028 can run beside T027. T033 can run beside T030–T031 (the web and API sides share only the contract).
- **After Phase 5**: US3, US4, US5 and US6 can proceed in parallel, with different owners, as long as each edits only `api/eval/scenarios.py` inside its own clearly delimited section.
- Within each story, the test tasks marked [P] can run together:

```text
US3:  T037 test_lifecycle.py  ∥  T038 lifecycle scenarios  ∥  T039 samples.py
US4:  T046 test_compare.py    ∥  T047 comparison scenarios
US5:  T051 test_search.py     ∥  T052 search scenarios
US6:  T058 test_samples.py    ∥  T059 keyterm tests  ∥  T060 vocabulary scenarios
```

---

## Implementation Strategy

### MVP first (the Sep 30 cut)

1. Phase 1 and Phase 2: a clean, committed baseline.
2. **US1**: evidence-backed reliability. **Stop and validate** (quickstart §1). This alone is the highest-value submission slice.
3. **US2**: the multi-page product feel. Validate (quickstart §2). **Submit.**

### Post-hackathon increments

4. Get owner approval of A-1 (T022), then run T-C0 (T023). If either fails, stop. Ship only the ungated US6 slice (T063–T067, with T039 and T062).
5. Build the voice foundation (Phase 5), then US3. This is the biggest product change, so validate it with zero reconnects.
6. Then US4, US5 and US6 in any order. Each ends with an eval run file committed and the quickstart §0 regression gate.

### Guardrails for every task

- Never edit an existing test to make it pass. If one fails, the change is a regression unless the test asserted absent behaviour. **Ask first.**
- Never weaken a scenario to raise a metric (FR-204).
- Every new mutation's rejection test asserts unchanged row counts.
- Timestamps come only from the server or the database. No argument model has a time field.
