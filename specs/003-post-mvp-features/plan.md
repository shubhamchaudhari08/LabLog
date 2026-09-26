# Implementation Plan: Post-MVP Product Features

**Branch**: `003-post-mvp-features` | **Date**: 2026-09-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-post-mvp-features/spec.md`, derived from `LabLog_PostMVP_Plan.md` and reconciled in [`docs/RECONCILE.md`](../../docs/RECONCILE.md) (Phase R, done).

## Summary

This plan delivers the source plan's Phases A–F on top of the existing app and changes no protected behaviour. The phases, in delivery order:

- **A**: raise the eval bank to 60+ scenarios, persist every run as an immutable committed JSON file, and add trend, category, drill-down and export views to the existing Reliability page.
- **B**: add stats to Home, turn Experiments into a sortable and filterable History table, and add a new read-only Detail route that reuses the workspace panels behind a `readOnly` prop.
- **C**: add a voice session with no bound experiment (desk mode), and three lifecycle tools plus `list_protocols` (DRAFT→READY→RUNNING, server-generated codes, confirmation gates). After each change the session reconfigures in place via `session.update`.
- **D**: add `compare_with_previous_run`, with Decimal arithmetic in the backend and a `direction` field so the agent never infers a sign.
- **E**: add `search_experiments`, backed by one typed search function that is shared with a History endpoint. Relative dates resolve on the server in a browser-reported time zone.
- **F**: add a refresh endpoint and a browser refresh procedure that push new keyterms, prompt and tools after any vocabulary-changing event, plus a sample-add endpoint that makes the Phase F done-definition reachable.

The one structural decision is **tool profiles** (research R-201). They keep every session configuration at ≤12 tools, but they require **constitution amendment A-1**, which blocks Phases C–E and **not** Phases A, B or F-refresh.

## Technical Context

**Language/Version**: Python 3.12 (api), TypeScript 5.7 / Next.js 14 App Router (web), Postgres 15 via Supabase

**Primary Dependencies**: FastAPI, Pydantic v2, supabase-py, httpx (api); React 18, TanStack Query 5, Tailwind, Supabase JS (web). **No new dependencies.** The trend chart is inline SVG, and the time-zone handling uses stdlib `zoneinfo`.

**Storage**: The existing 7 tables. Migration `0003` adds indexes and the realtime publication for `samples` only ([data-model.md](data-model.md) §1). Eval runs are stored as committed JSON files (R-203).

**Testing**: pytest with the in-memory `FakeSupabase` (`api/tests/conftest.py`). Every rejection test asserts unchanged row counts. vitest for web units (`turnBuffer` and the new refresh reducer). The eval harness runs against the real handlers.

**Target Platform**: Desktop Chromium. The API runs on the existing deployment (001 R-013).

**Project Type**: Web application (`api/` + `web/` + `supabase/`)

**Performance Goals**: The refresh round-trip (`tool.result`, then the `session-config` GET, then `session.update`) should take ≤1 s. A search should take ≤500 ms at demo scale (≤100 experiments). The comparison must add no perceptible hesitation, because it uses indexed lookups only.

**Constraints**:
- ≤12 tools per session configuration (A-1) and ≤100 keyterms.
- `greeting` and `output.voice` are immutable mid-session (R-202).
- No model-authored SQL or date arithmetic.
- All timestamps come from the server.
- The additive-only rule applies to PROTECTED P-1…P-9.

**Scale/Scope**:
- 6 new tools, 3 new endpoints, 1 migration.
- 1 new route (`/experiments/[id]`), with edits to Home, Experiments, Reliability and the voice session.
- About 30 new eval scenarios.

**Open empirical item**: T-C0, a mid-session `tools` swap (R-202). This is not a clarification gap but a verification task with a defined fallback and escalation path. No NEEDS CLARIFICATION remain.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Principle | Pre-design | Post-design | Evidence |
|------|-----------|-----------|-------------|----------|
| G1 One validated path per mutation | I | ✅ | ✅ | Model mutations still go only through `POST /tools`. `POST /experiments/{id}/samples` follows the 002 precedent: a UI route with the full auth → validate → write → audit sequence ([http-api.md](contracts/http-api.md)). Sample validation is one function shared with `create_experiment`. |
| G2 Semantic validation against stored reality | I | ✅ | ✅ | Protocol and experiment references are resolved against owned or readable rows, with ambiguity returning candidates. The lifecycle checks status, and the comparison checks units ([tools-api-v2.md](contracts/tools-api-v2.md)). |
| G3 Explicit ownership before dispatch | I | ⚠ | ✅ | This is new: `user`-scope tools have no experiment to anchor on. They are resolved in dispatcher step 4a, where queries are owner-filtered and the explicit row check still runs. `user`-scope handlers filter every query by `owner_id` (R-204), and tests cover cross-user references. |
| G4 Server timestamps | I | ✅ | ✅ | No argument model has a time field. `date_range` is an enum. `tz` sits on the envelope and is used only for bucketing. `started_at` comes from the server. |
| G5 Report stored values | I | ✅ | ✅ | The generated code is read back after insert. The comparison returns the stored numbers, and `direction` plus `resolved` stop the model from computing. |
| G6 Ambiguity yields a question | I | ✅ | ✅ | `AMBIGUOUS_PROTOCOL`, `AMBIGUOUS_EXPERIMENT` and `NEEDS_CONFIRMATION` carry alternatives or summaries. |
| G7 Append-only + every mutation audited | II | ✅ | ✅ | Four new event types (data-model §3). Nothing is deleted. The extended invariant query is in quickstart §5. |
| G8 Rejections write nothing | Workflow | ✅ | ✅ | All checks run before the first insert. Each rejection test asserts counts. |
| G9 Secrets stay in api/ | III | ✅ | ✅ | `session-config` mints no token. The browser forwards the backend-authored config verbatim, and no new keys are added. `scripts/check-secrets.sh` is unchanged. |
| G10 RLS owner-scoped on every table | III | ⚠ | ✅ | The plan's `eval_runs` table has no owner, so it was replaced by committed files (R-203). The `v_experiment_stats` view would bypass RLS, so it was replaced by client counts (R-211). |
| G11 Verified wire formats | IV | ⚠ | ⚠ tracked | `system_prompt` and keyterm mutability are verified live (R-202). **Tool swapping is only implied by the docs, so T-C0 must prove it before any C code.** The contract stays DRAFT until then. |
| G12 Single source of truth | IV | ✅ | ✅ | `PROFILES` names come from `TOOL_REGISTRY` (asserted). `build_session()` serves both bootstrap and refresh. `search_experiments()` serves both the tool and the endpoint. |
| G13 Claims require evidence | V | ✅ | ✅ | Figures come only from run files. Passes and failures are both shown. The keyterm-lift figure is withheld until the audio harness exists (R-212). A failed refresh is surfaced, never hidden. |
| G14 Scope amended first | Scope | ⚠ | ✅ | spec.md amends the 001 deferred list. Phase G is excluded, including PDF and instrument ingestion (001 "Never"). |
| G15 Tool cap ≤ 10 | Scope | ❌ | ⚠ **amendment required** | The registry is 11 today (pre-existing) and 17 after 003. Profiles cap each config at 5, 6 or 12. **Amendment A-1 must be approved by the owner and committed before Phases C–E.** See Complexity Tracking. |

**Result**: **CONDITIONAL PASS.**
- Phases **A, B and F-refresh** pass outright and may proceed.
- Phases **C, D and E** are blocked on (1) owner approval and commit of amendment A-1, and (2) T-C0 confirming the mid-session tool swap. Per the constitution's precedence rule, if A-1 is refused, scope shrinks (C–E stay deferred) rather than a principle being relaxed.

## Project Structure

### Documentation (this feature)

```text
docs/RECONCILE.md                  # Phase R output (inventory, PROTECTED list, conflicts)
specs/003-post-mvp-features/
├── spec.md                        # amends 001 deferred scope
├── plan.md                        # this file
├── research.md                    # R-201 … R-213
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── tools-api-v2.md            # envelope + dispatcher v2, six tools
│   ├── voice-session.md           # profiles, /voice/session-config, refresh procedure
│   ├── http-api.md                # samples, search endpoints
│   └── eval-runs.md               # run files, history, details
└── tasks.md                       # /speckit-tasks, not created here
```

### Source Code (repository root)

```text
supabase/migrations/
└── 0003_post_mvp.sql                  # NEW: indexes + samples in realtime (C, D, E, F)

