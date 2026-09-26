# Feature Specification: LabLog — Voice-Native AI Laboratory Notebook

**Feature Branch**: `001-lablog-voice-notebook`

**Created**: 2026-09-15

**Status**: Derived (see note)

**Input**: `LabLog_Implementation_Plan.md` (repo root) — the authoritative product/build brief authored by the project owner.

> **Note on provenance.** This spec was *derived* from `LabLog_Implementation_Plan.md` rather than authored via `/speckit-specify`. The source document is a combined product brief + build spec; this file extracts the **what/why** (scope, user journeys, requirements, success criteria) so that `/speckit-plan` and `/speckit-tasks` have a stable requirements surface. The **how** lives in `plan.md`. Where the two disagree, the source document wins and this file should be corrected.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Record a measurement by voice, hands busy (Priority: P1)

A scientist wearing gloves, mid-procedure, speaks "A17 is 4.2 Celsius." Within roughly a second the measurement table on the wall-mounted screen shows a new row for sample A17, and the agent says "Recorded. A17 temperature is 4.2 degrees Celsius." No keyboard, no mouse, no glove removal.

**Why this priority**: This is the entire product thesis compressed into one interaction — spoken language becoming a validated, persisted, auditable laboratory record. Every other story is an elaboration. If only this ships, LabLog is still a demonstrable product.

**Independent test**: With a seeded RUNNING experiment, speak the utterance and verify (a) a `measurements` row exists with the right sample, value and unit, (b) an `events` row records the creation, (c) the UI updated, (d) the agent's spoken confirmation matches the stored row.

**Acceptance scenarios**:
1. **Given** experiment STAB-104 is RUNNING with samples A17, A18, CONTROL-01, **When** the user says "A17 is 4.2 Celsius", **Then** a measurement row is created with `sample_code=A17, measurement_type=temperature, value=4.2, unit=C` and the agent confirms by restating the stored values.
2. **Given** the same context, **When** the user says "record 4.2 for A17" (experiment not restated), **Then** the same row is created — the active experiment is implicit.
3. **Given** a successful write, **When** the tool result returns, **Then** the measurement table reflects it without a page refresh.

---

### User Story 2 — The system refuses to guess (Priority: P1)

The scientist says something incomplete or ambiguous: "Temperature is 4.2 Celsius" (which sample?), or "A17 is 37" (which unit?), or names a sample that does not exist. The agent asks exactly one short clarifying question instead of inventing a value, and no record is written until the ambiguity is resolved.

**Why this priority**: A lab notebook that silently guesses is worse than no notebook. This is the reliability story and the credibility of the whole product; it is also the behaviour most likely to be probed by a skeptical evaluator.

**Independent test**: Run each ambiguous utterance and assert that no row was created and that a clarifying question was asked; then answer the question and assert the row is created correctly.

**Acceptance scenarios**:
1. **Given** three samples exist, **When** the user says "temperature is 4.2 Celsius", **Then** no measurement is written and the agent asks which sample.
2. **Given** a measurement type with no protocol-default unit, **When** the user says "A17 is 37", **Then** no measurement is written and the agent asks for the unit.
3. **Given** samples A17/A18/CONTROL-01, **When** the user says "A99 is 4.1", **Then** the backend rejects with a not-found error and the agent relays it and suggests the nearest known sample.
4. **Given** any state, **When** the user asks for a procedure step that is not in the registered protocol, **Then** the agent declines to improvise and says it has no approved instruction for that step.

---

### User Story 3 — Corrections that preserve history (Priority: P1)

Having recorded 4.2 for A17, the scientist says "actually, change that to 4.3." The displayed value becomes 4.3, annotated with the previous value and the correction time. The original 4.2 record is never destroyed.

**Why this priority**: Append-only correction is what separates a laboratory record from a spreadsheet, and it is a legal/scientific integrity requirement in the real domain.

**Independent test**: Record, then correct, then query the database directly and assert both rows exist, the original is marked superseded, and two events were written.

