# LabLog — Post-MVP Feature Plan (v2)

**Voice-Native AI Laboratory Notebook & Experiment Copilot**
Companion to `LabLog_Implementation_Plan.md`. The MVP is built. This plan covers the features that were deferred from MVP (minus barcode scan, intentionally excluded), plus a lighter roadmap of further extensions.

> **How to use with Claude Code.** Work phase by phase (Phase R first, then A→G by priority). One phase per session: `/clear`, pull in the phase section, plan-mode it, implement, test the Definition of Done, commit. Do **not** implement multiple phases at once.

> **⚠️ Two hard rules that override everything below.**
> 1. **Do Phase R (inventory) before writing any code.** The codebase has changed since the original plan — features were added on top of the MVP. Discover the real current state first.
> 2. **This plan is additive. Never remove, rewrite, or regress existing functionality — including extensions added beyond the original MVP plan.** Where this plan overlaps something already built, *extend it*, don't replace it. If a planned change would conflict with existing code, **stop and ask** before changing it.

---

## Deadline note (read before choosing scope)

If the AssemblyAI hackathon deadline (Sep 30) is still in play, spend the remaining days on **Phase A (reliability & eval hardening)** and the highest-impact slices of **Phase B (multi-page dashboard)** — those directly raise the judged reliability story and make the app feel like a product on video. Treat **Phases C–G as the post-hackathon roadmap** (they deepen the product but won't change a judge's score much in five days). The plan is written in full regardless; just sequence to the deadline.

---

## Carry-forward invariants (unchanged from MVP — keep enforcing these)

Every new feature obeys the same architecture that won the MVP:

- **FastAPI backend, Next.js frontend, Supabase.** Browser audio WebSocket stays browser↔AssemblyAI.
- **No agent framework.** AssemblyAI owns the agent loop; the backend is a validated dispatcher. Pydantic for validation, plain functions for routing.
- **The model never writes to the DB directly.** Every mutation goes through a validated tool handler: authorize → resolve/normalize → validate → write → audit → return, with an explicit `owner_id == user_id` check (service role bypasses RLS).
- **Server-generates all timestamps.** Reject any tool arg supplying a time.
- **Append-only `events` audit trail** on every mutation. Corrections supersede, never delete.
- **Tool schema single source of truth:** Pydantic model → `_openai_fn` wrapper → `TOOL_SCHEMAS`. Never hand-write JSON schemas.
- **The agent never does arithmetic or invents procedure.** Calculations happen in backend code; protocol steps come only from stored data.
- **Every new tool ships with eval scenarios** (added to the Phase A bank).
- **Confirmation gates** for sensitive actions (create/start/complete/cancel/notify).

---

## Table of contents
- **Phase R** — Reconcile with the current codebase (mandatory first)
- **Phase A** — Reliability & eval hardening *(highest submission ROI)*
- **Phase B** — Multi-page dashboard (Home / History / Detail / Protocol Library)
- **Phase C** — Voice-driven experiment & protocol creation
- **Phase D** — Previous-run comparison
- **Phase E** — Voice experiment search
- **Phase F** — Dynamic vocabulary / live agent reconfiguration
- **Phase G** — Further extensions (lighter roadmap)
- Working-agreement addendum
- Suggested sequencing

---

## Phase R — Reconcile with the current codebase (do this first)

**Goal:** know exactly what exists before planning changes, and lock a protection list around everything already built.

**Steps for Claude Code:**
1. Inventory the repo and produce a **feature-status table** covering: DB tables + columns (vs §6 of the MVP plan), tool registry (`api/app/tools/models.py`), tool handlers, FastAPI routes, frontend routes/components, the agent system prompt, and eval scenarios.
2. For each feature in this plan (A–G), mark **Done / Partial / Absent** against what's actually in the code.
3. Identify anything present that is **not** in the original MVP plan — these are user-added extensions. Mark them **PROTECTED** in the report.
4. Output a short `docs/RECONCILE.md` with the table + the protected list + any conflicts you foresee between this plan and existing code.

**Rules:**
- Extend or compose with existing code; never rewrite a working module to match this plan's naming.
- If a planned tool/table/component already exists (even partially or differently named), adapt this plan to it, not the reverse.
- If a planned change conflicts with a PROTECTED extension, **ask before proceeding.**

**DoD:** `docs/RECONCILE.md` exists, every A–G feature is marked, and the protected list is explicit. No code changed in this phase.

---

## Phase A — Reliability & eval hardening  *(do this first after Phase R)*