api/app/
├── routers/tools.py                   # EDIT (C): optional experiment_id, tz, scope dispatch, step 4a
├── routers/voice.py                   # EDIT (C/F): optional experiment_id; GET /session-config; build_session()
├── routers/experiments.py             # NEW (E/F): POST /experiments/{id}/samples, GET /experiments/search
├── main.py                            # EDIT: include experiments router
├── samples.py                         # NEW (C/F): sample-code validation + insert + SAMPLE_CREATED
├── search.py                          # NEW (E): typed search, date_range resolution
├── resolve.py                         # NEW (C): protocol_ref / experiment_ref resolution (R-206, R-204)
├── audit.py                           # EDIT: four new event types
└── tools/
    ├── models.py                      # EDIT: six arg models, scope per entry, PROFILES
    ├── schemas.py                     # EDIT: tool_schemas(profile); TOOL_SCHEMAS kept = bench minus compare
    ├── handlers.py                    # EDIT (D): compare_with_previous_run
    ├── lifecycle.py                   # NEW (C): list_protocols, create/associate/start handlers
    └── prompt.py                      # EDIT: desk/setup prompt variants; step names in keyterms;
                                       #       comparison + search + creation rules

api/eval/
├── scenarios.py                       # EDIT (A): 36 → 60+; profile, expect.result, expect.spoken
├── run.py                             # EDIT (A): per-profile context, run files, history, details, new metrics
└── runs/                              # NEW (A): committed immutable run records

