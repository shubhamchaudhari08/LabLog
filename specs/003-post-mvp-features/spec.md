# Feature Specification: Post-MVP Product Features

**Feature Branch**: `003-post-mvp-features`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "Implement the post mvp features using the @LabLog_PostMVP_Plan.md file"

**Source**: `LabLog_PostMVP_Plan.md` Phases A–F, reconciled against the codebase in [`docs/RECONCILE.md`](../../docs/RECONCILE.md). Phase G is out of scope (see below). Barcode scanning is excluded, as the source plan requires.

**Amends**: `specs/001-lablog-voice-notebook/spec.md` §Scope, "Out of scope (deferred)". This spec brings the following into scope: additional reliability scenarios and dashboard polish; comparison against previous runs; mid-session vocabulary reconfiguration; voice-driven experiment search; a multi-screen application shell; voice-driven experiment creation. Barcode-driven sample selection stays deferred. Nothing on the 001 "Never" list moves.

**Additive rule**: Every capability listed as PROTECTED in `docs/RECONCILE.md` §3 keeps its current behaviour. Where this spec overlaps one, it extends it.

**Sequencing to the Sep 30 deadline**: P1 stories (A, B) ship first. P2 and P3 stories (C–F) are the post-hackathon roadmap and may land after submission.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Defensible, trended reliability numbers (Priority: P1) · Phase A

A reviewer opens Reliability and sees headline metrics from the latest eval run, a per-category breakdown, a trend line across every committed run, and a scenario-by-scenario drill-down showing what the agent did. They can export the run as JSON or CSV. Each run carries its git sha and model.

**Why this priority**: Reliability is the product's core claim and the highest-value work before submission.

**Independent test**: Run the eval three times. Confirm three run files are committed, and that the page shows three trend points, the category bars, and a drill-down row for every scenario, passing ones included.

**Acceptance Scenarios**:

1. **Given** ≥50 scenarios across the plan's categories, **When** the eval runs, **Then** a new run record is written without overwriting earlier ones, and the "latest" file points at it.
2. **Given** ≥3 recorded runs, **When** Reliability opens, **Then** it shows a trend for task completion and false-record rate, one point per run, labelled with sha and date.
3. **Given** a failed scenario, **When** the user opens it, **Then** they see the utterance, the expected outcome, and every tool call with its result.
4. **Given** any run, **When** the user exports, **Then** they get the same data the page renders, as JSON and as CSV.
5. **Given** any run, **Then** the procedure-hallucination rate is displayed, and its target is 0.

---

### User Story 2 — Home, History and a read-only Detail (Priority: P1) · Phase B

The scientist lands on Home and sees counts for this week, running, completed, with deviations, measurements recorded, and voice-recorded events. Below them are the running and recent experiments. History is a sortable table (code · protocol · date · status · deviations) with filters. Opening a finished experiment from History shows a read-only record with a summary, timeline, measurements with correction badges, observations and deviations, and no microphone.

**Why this priority**: It makes LabLog read as a product on video. Most of it is composition of existing panels.

**Independent test**: Against the seed, check that Home counts match hand-computed SQL. Open STAB-101 from History and confirm the read-only view shows its six temperatures and offers no voice controls.

**Acceptance Scenarios**:

1. **Given** the seed, **When** Home loads, **Then** every stat equals the value from the quickstart's reference SQL.
2. **Given** History, **When** the user filters by status, protocol and date range and sorts by date, **Then** the rows match those filters.
3. **Given** a COMPLETED experiment, **When** opened from History, **Then** Detail renders read-only (no VoiceDock, no mutation controls) using the same panels as the workspace.
4. **Given** a RUNNING experiment, **When** opened from History, **Then** the user reaches the live workspace, which is unchanged.
5. **Given** no RUNNING experiment, **When** Home loads, **Then** it offers **New experiment**. Submitting a name, protocol STAB and samples A1, A2 opens the workspace of a RUNNING `STAB-<n>` with two samples, where the mic starts a voice session.