**Goal:** turn the MVP's reliability dashboard into a credible, defensible quality story — the single highest-value thing you can do before submission, and your core differentiator.

### Work
1. **Expand the scenario bank to 50–80 scenarios** in `api/eval/scenarios.py`, across categories:
   - tool selection · argument extraction · **entity accuracy** (sample-id, number, unit) · ambiguity clarification (missing sample/unit/vague value) · correction-vs-new-measurement · observation-vs-measurement · **procedure-hallucination bait** (must refuse) · unknown-sample rejection · completion gate · multi-entity-in-one-utterance · unit traps (e.g. "37" with/without protocol default).
   - Include **paraphrase variants** of each core intent so the numbers mean something.
2. **Persist runs** (new table below) so the dashboard shows a **trend over time** and a per-run git sha, not a single static snapshot.
3. **Dashboard upgrades** (`ReliabilityDashboard.tsx`): per-category breakdown, trend line across runs, per-scenario drill-down (pass/fail + what the agent did), export JSON/CSV, "last run" badge with git sha and model.
4. **Audio-level eval (stretch within this phase):** TTS-synthesize the utterances, stream them through the *real* voice pipeline end-to-end, and assert outcomes. This yields honest interruption/turn-detection/entity numbers instead of text-only ones. Verify what TTS is available (AssemblyAI voice or a separate TTS for the *input* audio) before building.

### Data model
```sql
create table eval_runs (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  git_sha        text,
  model          text,
  scenario_count int,
  metrics        jsonb,   -- {tool_selection_acc, arg_acc, entity_acc, clarify_rate,
                          --  false_record_rate, hallucination_rate, completion_rate,
                          --  rejection_correctness, interruption_success}
  details        jsonb    -- per-scenario: {id, category, expected, actual, pass}
);
alter table eval_runs enable row level security;
-- keep simple: owner-only or service-only read for the demo account
```

### Tools / prompt
None new (eval is offline). If any scenario reveals a systematic agent error, fix it in the **system prompt**, not by weakening the eval.

### Eval / metrics
Report, and display: tool-selection accuracy · argument accuracy · **entity accuracy** · ambiguity-clarification rate · **false-record-creation rate** · **procedure-hallucination rate (target 0)** · task-completion rate · backend-rejection correctness · interruption success (audio-level only).

**DoD:** ≥50 scenarios; real metrics persisted across ≥3 runs; dashboard shows category breakdown + trend + drill-down; hallucination rate 0. You can answer "how did you measure this?" with the script + repo.

---

## Phase B — Multi-page dashboard

**Goal:** Home / History / Detail / Protocol Library, so LabLog reads as a product, not one screen. Mostly frontend + read queries (reads go **directly to Supabase** from the browser under RLS; add FastAPI GET endpoints only if you want a single API surface).