api/tests/
├── test_eval.py                       # EDIT: scoring of new metrics + details
├── test_dispatch_scopes.py            # NEW: scope routing, cross-user refs, EXPERIMENT_REQUIRED
├── test_voice_session.py              # NEW: profiles, desk bootstrap, session-config omits greeting/output
├── test_search.py                     # NEW: every filter, combos, tz/date buckets with frozen clock
├── test_samples.py                    # NEW: sample endpoint
└── tools/test_lifecycle.py, test_compare.py, test_schemas.py (EDIT: profile ⊆ registry, bench superset)

web/
├── app/(app)/dashboard/page.tsx       # EDIT (B): six stat tiles; "Start voice" (desk) (C)
├── app/(app)/experiments/page.tsx     # EDIT (B/E): table, sort, filters via GET /experiments/search
├── app/(app)/experiments/[id]/page.tsx# NEW (B): read-only Detail
├── app/(app)/reliability/page.tsx     # EDIT (A): badge, categories, SVG trend, drill-down, export
├── app/(app)/dashboard/experiments/[id]/page.tsx  # EDIT (F): "Add sample" → refresh (otherwise untouched)
├── components/workspace/{SampleBoard,Ledger,Timeline}.tsx, protocol/ProtocolSteps.tsx
│                                      # EDIT (B): optional readOnly prop, default false
├── components/voice/VoiceSession.tsx  # EDIT (C/F): desk sessions; rebind-from-desk; refresh trigger
├── components/voice/useVoiceAgent.ts  # EDIT (C/F): experimentId optional; sendSessionUpdate(); tz on /tools
└── lib/api.ts, lib/queries/useExperiment.ts   # EDIT: sessionConfig(), addSample(), searchExperiments(), stats
```

**Structure Decision**: This keeps the existing web-application layout (`api/`, `web/`, `supabase/`). New backend modules sit beside the existing ones, and new logic lives in new files (`lifecycle.py`, `search.py`, `resolve.py`, `samples.py`), so that PROTECTED handlers in `handlers.py` receive one addition (`compare_with_previous_run`) and no rewrites. The plan's `web/app/dashboard/*` paths are adapted to the real `(app)` route group (RECONCILE C-7).

## Delivery order and gates

| Order | Phase | Gate to enter | Definition of done (quickstart §) |
|---|---|---|---|
| 0 | Commit current tree | — | Clean `git status` on a `003-post-mvp-features` branch |
| 1 | **A** Reliability | — | §1: ≥50 scenarios, ≥3 runs, hallucination 0 |
| 2 | **B** Pages | A done | §2: stats equal SQL; read-only Detail |
| — | *Sep 30 submission cut* | | |
| 3 | **A-1 amendment + T-C0** | Owner approval | Constitution v1.1.0 committed; tool swap proven |
| 4 | **C** Lifecycle | A-1, T-C0 | §3 end-to-end, zero reconnects |
| 5 | **F** Live vocabulary | C (shares refresh) | §6 |
| 6 | **D** Comparison | A-1 | §4 |
| 7 | **E** Search | A-1 | §5 |

F moves ahead of D and E (unlike the source plan's order) because C's in-place rebind *is* the F refresh mechanism. Building them together avoids writing it twice. Each phase ends with quickstart §0 (the regression gate) and a commit.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Tool registry > 10 (17 total; ≤12 per session config)**, which requires amendment A-1 (research R-201) | The source plan requires create, associate, start, list, compare and search by voice, and the registry already holds 11 protected tools. | **Displace existing tools**: this violates the additive rule. **One multi-action `manage_experiment` tool**: it merges three confirmation semantics into one enum, which is where selection errors cluster. **Defer C–E**: this is the correct response if A-1 is refused, and it remains the fallback. |
| Registry `scope` + dispatcher step 4a (experiment-less tool calls) | Desk mode has no experiment to anchor ownership on. | **A placeholder experiment per user**: this invents records and violates Principle I (report only real state). **Separate endpoints per desk tool**: that adds a second tool-call path for the model. |
| Two new UI write routes (`POST /experiments/{id}/samples`) and one read endpoint (`GET /experiments/search`) outside `/tools` | Samples come from the UI, not from the model (no tool slot). Search is shared with History so the two cannot diverge. | **A `register_sample` tool**: it spends a slot past the cap. **Browser insert under RLS**: it skips validation and audit (Principles I and II). **Client-side History filtering only**: it duplicates the search rules in TypeScript, which is two declarations (Principle IV). |
| Eval runs stored as files instead of the source plan's `eval_runs` table | Principle III: owner-scoped RLS on every table. | **A table with an owner pinned to the demo user**: this couples a quality artifact to an auth account and needs a new read path in guest mode. |