---

### User Story 3 — Create and start an experiment by voice (Priority: P2) · Phase C

With no experiment open, the scientist starts voice from Home and says "Create an experiment called Enzyme Stability Trial 12". The agent asks which protocol to use and lists what exists. The user answers, the agent confirms, and the experiment is created with a server-generated code. The user says "start it", the agent confirms, and the experiment becomes RUNNING. The workspace opens and voice carries straight on into recording, with no reconnect.

**Why this priority**: This removes the dependency on seeded experiments. It depends on the tool-budget amendment (plan: Complexity Tracking).

**Independent test**: From Home with nothing bound, create, associate and start entirely by voice. Then check the row sequence DRAFT→READY→RUNNING and the three event rows.

**Acceptance Scenarios**:

1. **Given** no protocol named, **When** the user asks to create an experiment, **Then** the agent asks which protocol before anything is written.
2. **Given** creation is confirmed, **Then** the experiment is stored as DRAFT, or as READY if a protocol resolved. Its code is generated by the server, and `EXPERIMENT_CREATED` is audited.
3. **Given** an unknown protocol name, **Then** `PROTOCOL_NOT_FOUND` is returned with the valid alternatives, and nothing is written.
4. **Given** "start it" on an experiment with no protocol, **Then** `NO_PROTOCOL` is returned and nothing changes.
5. **Given** a start without spoken confirmation, **Then** `NEEDS_CONFIRMATION` is returned and nothing changes.
6. **Given** a successful start, **Then** the same voice session switches to recording mode for that experiment without reconnecting.

---

### User Story 4 — "How does this compare with the previous run?" (Priority: P2) · Phase D

During STAB-104 the scientist records A17 at 4.3 C and asks how it compares with the previous run. The agent answers with the previous value, the delta and the percent change. Every number comes from the backend.

**Independent test**: With the seed plus one A17 temperature recorded on STAB-104, the spoken delta equals `current − latest non-superseded A17 temperature in STAB-102`.

**Acceptance Scenarios**:

1. **Given** a matching sample and type in the previous COMPLETED run of the same protocol, **Then** the tool returns current, previous, delta, pct and the previous experiment code.
2. **Given** no previous COMPLETED run, **Then** `NO_PREVIOUS_RUN` is returned.
3. **Given** the sample or type is absent in either run, **Then** `NO_CORRESPONDING_MEASUREMENT` is returned.
4. **Given** the sample or type is omitted, **Then** it defaults to the most recently recorded measurement in the current run.

---

### User Story 5 — Search experiments by voice (Priority: P3) · Phase E

"Show my stability experiments this week", "experiments with deviations", "find experiments containing sample A17". The agent returns a filtered list. Relative dates resolve on the server in the user's time zone, and the model never writes a query.

**Acceptance Scenarios**:

1. **Given** each filter alone and in combination, **Then** the result set equals the reference SQL's result.
2. **Given** `date_range = this_week`, **Then** the bounds are computed by the server, weeks start Monday, and the user's time zone comes from the session, not from the model.
3. **Given** no matches, **Then** the tool succeeds with an empty list and the agent says so.

---

### User Story 6 — The agent learns new terms without reconnecting (Priority: P3) · Phase F

Mid-run, the scientist adds sample B3 from the workspace. Within one turn the agent recognises "B3" and records against it. Speech recognition is biased toward B3, and the prompt lists it, all without a reconnect.

**Acceptance Scenarios**:

1. **Given** a live session, **When** a sample is added, **Then** the browser fetches a refreshed configuration and sends `session.update` with new keyterms and a new prompt. `session.updated` is received and the session id is unchanged.
2. **Given** the eval harness, **Then** entity accuracy is reported separately for terms present in keyterms and terms absent from them.

---

### Edge Cases