### Pages
- **Home** — stats (experiments this week, running, completed, with deviations, measurements recorded, voice-recorded events); recent + running experiments; quick "create/resume experiment."
- **History** — table (code · protocol · date · status · deviation count) with filter/sort; row → Detail. (Wire the same filter params Phase E's search tool uses.)
- **Detail (read-only)** — summary, timeline, measurements (with correction badges), observations, deviations. **Reuse the workspace panels in a read-only mode** rather than duplicating them.
- **Protocol Library** — list protocols; view steps + required fields; create a demo protocol via a manual form (voice/PDF creation come later). Protocol editing stays manual for now.

### Data model
No new tables. Optional Postgres view for Home stats:
```sql
create view v_experiment_stats as
select owner_id,
       count(*) filter (where status='RUNNING')   as running,
       count(*) filter (where status='COMPLETED') as completed,
       count(*) filter (where created_at > now() - interval '7 days') as this_week
from experiments group by owner_id;
```
(Or compute client-side for small data.)

### Frontend
New routes under `web/app/dashboard/`: home, `experiments/` (history), `experiments/[id]` read-only detail (distinct mode from the live workspace), `protocols/`. Keep the existing live workspace screen untouched.

**DoD:** navigate all four pages; Home stats correct against seed; Detail renders full read-only history; Library lists protocols and can create a demo protocol.

---

## Phase C — Voice-driven experiment & protocol creation

**Goal:** create and start experiments (and associate protocols) by voice, beyond seeded data; full status lifecycle DRAFT → READY → RUNNING.

### Tools (add to registry; Pydantic models + wrapper)
```python
class CreateExperimentArgs(BaseModel):
    name: str
    description: Optional[str] = None
    protocol_ref: Optional[str] = None   # protocol name/code; if absent, agent asks

class AssociateProtocolArgs(BaseModel):
    experiment_ref: str                  # code or name
    protocol_ref: str

class StartExperimentArgs(BaseModel):
    experiment_ref: str
    confirmed: bool

class ListProtocolsArgs(BaseModel):
    pass
```
Register: `create_experiment`, `associate_protocol`, `start_experiment`, `list_protocols`.
(**Do not** add voice *protocol* creation — authoring steps by voice is clunky; keep protocol creation in the Library UI / Phase G PDF import.)

### Handlers / validation
- `create_experiment`: generate a unique `experiment_code` server-side; create DRAFT; if `protocol_ref` given, resolve + associate, else return a flag so the agent asks. `EXPERIMENT_CREATED` event. Confirm before creating.
- `associate_protocol`: resolve protocol (error `PROTOCOL_NOT_FOUND`); set on experiment; move DRAFT→READY when a protocol is attached.
- `start_experiment`: require `confirmed=true` and a protocol attached; set READY→RUNNING, `started_at=now()`; error `NO_PROTOCOL` / `NEEDS_CONFIRMATION`. `EXPERIMENT_STARTED` event.

### Prompt additions
Creation flow: if no protocol given, ask which; confirm before create/start; after start, load context (reuse `get_active_experiment`).

### Eval scenarios
"Create an experiment called Enzyme Stability Trial 12" → `create_experiment` + asks for protocol · "use enzyme stability v2" → `associate_protocol` · "start it" → confirm → `start_experiment` · start with no protocol → `NO_PROTOCOL` handled.

**DoD:** from Home with no active experiment, create → associate → start entirely by voice; experiment shows RUNNING and the workspace loads.

---

## Phase D — Previous-run comparison

**Goal:** "How does this compare with the previous run?" — with deltas computed in the backend, **never** by the LLM.

### Tool
```python
class CompareWithPreviousRunArgs(BaseModel):
    sample_ref: Optional[str] = None        # defaults to a sensible sample if omitted
    measurement_type: Optional[str] = None  # defaults to the last-recorded type
```
Register `compare_with_previous_run`.

### Handler (all arithmetic server-side)
1. Find the previous experiment: same `protocol_id`, `status='COMPLETED'`, most recent `completed_at` before the current experiment. None → `NO_PREVIOUS_RUN`.
2. Match sample by `sample_code`; match `measurement_type`; take the latest non-superseded value in each run. Missing → `NO_CORRESPONDING_MEASUREMENT`.
3. Compute `delta = current - previous` and percent change.
4. Return `{ current, previous, delta, pct, prev_experiment_code }`. The agent narrates from these numbers only.

### Data model
No new tables; add index `create index on experiments (protocol_id, status, completed_at desc);` and ensure measurement lookups by (experiment_id, sample_id, measurement_type) are indexed.

### Eval
Comparison with a previous run (assert exact backend delta) · no previous run · missing corresponding sample · defaulting when sample/type omitted.

**DoD:** spoken comparison returns correct deltas from seeded history; no-previous-run and missing-sample handled gracefully; the number the agent says equals the backend's computed number.

---

## Phase E — Voice experiment search

**Goal:** "Show my PCR experiments this week", "experiments with temperature deviations", "find experiments containing sample A17" — structured filtering, **no LLM-generated SQL**.

### Tool
```python
class SearchExperimentsArgs(BaseModel):
    protocol_ref: Optional[str] = None
    status: Optional[str] = None
    date_range: Optional[str] = None        # enum token, resolved server-side
    #   one of: today, yesterday, this_week, last_week, this_month
    has_deviations: Optional[bool] = None
    contains_sample: Optional[str] = None
    measurement_type: Optional[str] = None
    free_text: Optional[str] = None
```
Register `search_experiments`.

### Handler
- **Resolve relative dates server-side** from the `date_range` enum (don't let the model compute date bounds — that's arithmetic).
- Build a **parameterized** query from the provided filters; join deviations for `has_deviations`, samples for `contains_sample`.
- Return `[{code, name, protocol, date, status, deviation_count}]`. The agent summarizes; the History page (Phase B) can render the same result set.

### Eval
Each filter type individually · combined filters · empty results · relative-date resolution correctness.

### Stretch (Phase E+)
Semantic search over observations/notes via **pgvector** embeddings ("find experiments about cloudy samples"). Add an `embeddings` column/table and a `semantic_search` path; keep structured filtering as the default.

**DoD:** the three example queries return correct filtered sets; relative dates resolve server-side; no raw SQL is ever produced by the model.

---

## Phase F — Dynamic vocabulary / live agent reconfiguration

**Goal:** inject experiment-specific terminology (sample IDs, reagents, equipment, protocol step names) and update the agent's context/tools mid-session **without reconnecting** — the software replacement for the (removed) barcode entity-accuracy insurance.

> **Verify against live AssemblyAI docs first:** (a) whether the Voice Agent API supports **keyterm / word-boosting / vocabulary hints** for STT, and (b) live `session.update` of prompt/tools mid-session without a reconnect. Build to whatever the current API actually exposes.

### Work
- Build a per-experiment **vocabulary set**: sample codes, protocol step names, measurement types, plus an optional configurable reagent/equipment list.
- On experiment start **and on change** (e.g., a new sample is created), send a `session.update` to refresh the injected context — and, **if the API exposes keyterm/word-boost params, pass the vocabulary there** (the biggest entity-accuracy win).
- Fall back to prompt-context injection only if keyterm boosting isn't available for the voice agent.

### Data model
Optional `alter table experiments add column vocabulary jsonb default '{}';` (or derive dynamically from samples + protocol).

### Eval
Measure **entity accuracy on boosted vs non-boosted terms** (reuse the Phase A harness) and show the lift; verify that creating a sample mid-session makes the agent recognize it without reconnecting.

**DoD:** adding a sample mid-session updates the agent's known samples with no reconnect; domain-term entity accuracy improves measurably in the eval.

---

## Phase G — Further extensions (lighter roadmap; product-spec stretch)

Concise specs — pick as post-hackathon roadmap. Each keeps every carry-forward invariant (backend validation, server timestamps, append-only events, no LLM arithmetic/procedure invention, human gates).

- **Protocol PDF import (human-approval gate).** Upload SOP PDF → parse steps (consider **Docling** for tables/scanned content) → staging table `protocol_drafts` → human reviews/edits in Library → approve → becomes an executable protocol. **Never executable until approved.**
- **AI experiment report / narrative.** `generate_experiment_report`: facts (durations, counts, deltas) from SQL; the model only phrases them. Export to PDF / Word (python-docx). Grounding is mandatory — numbers come from the DB.
- **Notifications.** `send_notification` tool → Slack/email ("notify Sarah of the deviation"). Integration config + confirmation gate.
- **Instrument data ingestion.** Import CSV / instrument reading and associate with a sample ("import the latest reading from instrument three for A17"). Moves LabLog toward lab orchestration.
- **Team collaboration / PI review / e-signatures.** Multi-user, roles, review + immutable sign-off built on the existing `events` audit trail. Bigger lift; strongest regulated-market value.
- **Multilingual lab operation.** Multilingual STT + localized prompts.
- **Telephony / phone agent.** AssemblyAI + Twilio/LiveKit so a bench phone or hands-free headset can call in.
- **Anomaly detection.** Flag out-of-range measurements against protocol-expected ranges — deterministic thresholds first, ML later.

---

## Working-agreement addendum (in addition to the MVP plan's §17)

1. **Phase R before any code.** Produce `docs/RECONCILE.md`; mark user extensions PROTECTED.
2. **Additive only.** Extend/compose; never remove, rewrite, or regress existing functionality. Conflict with existing/PROTECTED code → **ask first**.
3. **Adapt the plan to the code, not the code to the plan** where something already exists under a different shape/name.
4. Keep the **tool-schema single source of truth** (Pydantic → `_openai_fn`).
5. **Every new tool ships with eval scenarios** added to the Phase A bank.
6. **Verify AssemblyAI features against live docs** before Phase F (keyterms, live session update).
7. One phase per session; **DoD before moving on**; commit per working increment; keep backend handlers + RLS on manual review.
8. Barcode scan is **out of scope** — do not implement it.

Suggested first prompt to Claude Code:
> "Read `LabLog_PostMVP_Plan.md`. Do **Phase R only**: inventory the current codebase, produce `docs/RECONCILE.md` marking every A–G feature as Done/Partial/Absent and listing any functionality that exists beyond the original MVP plan as PROTECTED. Change no code. Then stop and show me the report."

---

## Suggested sequencing

**R** (reconcile) → **A** (reliability, biggest ROI) → **B** (multi-page) → **C** (voice creation) → **D** (comparison) → **E** (search) → **F** (dynamic vocab) → **G** (pick-and-choose).

If the Sep 30 deadline is live: **R → A → the top slices of B**, then submit; **C–G are the post-hackathon roadmap.**