**Acceptance scenarios**:
1. **Given** A17 temperature = 4.2, **When** the user says "change A17 to 4.3", **Then** a new measurement row is created, the original row is marked as superseded by it, and the original's value is still retrievable.
2. **Given** no prior measurement for a sample/type, **When** a correction is attempted, **Then** it is rejected as not-found rather than creating a first record.
3. **Given** a correction occurred, **When** the measurement table renders, **Then** the row shows the current value plus a visible indication that it was corrected.

---

### User Story 4 — Observations are not measurements (Priority: P2)

The scientist says "note that A18 looks slightly cloudy." This is recorded as free text attached to A18, never coerced into a numeric measurement.

**Why this priority**: Misclassifying qualitative language as quantitative data corrupts the dataset. It is a small feature that demonstrates disciplined typing of captured information.

**Independent test**: Speak the utterance and assert an observation row exists and no measurement row was created.

**Acceptance scenarios**:
1. **Given** any RUNNING experiment, **When** the user states a non-numeric observation, **Then** an observation record is created and no measurement record is created.

---

### User Story 5 — Protocol grounding and deviations (Priority: P2)

The scientist asks "what's next?" and hears the next step read from the registered protocol. When reality diverges from the protocol ("log a deviation: prep was delayed forty minutes"), the divergence is recorded as a first-class deviation rather than quietly changing the protocol.

**Why this priority**: Demonstrates that the agent reports state from stored data rather than from model memory — the anti-hallucination guarantee — and shows workflow depth beyond data entry.

**Independent test**: Ask "what's next" and assert the response matches the stored protocol step at the current index; log a deviation and assert the row and the amber UI treatment.

**Acceptance scenarios**:
1. **Given** the experiment is at step index N, **When** the user asks what is next, **Then** the answer is drawn from the stored protocol definition, never generated.
2. **Given** the user describes a divergence, **When** a deviation is logged, **Then** a deviation record exists with description and (if stated) reason, and the UI shows it distinctly.
3. **Given** the current step is complete, **When** the user says so, **Then** the current step index advances by one and does not exceed the last step.

---

### User Story 6 — Completion is gated on completeness (Priority: P2)

The scientist says "finish the experiment." Before anything is closed, the system checks the protocol's required fields against what was actually recorded, reports what is missing, and requires an explicit spoken confirmation before marking the experiment complete.

**Why this priority**: A voice interface that can irreversibly close a record on a single ambiguous utterance is unsafe. The gate is the integrity moment.

**Independent test**: Attempt completion with missing data and assert refusal plus a specific list of what is missing; supply the data, confirm, and assert the status transition and a server-computed summary.

**Acceptance scenarios**:
1. **Given** required protocol fields are unrecorded, **When** the user asks to finish, **Then** completion is refused and the specific missing items are named.
2. **Given** all required fields are recorded, **When** the user asks to finish, **Then** the agent asks for explicit confirmation before completing.
3. **Given** confirmation is given, **When** the experiment completes, **Then** its status becomes COMPLETED with a server-generated completion timestamp and a summary whose numbers were computed by the database, not by the model.

---

### User Story 7 — Interrupting the agent (Priority: P2)

The agent is mid-sentence; the scientist starts talking. The agent stops speaking immediately, discards the rest of its queued speech, and listens.

**Why this priority**: Turn-taking that tolerates interruption is the difference between a conversation and an IVR menu, and it is a headline capability of the underlying voice platform.

**Independent test**: Trigger a long agent reply, speak over it, and assert audio playback stops within a human-perceptible instant and no stale audio resumes afterwards.

**Acceptance scenarios**:
1. **Given** the agent is speaking, **When** the user begins speaking, **Then** agent audio stops and previously queued agent audio is discarded rather than played later.

---

### User Story 8 — Measured, defensible reliability (Priority: P3)

A reviewer asks "how do you know it works?" and is shown a dashboard of accuracy figures produced by a repeatable evaluation script over a corpus of scenarios, with the script and scenarios publicly readable.

**Why this priority**: Claims of reliability without measurement are the weakest part of most demos and the cheapest thing to fix. It is P3 only because it depends on the tool layer existing first.

**Independent test**: Run the evaluation script end-to-end and confirm the dashboard renders the figures it just produced, with the scenario count visible.