- Two experiments are created at once from the same protocol, so both would generate the same code. The unique constraint forces a retry, and neither create fails silently.
- `associate_protocol` is called on a RUNNING or COMPLETED experiment. The call is rejected (`EXPERIMENT_ALREADY_STARTED`), because changing the protocol under recorded data falsifies the record.
- The protocol reference is ambiguous (two protocols share a name). The call returns `AMBIGUOUS_PROTOCOL` with the candidates and writes nothing.
- The previous run's value has been corrected. The comparison uses the non-superseded value.
- Zero is the previous value. `pct` is `null` and the agent says the percent change is undefined.
- A sample is added to a COMPLETED experiment. The request is rejected.
- `session.update` fails mid-session (`immutable_field` or `invalid_value`). The session continues with the previous configuration and the UI shows that the vocabulary did not refresh. The UI does not claim success (Principle V).
- The search's time zone header is missing or invalid. The search falls back to UTC, and the result says which zone was used.

## Requirements *(mandatory)*

### Functional Requirements

**Phase A: Reliability**
- **FR-201**: The scenario bank MUST hold ≥50 scenarios covering: tool selection, argument extraction, entity accuracy (sample, number, unit), ambiguity, correction vs. new measurement, observation vs. measurement, procedure-hallucination bait, unknown sample, completion gate, multi-entity utterances, unit traps, paraphrase variants, and every tool this spec adds.
- **FR-202**: Each eval run MUST be persisted as an immutable record (sha, model, timestamp, metrics, per-scenario details). Earlier runs MUST NOT be overwritten.
- **FR-203**: Reliability MUST show the category breakdown, the trend across runs, a per-scenario drill-down (pass and fail), a last-run badge (sha and model), and export as JSON and CSV. Every figure MUST come from run files produced by the harness.
- **FR-204**: A systematic agent error found by the eval MUST be fixed in the prompt or the handlers, never by weakening a scenario.

**Phase B: Pages**
- **FR-210**: Home MUST show: experiments created this week, running, completed, experiments with ≥1 deviation, current (non-superseded) measurements, and events carrying a `voice_session_id`.
- **FR-211**: History MUST list code, name, protocol, date, status and deviation count. It MUST filter by status, protocol and date range, and sort by date and code.
- **FR-212**: A read-only Detail view MUST reuse the workspace panels in a mode that renders no voice or mutation controls.
- **FR-213**: The existing workspace, Protocols screens and Settings MUST be unchanged in behaviour.
- **FR-214**: Home and Experiments MUST offer a quick **create/resume** path, as source plan Phase B requires ("quick create/resume experiment"). It is a form taking a name, an optional protocol and sample codes. It creates the experiment and, when a protocol is chosen, starts it, then opens the workspace where voice runs. A READY experiment's workspace MUST offer **Start**. This is a UI write route like 002's `POST /protocols`, and it adds no voice tool, so it does not depend on amendment A-1. *(Added 2026-09-25: with no RUNNING experiment in the database, the app had no path to a voice session.)*

**Phase C: Voice lifecycle**
- **FR-220**: `create_experiment` MUST generate the experiment code on the server, create DRAFT (READY if a protocol resolves), accept optional sample codes, require confirmation, and audit `EXPERIMENT_CREATED`, plus `SAMPLE_CREATED` per sample.
- **FR-221**: `associate_protocol` MUST resolve the protocol among those readable by the user. It MUST reject unknown and ambiguous references with alternatives, reject experiments that have started, move DRAFT→READY, and audit `PROTOCOL_ASSOCIATED`.
- **FR-222**: `start_experiment` MUST require `confirmed=true` and an attached protocol, move READY→RUNNING, set `started_at` on the server, and audit `EXPERIMENT_STARTED`.
- **FR-223**: `list_protocols` MUST return only protocols the user can read.
- **FR-224**: A voice session MUST be possible with no bound experiment (desk mode). It MUST rebind to an experiment in place when one is created or opened, without reconnecting.
- **FR-225**: Experiment references MUST resolve only within the caller's own experiments. Ownership MUST be checked explicitly before dispatch.
- **FR-226**: `write_protocol_step(new_protocol=true)`, the existing DRAFT→RUNNING path, MUST keep working unchanged.

