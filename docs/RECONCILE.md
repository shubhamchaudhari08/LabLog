# Reconcile: Post-MVP Plan vs. Current Codebase (Phase R)

**Date**: 2026-09-25 · **Branch**: `001-lablog-voice-notebook` (with uncommitted work) · **Scope**: `LabLog_PostMVP_Plan.md` Phases A–G
**Rule**: No code changed in this phase. This file is the input to `specs/003-post-mvp-features/`.

> **Before starting 003**: the working tree holds ~40 uncommitted changes (the 002 manual-protocol-authoring feature, the `(app)` route group, `AppShell`, `VoiceSession`, `vocabulary.py`, settings). Commit them first. 003 is planned against this tree, and building on uncommitted work makes it impossible to tell regressions from pre-existing state.

---

## 1. Inventory

### Database (`supabase/migrations/`)

| Table | State | Notes |
|---|---|---|
| `protocols` | Built (0001) | Steps are embedded JSONB. `owner_id NULL` means a shared library protocol. |
| `experiments` | Built (0001) | The status check already allows `DRAFT, READY, RUNNING, PAUSED, COMPLETED, CANCELLED`. `experiment_code` is **globally** unique. |
| `samples` | Built (0001) | `unique (experiment_id, sample_code)`. **No write path exists anywhere**: samples come only from the seed. |
| `measurements` | Built (0001) | Uses supersession. Partial index `measurements_current_idx (experiment_id, sample_id, measurement_type) where superseded_by is null`. |
| `observations`, `deviations` | Built (0001) | — |
| `events` | Built (0001, 0002) | `experiment_id` became nullable in 0002, for `PROTOCOL_CREATED`. |
| `eval_runs` | **Absent** | Plan A proposes it. See conflict C-4. |
| `v_experiment_stats` view | **Absent** | Plan B lists it as optional. |
| Index `(protocol_id, status, completed_at desc)` | **Absent** | Plan D needs it. |

### Tool registry (`api/app/tools/models.py`): 11 tools

`get_active_experiment`, `record_measurement`, `correct_measurement`, `record_observation`, `create_deviation`, `get_next_protocol_step`, `complete_protocol_step`, **`write_protocol_step`**, `get_sample_history`, `check_experiment_completeness`, `complete_experiment`.

The registry is already one over the constitution's ten-tool ceiling. A `ponytail:` note in `models.py` acknowledges this. See conflict C-1.

### Backend routes

| Route | Purpose |
|---|---|
| `GET /health` | Liveness check |
| `GET /voice/bootstrap?experiment_id=` | Mints a token and returns the server-authored session config. **`experiment_id` is required.** |
| `POST /tools` | The single mutation path for model calls. **Requires `experiment_id`.** |
| `POST /protocols` | Manual protocol authoring (spec 002). |
| `GET /settings/measurement-types` | Read-only vocabulary. |

### Frontend (`web/app/(app)/`)

| Route | What it is |
|---|---|
| `/dashboard` | Overview. Tiles show total experiments, running, protocols, and readings. Lists recent experiments and protocols. |
| `/experiments` | History list with a status tab filter and a search over code and name. |
| `/dashboard/experiments/[id]` | **Live workspace**: SampleBoard, Ledger, Timeline, ProtocolSteps rail, VoiceDock. |
| `/protocols`, `/protocols/new` | Protocol library and manual create form (spec 002). |
| `/reliability` | Renders `web/public/metrics.json`: headline metrics, git sha and model. |
| `/settings/measurements`, `/settings/account` | Vocabulary view and account screen. |

### Agent and eval

- **Prompt** (`tools/prompt.py`): experiment-bound only. **Keyterms**: sample codes, then the experiment code, then vocabulary terms. The list is capped at 100 and sent once, at bootstrap.
- **Eval** (`api/eval/`): 36 scenarios in 7 categories. Categories: normal_capture 10, ambiguity 6, correction 4, classification 4, invalid_input 3, refusal 5, completion 4. The eval runs against the real handlers over an in-memory store and writes `web/public/metrics.json`, which holds `by_category`, `failures`, `git_sha` and `model`. **`web/public/` does not exist: no run has been committed.**

---

## 2. Feature status (Plan A–G)