**Acceptance scenarios**:
1. **Given** the evaluation corpus, **When** the script runs, **Then** it produces per-metric results derived from real tool-selection and real backend handler execution.
2. **Given** results exist, **When** the dashboard renders, **Then** every displayed number traces to that output and the number of scenarios is shown alongside it.

---

### Edge Cases

- The voice connection drops mid-session → the user is told, destructive actions are disabled, dashboard state is retained, and no save is ever claimed that did not happen.
- A tool call is issued for an experiment the signed-in user does not own → rejected regardless of what the model asked for.
- A tool call supplies its own timestamp → the supplied value is ignored; the server generates all times.
- The same measurement is spoken twice → both are recorded (the record is a log, not a set); correction is the mechanism for changing a value.
- The user asks to complete an experiment that is not RUNNING → rejected on status.
- Speech recognition returns a sample code that is phonetically close but not exact ("control one" vs `CONTROL-01`) → normalised where an unambiguous mapping exists, otherwise clarified.

---

## Requirements *(mandatory)*

### Functional Requirements

**Capture and persistence**
- **FR-001**: The system MUST record a numeric measurement from speech, capturing sample, measurement type, value, unit, and the verbatim spoken phrase.
- **FR-002**: The system MUST record free-text observations separately from measurements and MUST NOT convert an observation into a measurement.
- **FR-003**: The system MUST record protocol deviations with a description and optional reason, type and severity.
- **FR-004**: The system MUST correct an existing measurement by superseding it with a new record; it MUST NOT delete or overwrite the original value.
- **FR-005**: The system MUST append an immutable event record for every state change, identifying what changed, who caused it, and when.
- **FR-006**: The system MUST generate all timestamps server-side and MUST reject any client- or model-supplied time.

**Protocol and workflow**
- **FR-007**: The system MUST report the next protocol step exclusively from stored protocol data and MUST NOT generate procedure content.
- **FR-008**: The system MUST advance the current protocol step on explicit completion, bounded by the number of steps defined.
- **FR-009**: The system MUST evaluate recorded data against the protocol's required fields and report specifically what is missing.
- **FR-010**: The system MUST refuse to complete an experiment unless the completeness check passes AND the user explicitly confirms.
- **FR-011**: On completion the system MUST return a summary whose figures are computed by the data layer.

**Validation and refusal**
- **FR-012**: The system MUST validate every tool invocation's arguments against a declared schema before acting on them.
- **FR-013**: The system MUST reject a measurement whose sample is not present in the active experiment, and the response MUST be specific enough for the agent to suggest a known sample.
- **FR-014**: The system MUST reject a measurement whose unit cannot be determined from the utterance or from the protocol's defaults for that measurement type.
- **FR-015**: The system MUST reject mutations against experiments that are not in a RUNNING state.
- **FR-016**: When sample, value or unit is unresolved, the agent MUST ask exactly one concise clarifying question and MUST NOT write a record.
- **FR-017**: The system MUST NOT invent measurements, procedures, or protocol steps under any circumstances.

**Identity and access**
- **FR-018**: Every request that changes data MUST be attributable to an authenticated user.
- **FR-019**: Every request that changes data MUST be rejected unless that user owns the target experiment, independently of any database-level policy.
- **FR-020**: Credentials capable of bypassing per-user access control MUST NOT be reachable from the browser.

**Voice interaction**
- **FR-021**: The system MUST display live partial transcription of the user's speech and commit finalised turns to a visible transcript.
- **FR-022**: The system MUST play the agent's speech in the browser and MUST stop and discard queued speech when the user interrupts.
- **FR-023**: The system MUST display the conversational state (ready, listening, thinking, speaking, error) at all times.
- **FR-024**: The system MUST bias speech recognition toward the domain vocabulary of the active experiment (its sample codes and measurement types).
- **FR-025**: On connection loss the system MUST indicate the degraded state, suppress destructive actions, and attempt recovery without fabricating success.

**Presentation**
- **FR-026**: The workspace MUST reflect a successful write without user-initiated refresh.
- **FR-027**: A corrected measurement MUST be visually distinguishable and MUST surface its previous value.
- **FR-028**: The system MUST present a chronological activity trail derived from the event records.