**Phase D: Comparison**
- **FR-230**: `compare_with_previous_run` MUST compute the delta and percent change in backend code. The prompt MUST instruct the agent to speak only the returned numbers.
- **FR-231**: The previous run is the most recent COMPLETED experiment owned by the user with the same `protocol_id`, where `completed_at` is earlier than the current experiment's `started_at`, or earlier than now if the current experiment has not started.

**Phase E: Search**
- **FR-240**: `search_experiments` MUST accept only enumerated or typed filters. `date_range` MUST be one of `today, yesterday, this_week, last_week, this_month`, resolved on the server in the session's IANA time zone.
- **FR-241**: The same search function MUST back both the tool and History's server-side filter endpoint.

**Phase F: Vocabulary**
- **FR-250**: The backend MUST serve a refreshed session configuration (prompt, keyterms, tools, but not the greeting and not the voice) for a bound experiment, or for desk mode.
- **FR-251**: The browser MUST send it as `session.update` after any successful change that alters the vocabulary or the tool profile: create, associate, start, sample added, and protocol step written.
- **FR-252**: Samples MUST be addable to a non-terminal experiment through a validated, audited endpoint.

**Cross-cutting**
- **FR-260**: Every new mutation MUST follow authenticate → authorize → validate → write → audit → return, with server timestamps and no time field in any argument model.
- **FR-261**: Every new tool MUST ship with eval scenarios and handler tests that assert the row was not written on rejection.
- **FR-262**: No single session configuration may expose more than 12 tools. This depends on constitution amendment A-1.

### Key Entities

- **Eval run** (file): an immutable record of one harness execution.
- **Tool profile**: the set of tools and the prompt variant exposed for a session state (desk / setup / bench).
- **Experiment lifecycle events**: `EXPERIMENT_CREATED`, `PROTOCOL_ASSOCIATED`, `EXPERIMENT_STARTED`, `SAMPLE_CREATED`.

See [data-model.md](data-model.md).

## Success Criteria *(mandatory)*

- **SC-201**: ≥50 scenarios. ≥3 persisted runs. Procedure-hallucination rate = 0 in the latest run.
- **SC-202**: Tool-selection accuracy per profile must be ≥ the MVP baseline run on the same model. This is the amendment A-1 gate.
- **SC-203**: Every Home stat equals its reference SQL on the seed.
- **SC-204**: Create → associate → start by voice completes with zero reconnects. Three event rows are written.
- **SC-205**: The comparison numbers the agent speaks match the tool result exactly in 100% of comparison scenarios.
- **SC-206**: The search results for the three example queries equal the reference SQL.
- **SC-207**: A sample added mid-session is recognised on the next turn, with `session_id` unchanged.
- **SC-208**: Every test suite from 001 and 002 still passes, and PROTECTED behaviour is unchanged.

## Out of Scope

Phase G in full: PDF protocol import and instrument ingestion (on the 001 "Never" list), reports and export narratives, notifications, collaboration and e-signatures, multilingual operation, telephony, and anomaly detection. Each needs its own spec. Also out of scope: barcode scanning, semantic (pgvector) search (the E+ stretch), audio-level TTS eval (the A stretch, deferred unless time remains), voice protocol creation beyond the existing `write_protocol_step`, and unit conversion.

## Assumptions

- A single user owns each experiment. There is no sharing.
- `session.update` accepts `system_prompt`, `input.keyterms` and `tools` after `session.ready`, and rejects `greeting` and `output.voice` (research R-202). Tool mutability must be confirmed empirically in the first Phase C task.
- The eval continues to run text-level through the LLM Gateway against the real handlers over the in-memory store.
- A browser time zone reported with the session is trusted for date bucketing only. It is never used for stored timestamps.