| Phase | Feature | Status | Evidence / gap |
|---|---|---|---|
| **A** | Scenario bank of 50–80 | **Partial** | 36 scenarios. The plan's categories with no scenarios: entity accuracy (unit), multi-entity, unit traps, paraphrase sets, and every Phase C–E tool. |
| A | Persisted runs + trend | **Absent** | Only one `metrics.json` is written, and it is overwritten on every run. |
| A | Category breakdown | **Partial** | `by_category` is computed but not rendered as a breakdown. |
| A | Per-scenario drill-down | **Partial** | Only `failures[]` is emitted. Passing scenarios leave no trace. |
| A | Export JSON/CSV, last-run badge | **Partial** | The sha and model are shown. There is no export. |
| A | Audio-level eval | **Absent** | Stretch. |
| **B** | Home stats | **Partial** | Missing: this week, with-deviations, and voice-recorded events. |
| B | History table | **Partial** | The list exists. Missing: protocol, date and deviation-count columns, sorting, and the Phase E filter params. |
| B | Read-only Detail | **Absent** | `/dashboard/experiments/[id]` is the live workspace. There is no read-only mode. |
| B | Protocol Library + manual create | **Done** | Spec 002. **PROTECTED.** |
| **C** | `create_experiment` | **Absent** | — |
| C | `associate_protocol`, `start_experiment`, `list_protocols` | **Absent** | `write_protocol_step(new_protocol=true)` already moves a DRAFT experiment to RUNNING. It is a separate, protected lifecycle path. |
| C | Experiment-less voice session | **Absent** | Bootstrap, the dispatcher and `VoiceSession` all require a bound experiment. |
| **D** | `compare_with_previous_run` | **Absent** | The seed has three COMPLETED runs of STAB (STAB-100 to STAB-102) with A17, A18 and CONTROL-01 temperatures, which is enough history. |
| **E** | `search_experiments` | **Absent** | `/experiments` does client-side filtering only. |
| **F** | Keyterm boosting | **Partial** | Keyterms are sent once, at bootstrap. There is no refresh mid-session. |
| F | Live `session.update` on change | **Absent** | `useVoiceAgent` sends `session.update` only on open and on resume fallback. |
| F | Sample creation (needed for the Phase F DoD) | **Absent** | There is no path that writes samples. |
| **G** | PDF import, instrument ingestion | **Absent. Constitution non-goal** | Spec 001 "Never" list. |
| G | Reports, notifications, collaboration, multilingual, telephony, anomaly detection | **Absent** | Roadmap only. |

---

## 3. PROTECTED: built beyond the original MVP plan

Do not remove, rewrite or regress any of these. Extend them only.

| # | Extension | Location |
|---|---|---|
| P-1 | **Voice protocol authoring**: `write_protocol_step` handles append, edit, remove and `new_protocol` restart, including the DRAFT→RUNNING start path and the shared-protocol guard. | `tools/models.py`, `tools/handlers.py`, `tools/prompt.py` |
| P-2 | **Manual protocol authoring**: `POST /protocols`, `PROTOCOL_CREATED` with a null `experiment_id`, and the `/protocols/new` form. | `routers/protocols.py`, migration 0002, `web/app/(app)/protocols/*`, `ProtocolSteps.tsx` |
| P-3 | **Measurement vocabulary module**: the single source for keyterms, unit suggestions, and the field descriptions of `record_measurement`. | `tools/vocabulary.py`, `routers/settings.py`, `/settings/measurements` |
| P-4 | **Multi-page app shell**: sidebar, breadcrumbs, the voice chip in the header, and the `(app)` route group. | `components/shell/AppShell.tsx`, `web/app/(app)/layout.tsx` |
| P-5 | **Voice session lifted above routes**: the microphone survives navigation, and one experiment is bound per session. | `components/voice/VoiceSession.tsx`, `VoiceDock.tsx` |
| P-6 | **Guest mode**: a real session is created without the login form. | `web/lib/supabase.ts`, `(auth)/login` |
| P-7 | **Split-screen bench console / SampleBoard hero** | `components/workspace/*` |
| P-8 | **Auth clock-skew handling** | `api/app/deps.py`, `tests/test_auth_clock.py` |
| P-9 | **Dashboard index of experiments and protocols** | `(app)/dashboard/page.tsx`, `ExperimentList.tsx` |

---

## 4. Conflicts foreseen

| # | Conflict | Proposed resolution | Needs owner approval? |
|---|---|---|---|
| C-1 | The **constitution caps tools at 10.** The registry already has 11, and C, D and E add 6 more. | Use **mode-scoped tool profiles**, swapped live through `session.update` (verified mutable). Amend the cap to "≤12 tools in any one session configuration, gated by eval tool-selection accuracy". See 003 research R-201. | **YES**: this is a constitution amendment. |
| C-2 | The **constitution scope rule** says deferred features must not be built until the spec is amended. | Spec 003 amends spec 001's "Out of scope (deferred)" list. | Covered by approving spec 003. |
| C-3 | **Phase G** PDF import and instrument ingestion are on the spec-001 "Never" list. | G is excluded from 003. Each item needs its own spec and, where applicable, its own amendment. | No, because it is deferred. |
| C-4 | The **`eval_runs` table** would have no owner, but Principle III requires owner-scoped RLS on every table. | Persist runs as committed JSON files. This extends the existing `metrics.json` pipeline. There is no table. | No |
| C-5 | Plan C's `create_experiment` has no `confirmed` flag, but the invariants require confirmation for create and start. | Add `confirmed: bool` to both. | No |
| C-6 | Voice-created experiments would have **no samples**, and nothing can record against them. The Phase F DoD also needs a sample to be added mid-session. | Give `create_experiment` optional `sample_codes`, and add `POST /experiments/{id}/samples` (UI). No new tool. | No |
| C-7 | Plan B routes live under `web/app/dashboard/`. The real routes are `(app)/dashboard`, `/experiments` and `/protocols`. | Adapt the plan to the code. Detail goes at `/experiments/[id]` (read-only). The workspace stays at `/dashboard/experiments/[id]`. | No |
| C-8 | Plan A names `ReliabilityDashboard.tsx`, which does not exist. | Extend `(app)/reliability/page.tsx`. | No |