**Evaluation**
- **FR-029**: The system MUST provide a repeatable evaluation over a corpus of scenarios covering correct capture, ambiguity clarification, correction, observation-vs-measurement discrimination, invalid input rejection, refusal to invent procedure, and completion gating.
- **FR-030**: Evaluation MUST exercise the real validation layer, not a simulation of it.
- **FR-031**: Displayed reliability figures MUST be produced by that evaluation and MUST NOT be asserted without it.

### Key Entities

- **Protocol** — a named, versioned, ordered list of steps; each step may declare required fields and default units per measurement type. The authority on what "next" means.
- **Experiment** — a run of a protocol, owned by a user, carrying a lifecycle status and a pointer to the current step.
- **Sample** — a coded specimen within an experiment; the entity that spoken sample identifiers must resolve to. Unique per experiment.
- **Measurement** — one numeric value with a type and unit, attached to a sample, at a protocol step; may be superseded by a later measurement and may carry a correction reason and the verbatim spoken phrase.
- **Observation** — free text attached to an experiment and optionally a sample.
- **Deviation** — a recorded divergence from the protocol, with severity and resolution state.
- **Event** — an append-only entry describing a state change: type, affected entity, payload, actor, originating voice session, time.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete a full experiment session — several measurements, an observation, a correction, a deviation, a protocol query, and a gated completion — using voice alone, touching no keyboard or mouse after starting the session.
- **SC-002**: A spoken measurement is visible in the workspace within 2 seconds of the end of the utterance, and the agent's spoken confirmation restates the values actually stored.
- **SC-003**: Across the evaluation corpus (minimum 30 scenarios), correct tool selection occurs in at least 95% of cases.
- **SC-004**: Across the evaluation corpus, extracted arguments (sample, value, unit, type) are correct in at least 95% of cases.
- **SC-005**: 100% of scenarios containing a missing or ambiguous critical field result in a clarifying question rather than a written record.
- **SC-006**: The rate of invented procedure content across the evaluation corpus is 0%.
- **SC-007**: The rate of records created from unresolved ambiguity is 0%.
- **SC-008**: Every state change in a session has a corresponding event record — no orphaned mutations.
- **SC-009**: No correction removes a prior value; prior values remain retrievable after any number of corrections.
- **SC-010**: Interrupting the agent stops its speech and no discarded audio is heard afterwards.
- **SC-011**: Every reliability figure shown to a viewer is reproducible by running the published evaluation.

---

## Scope

### In scope (MVP)

Authenticated single-user access; a seeded demo protocol, experiment, samples and historical runs; one Experiment Workspace screen; the full voice loop with live transcript, spoken replies, status and interruption; validated tool execution for measurement capture, correction, observation, deviation, protocol navigation, step completion, completeness check, experiment completion, active-experiment context and sample history; manual protocol creation from the Protocols screen (amended by `specs/002-manual-protocol-authoring/spec.md`); ambiguity clarification; append-only audit trail; and a reliability evaluation with a dashboard.

### Out of scope (deferred, in this order)

Additional reliability scenarios and dashboard polish; barcode-driven sample selection; comparison against previous runs; mid-session vocabulary reconfiguration driven by the user; voice-driven experiment search; a multi-screen application shell; voice-driven experiment creation.

### Never (for this effort)

Organisation administration, billing, permission matrices, replacement of a laboratory information management system, real instrument integration, a general unit-conversion library, retrieval over document corpora, native mobile applications, regulatory certification, and ingestion of protocols from documents.

---

## Assumptions

- A single demonstration account is sufficient; multi-user collaboration is not exercised.
- The demonstration experiment, its protocol, its samples and its historical runs are seeded rather than created through the interface. *Amended 2026-09-24:* protocols may also be created through the Protocols screen (`specs/002-manual-protocol-authoring/spec.md`); experiments, samples and runs remain seeded.
- The demonstration environment is a desktop browser with microphone access, on a network path good enough for continuous audio streaming.
- Protocol content is fictional and safe; no real laboratory procedure is prescribed by this system.
- English speech only.
