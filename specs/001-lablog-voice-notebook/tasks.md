---
description: "Task list for LabLog — Voice-Native AI Laboratory Notebook"
---

# Tasks: LabLog — Voice-Native AI Laboratory Notebook

**Input**: Design documents from `/specs/001-lablog-voice-notebook/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md), [.specify/memory/constitution.md](../../.specify/memory/constitution.md)

**Tests**: **INCLUDED — required by governance, not optional here.** Constitution Principle V requires a definition of done to be executed and observed before a phase completes; the Development Workflow section requires validation logic to be unit-testable without a live database and requires every rejection test to assert *that no row was written*. Test tasks below are therefore mandatory, not discretionary.

**Organization**: Phases follow the eight user stories in [spec.md](spec.md), in priority order. Each task also carries its **work stream** from [plan.md §Parallel Execution Model](plan.md), because file ownership — not story membership — is what makes concurrent agents safe.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable — touches files no other incomplete task touches
- **[Story]**: US1–US8, on user-story phases only
- Every task names its exact file path

## Stream ownership (exclusive — no file has two owners)

| Stream | Owns | Stream | Owns |
|---|---|---|---|
| **0** | repo root, manifests, deploy | **E** | `web/components/voice/**`, `web/lib/voiceClient/**` |
| **P** | `spike/**` (throwaway) | **F** | `web/app/**`, `web/components/experiment/**`, `web/lib/{supabase,api}.ts`, `web/lib/queries/**` |
| **A** | `supabase/**` | **G** | `api/eval/**` |
| **B** | `api/app/{main,deps,db,audit}.py`, `api/app/routers/health.py` | **H** | `web/components/reliability/**` |
| **C** | `api/app/tools/**`, `api/app/routers/tools.py` | **D** | `api/app/routers/voice.py` |

> **Contract rule (Constitution Principle IV)**: code against [contracts/](contracts/), never against another stream's unfinished source. An implementer who believes a contract is wrong **stops and escalates** — they do not edit it or work around it.

---

## Phase 1: Setup (Shared Infrastructure) — Stream 0

**Purpose**: Repository, manifests, deployment. Serial and blocking; one agent. Nothing else may start until the checkpoint passes.

- [X] T001 Create `.gitignore` at repository root covering Python (`__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `*.egg-info/`), Node (`node_modules/`, `.next/`, `dist/`, `build/`), and universal patterns (`*.log`, `.env`, `.env.local`, `.DS_Store`, `Thumbs.db`, `.vscode/`, `.idea/`) — never ignore `*.example` files
- [X] T002 Make the first repository commit containing `specs/`, `.specify/`, `LabLog_Implementation_Plan.md`, `DESIGN.md` and `.gitignore`, resolving `TODO(VERSION_CONTROL)` in `.specify/memory/constitution.md`
- [X] T003 Create the monorepo directory skeleton `web/`, `api/app/routers/`, `api/app/tools/`, `api/tests/`, `api/eval/`, `supabase/migrations/`, `spike/` per [plan.md §Project Structure](plan.md), with a placeholder file at every path so no two agents race to create a directory
- [X] T004 [P] Write complete `api/requirements.txt`: `fastapi`, `uvicorn[standard]`, `pydantic>=2`, `httpx`, `pyjwt`, `supabase`, `python-dotenv`, `pytest`, `pytest-asyncio`, `respx` — complete up front for all streams, since this is the highest-conflict file in the repository
- [X] T005 [P] Write complete `web/package.json`: `next@14`, `react@18`, `typescript`, `@tanstack/react-query`, `@supabase/supabase-js`, `tailwindcss`, `recharts`, `vitest`, `@testing-library/react`, `jsdom`
- [X] T006 [P] Create `api/Dockerfile` from `python:3.11-slim` with a `uvicorn app.main:app` entrypoint
- [X] T007 [P] Create `.dockerignore` at repository root: `node_modules/`, `.git/`, `web/`, `spike/`, `*.log`, `.env*`, `specs/`
- [X] T008 [P] Create `api/.env.example` declaring `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `ASSEMBLYAI_API_KEY`, `ALLOWED_ORIGINS` — values blank
- [X] T009 [P] Create `web/.env.local.example` declaring only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` — no privileged names may appear
- [X] T010 [P] Create `scripts/check-secrets.sh` failing non-zero when `SERVICE_ROLE|ASSEMBLYAI_API_KEY|JWT_SECRET` matches anything under `web/`, enforcing Constitution Principle III mechanically rather than by review
- [X] T011 [P] Configure ESLint and Prettier in `web/` with `.prettierignore` (`node_modules/`, `.next/`, `package-lock.json`)
- [X] T012 Copy `specs/001-lablog-voice-notebook/contracts/voice-bootstrap.example.json` and `eval-metrics.example.json` into `web/lib/fixtures/` so Streams E, F and H can build against them offline
- [ ] T013 Deploy `api/` empty to a container host **in the same region as the Supabase project** ([research.md R-013](research.md)), always-on, with `/health` reachable
- [ ] T014 Deploy `web/` empty to Vercel, set `NEXT_PUBLIC_API_URL` to the deployed backend, and confirm from a browser that it calls `/health` with no CORS error

**Checkpoint (Gate 0 in [quickstart.md](quickstart.md))**: deployed frontend reaches deployed backend cross-origin; `scripts/check-secrets.sh` passes; contracts committed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The floor for a two-service voice application. It is large because *every* user story needs a database, an authenticated mutation path, and a working audio loop before it can deliver anything.

**⚠️ CRITICAL**: no user story work may begin until this phase completes. Streams A, B, C, D, E, F below are mutually parallel.

### Gate: entity-accuracy spike (Stream P) — run first in wall-clock terms

- [ ] T015 [P] Build a throwaway rig in `spike/entity_accuracy.py` that mints a token, opens `wss://agents.assemblyai.com/v1/ws`, streams microphone audio and logs partial and final transcripts with timestamps
- [ ] T016 Run the [source brief §5](../../LabLog_Implementation_Plan.md) test matrix ~10× per utterance **twice — with and without `input.keyterms`** ([research.md R-002](research.md)), and record both accuracy figures plus the lift in `README.md`
- [ ] T017 Resolve **gate R-011** in `README.md`: at ≥95% sample-identifier accuracy with keyterms, proceed as planned; below it, promote barcode-selects-sample into scope, which changes the Stream F brief only
- [ ] T018 [P] Write the concrete alias pairs the spike observed (e.g. `"control one"` → `CONTROL-01`) into `README.md` as the input specification for `api/app/tools/normalize.py`

### Database (Stream A)

- [X] T019 [P] Create `supabase/migrations/0001_init.sql` with `pgcrypto` and tables `protocols`, `experiments`, `samples` — quoting these constraints verbatim from [data-model.md](data-model.md): `experiments.experiment_code text not null unique`; `experiments.owner_id uuid not null references auth.users(id)`; `experiments.status text not null default 'DRAFT' check (status in ('DRAFT','READY','RUNNING','PAUSED','COMPLETED','CANCELLED'))`; `experiments.current_step_index int not null default 0`; `samples.unique (experiment_id, sample_code)`; `samples.experiment_id ... on delete cascade`; `protocols.steps jsonb not null default '[]'`
- [X] T020 Append `measurements`, `observations`, `deviations`, `events` to `supabase/migrations/0001_init.sql` — quoting: `measurements.value numeric not null`; `measurements.superseded_by uuid references measurements(id)` (self-reference, NULL means current); `measurements.correction_reason text`; `measurements.raw_spoken_value text`; `observations.observation text not null`; `deviations.description text not null`, `severity text default 'medium'`, `status text default 'open'`; `events.event_type text not null`, `events.voice_session_id text`; every `*_at timestamptz not null default now()`
- [X] T021 Append the owner-scoped RLS policies and the `touch_updated_at()` trigger to `supabase/migrations/0001_init.sql` per [data-model.md §Row-level security](data-model.md) — `experiments` gates on `owner_id = auth.uid()`, the five child tables gate through `exists (select 1 from experiments ...)`, `protocols` allows `owner_id = auth.uid() or owner_id is null`, `events` is SELECT-only
- [X] T022 Append the indexes to `supabase/migrations/0001_init.sql`, including the partial index `on measurements (experiment_id, sample_id, measurement_type) where superseded_by is null` that carries the in-turn current-value lookup
- [X] T023 [P] Create `supabase/seed.sql`: protocol `STAB` "Sample Stability Evaluation" v1 with the six steps; experiment `STAB-104` **RUNNING** at `current_step_index = 1` with samples `A17`, `A18`, `CONTROL-01` (the last typed `control`); and completed `STAB-100`/`101`/`102` with measurements. **Fix the two defects in the source brief's seed** ([data-model.md §Seed](data-model.md)): `'…-0000000000p1'` is not a valid UUID (`p` is not hex), and `owner_id` must be resolved at run time via `select id from auth.users where email = …` rather than hard-coded
- [ ] T024 Apply the migration and seed to the Supabase project, then verify RLS by querying as an unrelated user and confirming zero rows are returned

### API core (Stream B)

- [X] T025 [P] Implement `api/app/deps.py`: `get_current_user()` verifying the Supabase JWT with `HS256` and `audience="authenticated"`, raising HTTP 401 `UNAUTHENTICATED` / `INVALID_TOKEN`; and `supabase_admin()` returning a service-role client
- [X] T026 [P] Implement `api/app/db.py` with the service-role client factory and `get_experiment_context(experiment_id, user_id)` loading experiment, protocol and sample codes
- [X] T027 [P] Implement `api/app/audit.py` `write_event(sb, experiment_id, event_type, entity_type, entity_id, payload, actor_id, voice_session_id)` per [data-model.md §events](data-model.md)
- [X] T028 [P] Implement `api/app/routers/health.py` returning `{"status":"ok"}`
- [X] T029 Implement `api/app/main.py` wiring CORS from `ALLOWED_ORIGINS` and including the `health`, `voice` and `tools` routers
- [X] T030 [P] Write `api/tests/test_deps.py` asserting a missing header, a malformed header, an expired token and a wrong-audience token each raise 401

### Tool layer foundation (Stream C)

- [X] T031 [P] Implement `api/app/tools/models.py` with Pydantic v2 argument models for all ten tools and the `TOOL_REGISTRY` mapping name → (model, description), per [contracts/tools-api.md](contracts/tools-api.md). **No model may declare a timestamp field** (Constitution Principle I). Use `examples: ["A17","A18","CONTROL-01"]` on `sample_code` and `enum` on `deviation.type` (`timing|procedure|other`) and `severity` (`low|medium|high`); `measurement_type` stays open with `examples`, never a closed enum
- [X] T032 Implement `api/app/tools/schemas.py` generating `TOOL_SCHEMAS` in AssemblyAI's **flat** shape `{"type":"function","name","description","parameters","execution_mode":"hold","timeout_seconds":30}` — **not** the OpenAI-nested `{"function":{...}}` form the source brief specifies ([research.md R-001 #1](research.md)). Keep the shape conversion in one function so a vendor change is a one-line fix
- [X] T033 [P] Write `api/tests/tools/test_schemas.py` asserting exactly ten schemas, each flat with a top-level `name`, none nested under a `function` key, and the set size ≤ 10 (the documented selection-accuracy ceiling)
- [X] T034 [P] Implement `api/app/tools/normalize.py` building a **per-experiment** alias map from that experiment's sample list — casefold, strip non-alphanumerics, map spelled-out digits zero–twenty, try leading zero both ways — returning exact / normalised / ambiguous / not-found. Never a global dictionary ([data-model.md §Resolution rule](data-model.md))
- [X] T035 [P] Write `api/tests/tools/test_normalize.py` covering the alias pairs recorded in T018 plus: exact match wins over normalised, two candidates yield ambiguous, and an unknown code yields not-found with the valid codes attached
- [X] T036 [P] Implement `api/app/tools/prompt.py` `build_prompt(ctx)` injecting experiment code, name, status, protocol, current step, sample codes and the measurement vocabulary, and carrying the hard rules from [the source brief §10](../../LabLog_Implementation_Plan.md)
- [X] T037 Implement the dispatcher in `api/app/routers/tools.py` following the eight-step sequence in [contracts/tools-api.md](contracts/tools-api.md): verify JWT → registry lookup → Pydantic validate → load experiment → **explicit `owner_id == user.id` check once, before dispatch** → RUNNING check for mutating tools → dispatch → handler writes change and event in one transaction
- [X] T038 [P] Write `api/tests/tools/test_dispatcher.py`: no header → 401; valid token for another user's experiment → **403 and no row written**; unknown experiment → 404; unknown tool → `UNKNOWN_TOOL`; malformed args → `INVALID_ARGS` with field detail; non-RUNNING experiment → `EXPERIMENT_NOT_RUNNING`
- [X] T039 Implement `get_active_experiment` in `api/app/tools/handlers.py` returning experiment, protocol, current step and sample codes per [contracts/tools-api.md §1](contracts/tools-api.md). Handlers take the database client as a parameter and never construct one, so they are unit-testable without a live database (Constitution, Development Workflow)
- [X] T040 [P] Write `api/tests/tools/test_get_active_experiment.py` against a faked client with fixture rows shaped by [data-model.md](data-model.md)

### Voice bootstrap (Stream D)

- [X] T041 Implement `GET /voice/bootstrap` in `api/app/routers/voice.py`: **authorise ownership before minting the token**, load context, build the prompt, attach `TOOL_SCHEMAS`, build `input.keyterms` from sample codes first then measurement vocabulary deduplicated and **capped at 100**, then `GET https://agents.assemblyai.com/v1/token?expires_in_seconds=300&max_session_duration_seconds=3600` with `Authorization: Bearer <key>`, returning the shape in [contracts/voice-bootstrap.md](contracts/voice-bootstrap.md)
- [X] T042 [P] Write `api/tests/voice/test_bootstrap.py` with `respx` asserting: 403 before any token request is issued when the user does not own the experiment; the response matches `contracts/voice-bootstrap.example.json` structurally; and **no response field contains the API key, service-role key or JWT secret**

### Voice transport (Stream E) — builds entirely against fixtures, before Stream D exists

- [ ] T043 [P] Write a 30-line connectivity probe in `web/lib/voiceClient/probe.ts` that logs every received event type verbatim, and reconcile observed events against [contracts/aai-websocket.md](contracts/aai-websocket.md) before writing any application code ([research.md R-001 residual risk](research.md))
- [X] T044 [P] Define the protocol types in `web/lib/voiceClient/types.ts` from [contracts/aai-websocket.md §3–4](contracts/aai-websocket.md) — client messages `session.update`, `input.audio`, `tool.result`, `session.resume`, `session.end`; server messages `session.ready`, `transcript.user.delta`, `transcript.user`, `reply.started`, `reply.audio`, `transcript.agent`, `reply.done`, `tool.call`, `session.error`
- [X] T045 [P] Implement `web/components/voice/audio/micWorklet.ts`: `AudioContext({sampleRate:24000})`, `AudioWorkletNode`, Float32 → Int16 via `Math.round(s*32767)` **clamped to [-32768, 32767]**, accumulating the 128-sample callbacks to ~50 ms (1200 samples) before base64-encoding and sending as `input.audio`
- [X] T046 [P] Implement `web/components/voice/audio/player.ts`: decode `reply.audio.data` (note the field is `data`, not `audio`) → Int16 → Float32 → `AudioBuffer` at 24 kHz, scheduled on a running cursor with ~50 ms lead; expose `flush()` that stops all sources, clears the queue and **resets the cursor to `audioContext.currentTime`**
- [X] T047 Implement `web/components/voice/useVoiceAgent.ts`: fetch bootstrap (fixture-backed in development), open the socket, send `session.update` **verbatim**, store `session_id` from `session.ready`, and drive status `Ready → Listening → Thinking → Speaking → ⚠`
- [X] T048 Implement the per-turn pending tool-result buffer in `web/components/voice/useVoiceAgent.ts`: `reply.started(reply_id)` opens a buffer, `tool.call` dispatches asynchronously and pushes `{call_id, result}`, `reply.done(reply_id)` flushes every buffered `tool.result`. **Results must not be sent before `reply.done`** ([contracts/aai-websocket.md §6](contracts/aai-websocket.md)) — sending early is the single most likely voice-loop bug and presents as the agent ignoring results
- [X] T049 [P] Write `web/tests/voiceClient/pendingBuffer.test.ts` asserting: nothing is sent before `reply.done`; all buffered results flush on `reply.done`; a result completing after `reply.done` sends immediately; and a failed dispatch still sends `{"success":false,"error":"TRANSPORT_ERROR"}` rather than silence
- [X] T050 Wire `tool.call` → `POST /tools` → `tool.result` in `web/components/voice/useVoiceAgent.ts`, passing `arguments` through **without `JSON.parse`** (it arrives as an object) and serialising `result` **to a JSON string** (the asymmetry is deliberate), keyed on `call_id` not `id`
- [X] T051 [P] Implement `web/components/voice/TranscriptPanel.tsx` (grey provisional text from `transcript.user.delta`, committed turns from `transcript.user` and `transcript.agent`), `VoiceStatus.tsx` and `MicControl.tsx`
- [X] T052 Implement `web/components/voice/VoiceAgent.tsx` composing the hook and the three panels

### Workspace foundation (Stream F) — builds against fixtures, before Streams A and E exist

- [X] T053 [P] Implement `web/lib/supabase.ts` browser client with the anon key, for auth and reads only
- [X] T054 [P] Implement `web/lib/api.ts` fetch wrapper attaching `Authorization: Bearer <supabase access token>` to every FastAPI call
- [X] T055 [P] Implement the TanStack Query hooks in `web/lib/queries/` for the six keys in [contracts/db-read.md](contracts/db-read.md) — the measurements query **must** filter `superseded_by is null`, or every correction renders as a duplicate row
- [X] T056 [P] Implement `web/app/(auth)/login/page.tsx` magic-link sign-in
- [X] T057 [P] Implement `web/components/experiment/ExperimentHeader.tsx` (code, status, user)
- [X] T058 Implement `web/app/dashboard/experiments/[id]/page.tsx` as the workspace shell with the layout in [plan.md](plan.md), taking voice state as props with a defined shape so it is buildable without a microphone
- [X] T059 Implement the Supabase Realtime subscriptions in `web/lib/queries/useRealtimeExperiment.ts` for `measurements`, `observations`, `deviations`, `events`, `experiments`, each with a server-side `filter: experiment_id=eq.<id>`, plus the reconciliation rule from [contracts/db-read.md](contracts/db-read.md): match by server id, database wins, mark rows still optimistic after 10 s as unconfirmed

**Checkpoint**: Gate I1 partially reachable (dispatcher + `get_active_experiment` against the real database); Gate I2 fully reachable (speak, hear a reply, see transcripts). No measurement can be recorded yet.

---

## Phase 3: User Story 1 — Record a measurement by voice (Priority: P1) 🎯 MVP

**Goal**: "A17 is 4.2 Celsius" becomes a validated `measurements` row with an `events` row, the cell updates, and the agent confirms by restating the stored values.

**Independent Test**: with the seeded RUNNING experiment, speak the utterance and verify the row, the event, the UI update, and that the spoken confirmation matches the stored row.

- [X] T060 [P] [US1] Write `api/tests/tools/test_record_measurement.py` happy path **first, and confirm it fails**: valid args produce a row with the right sample, type, value, unit, `raw_spoken_value` and `protocol_step_index`, plus one `MEASUREMENT_CREATED` event
- [X] T061 [US1] Implement `record_measurement` in `api/app/tools/handlers.py`: resolve sample via `normalize.py` → check value finite → resolve unit from the argument else `protocol.steps[current_step_index].default_unit[type]` → insert stamping `protocol_step_index` and a **server-generated** `recorded_at` → `write_event("MEASUREMENT_CREATED")`. Return the **stored** values, not the requested ones ([contracts/tools-api.md §2](contracts/tools-api.md))
- [X] T062 [P] [US1] Write `api/tests/tools/test_timestamps.py` asserting a `recorded_at` supplied in `args` is ignored and the server value is used (Constitution Principle I, [data-model.md V7](data-model.md))
- [X] T063 [P] [US1] Implement `web/components/experiment/MeasurementTable.tsx` rendering current values with a highlight flash on insert, and `SamplePanel.tsx` listing the experiment's samples
- [X] T064 [US1] Implement the optimistic cache patch in `web/components/voice/useVoiceAgent.ts` → `web/lib/queries/` on a successful `tool.result`, inserting with the returned `measurement_id` and `_optimistic: true` so Realtime can replace it by server id ([research.md R-007](research.md))
- [ ] T065 [US1] Run Gate I1 §1.1 and Gate I3 step 2 from [quickstart.md](quickstart.md); confirm **the cell updates before the spoken confirmation finishes** — if the confirmation lands first the optimistic patch is not wired and the hero moment is lost

**Checkpoint**: US1 is independently functional. This is the MVP — a demonstrable product on its own.

---

## Phase 4: User Story 2 — The system refuses to guess (Priority: P1)

**Goal**: incomplete or ambiguous speech produces exactly one clarifying question and **no record**.

**Independent Test**: run each ambiguous utterance, assert no row was created and a question was asked; then answer it and assert the row appears.

**Note**: these tasks extend `record_measurement` in `handlers.py`, so they are **not** parallel with T061.

- [X] T066 [P] [US2] Write `api/tests/tools/test_rejections.py` covering every row of [quickstart.md §1.2](quickstart.md) — and for each, assert **the row count is unchanged**. A handler that validates after writing passes every response assertion while corrupting the database (Constitution, Development Workflow)
- [X] T067 [US2] Implement `SAMPLE_NOT_FOUND` in `api/app/tools/handlers.py` returning `detail.valid_samples` with the experiment's codes, so the agent can suggest rather than apologise (FR-013)
- [X] T068 [US2] Implement `SAMPLE_AMBIGUOUS` in `api/app/tools/handlers.py` returning `detail.candidates` — a normalisation match against more than one sample is a question, never a coin flip
- [X] T069 [US2] Implement `UNIT_REQUIRED` in `api/app/tools/handlers.py` with `detail.suggested_units`, raised only after the protocol-default lookup fails ([data-model.md V5](data-model.md))
- [X] T070 [US2] Implement `INVALID_VALUE` in `api/app/tools/handlers.py` rejecting non-finite values — **`float('nan')` passes a Pydantic float check and Postgres `numeric` accepts `NaN`**, so this needs an explicit `math.isfinite` guard ([data-model.md V4](data-model.md))
- [X] T071 [US2] Add the HARD RULES block to `api/app/tools/prompt.py`: never create structured data from unresolved ambiguity; ask one concise question; observations are never measurements; corrections are never new measurements; answer protocol questions only from `get_next_protocol_step`
- [ ] T072 [P] [US2] Surface clarification state in `web/components/voice/VoiceStatus.tsx` so a pending question is visible, not only audible

**Checkpoint**: US1 and US2 both work independently. The reliability story is demonstrable.

---

## Phase 5: User Story 3 — Corrections preserve history (Priority: P1)

**Goal**: "change that to 4.3" supersedes rather than overwrites; 4.2 remains retrievable.

**Independent Test**: record, correct, then query the database and assert both rows exist, the original is superseded, and two events were written.

- [X] T073 [P] [US3] Write `api/tests/tools/test_correct_measurement.py` **first**: two rows exist afterwards; the original's `superseded_by` points at the new row; nothing was deleted or updated in place; a correction with no prior measurement returns `MEASUREMENT_NOT_FOUND` and creates nothing
- [X] T074 [US3] Implement `correct_measurement` in `api/app/tools/handlers.py` per [contracts/tools-api.md §3](contracts/tools-api.md): find the latest row `where superseded_by is null` → insert a new row carrying `correction_reason` → set the original's `superseded_by` → `write_event("MEASUREMENT_CORRECTED", {from,to})` → return `previous_value` and `new_value` so the agent can speak the change
- [X] T075 [P] [US3] Write `api/tests/tools/test_supersession_invariant.py` asserting that after N successive corrections exactly one row has `superseded_by is null` and the chain is linear
- [X] T076 [US3] Add the correction badge to `web/components/experiment/MeasurementTable.tsx`: show `4.3 °C` with `previous 4.2 · corrected 14:14`, detecting correction via `correction_reason is not null` and fetching the prior value lazily on expansion ([contracts/db-read.md](contracts/db-read.md))

**Checkpoint**: the three P1 stories are complete — the core demonstration works.

---

## Phase 6: User Story 4 — Observations are not measurements (Priority: P2)

**Goal**: "A18 looks slightly cloudy" is stored as text, never coerced to a number.

**Independent Test**: speak the utterance; assert an observation row exists and no measurement row was created.

- [X] T077 [P] [US4] Write `api/tests/tools/test_record_observation.py` asserting an observation row is created, **no measurement row is created**, and empty-after-trim text returns `INVALID_ARGS` ([data-model.md V10](data-model.md))
- [X] T078 [US4] Implement `record_observation` in `api/app/tools/handlers.py`: insert with optional `sample_id`, stamp `protocol_step_index`, never coerce numeric, `write_event("OBSERVATION_CREATED")`
- [X] T079 [P] [US4] Implement `web/components/experiment/ObservationPanel.tsx` rendering observations distinctly from measurements

---

## Phase 7: User Story 5 — Protocol grounding and deviations (Priority: P2)

**Goal**: "what's next?" is answered from stored protocol data; divergence is recorded as a deviation rather than silently changing the protocol.

**Independent Test**: ask what's next and compare the answer against `protocols.steps` in the database; log a deviation and assert the row and its amber treatment.

- [X] T080 [P] [US5] Write `api/tests/tools/test_protocol.py` asserting `get_next_protocol_step` returns exactly `protocol.steps[current_step_index]`, that it has **no generative path**, and that past the last step it returns `is_final: true`
- [X] T081 [US5] Implement `get_next_protocol_step` in `api/app/tools/handlers.py` as an array read per [contracts/tools-api.md §6](contracts/tools-api.md) — this handler is the mechanical guarantee behind FR-017, so it must remain incapable of generating content
- [X] T082 [US5] Implement `complete_protocol_step` in `api/app/tools/handlers.py` advancing `current_step_index` by one, **clamped at the last step rather than erroring** ([data-model.md V9](data-model.md)), writing `PROTOCOL_STEP_COMPLETED`
- [X] T083 [P] [US5] Write `api/tests/tools/test_create_deviation.py` covering defaults `severity='medium'`, `status='open'` and the `type` enum `timing|procedure|other`
- [X] T084 [US5] Implement `create_deviation` in `api/app/tools/handlers.py` writing `DEVIATION_CREATED`
- [X] T085 [P] [US5] Implement `web/components/experiment/ProtocolProgress.tsx` (✓ done / → current / ○ pending) and `DeviationPanel.tsx` in amber with a badge
- [ ] T086 [US5] Add the refusal instruction to `api/app/tools/prompt.py` for procedure not in the approved protocol — *"I don't have an approved protocol instruction for that step"* — and confirm it fires for Gate I3 step 9, the single most important line in the demonstration

---

## Phase 8: User Story 6 — Completion is gated on completeness (Priority: P2)

**Goal**: an experiment cannot be closed on one ambiguous utterance; missing data is named and explicit confirmation is required.

**Independent Test**: attempt completion with data missing and assert a specific refusal; supply it, confirm, and assert the transition plus a server-computed summary.

- [X] T087 [P] [US6] Write `api/tests/tools/test_completeness.py` asserting `missing` is structured per step and per sample, so the agent can say exactly what is outstanding
- [X] T088 [US6] Implement `check_experiment_completeness` in `api/app/tools/handlers.py`: for each step with `required_fields`, verify a non-superseded measurement of that type exists **for every active sample** ([data-model.md §steps](data-model.md))
- [X] T089 [P] [US6] Write `api/tests/tools/test_complete_experiment.py`: `confirmed:false` → `NEEDS_CONFIRMATION`; data missing → `INCOMPLETE` with populated `detail.missing`; **and that calling `complete_experiment` directly without a prior completeness call still fails** — a gate the caller can skip is not a gate
- [X] T090 [US6] Implement `complete_experiment` in `api/app/tools/handlers.py` **re-running the completeness check server-side**, then setting `COMPLETED` with a server `completed_at` and writing `EXPERIMENT_COMPLETED`
- [X] T091 [US6] Compute the completion summary in SQL in `api/app/db.py` — duration, measurement/correction/observation/deviation counts, samples measured. **Every figure computed by the database, never by the model** (FR-011); a model-computed duration is a plausible number with no relationship to the data
- [ ] T092 [P] [US6] Render the completion summary and status transition in `web/components/experiment/ExperimentHeader.tsx`

---

## Phase 9: User Story 7 — Interrupting the agent (Priority: P2)

**Goal**: the agent stops mid-sentence when the user speaks, and no discarded audio resumes later.

**Independent Test**: trigger a long reply, speak over it, assert playback stops immediately and nothing stale plays afterwards.

- [X] T093 [US7] Implement barge-in in `web/components/voice/useVoiceAgent.ts` triggered by **`reply.done` with `status:"interrupted"`** — there is no interruption event, and a handler written against the source brief's imagined event name compiles, runs and never fires ([contracts/aai-websocket.md §7](contracts/aai-websocket.md))
- [X] T094 [US7] Call `flush()` from `web/components/voice/audio/player.ts` on interruption and verify the scheduling cursor resets to `audioContext.currentTime` — forgetting the reset is the specific failure where audio stops and then the discarded tail plays seconds later over the next turn
- [ ] T095 [P] [US7] Write `web/tests/voiceClient/bargeIn.test.ts` asserting all scheduled sources stop, the queue empties, and the cursor resets
- [X] T096 [US7] Implement reconnection in `web/components/voice/useVoiceAgent.ts`: on drop show a degraded state and **disable destructive tool triggers**, mint a **fresh** token (the old one is spent), send `session.resume` with the stored `session_id`, and fall back to a fresh `session.update` on failure
- [X] T097 [US7] Ensure no interface path in `web/components/voice/useVoiceAgent.ts` or `web/components/experiment/MeasurementTable.tsx` claims a save that did not complete — reconcile any in-flight tool call against the database rather than assuming either outcome (Constitution Principle V)

---

## Phase 10: User Story 8 — Measured, defensible reliability (Priority: P3)

**Goal**: every reliability figure shown traces to a script anyone can run.

**Independent Test**: run the harness and confirm the dashboard renders the figures it just produced, with the scenario count visible.

- [X] T098 [P] [US8] Write the scenario corpus in `api/eval/scenarios.py` — **30–50 scenarios with paraphrase variants** across the seven categories `normal_capture`, `ambiguity`, `correction`, `classification`, `invalid_input`, `refusal`, `completion`, each `{id, utterance, context, expect}`. Fully authorable against [contracts/tools-api.md](contracts/tools-api.md) before any handler exists
- [X] T099 [US8] Implement `api/eval/run.py`: send each utterance with the real system prompt and real `TOOL_SCHEMAS` to the LLM gateway with tools enabled, capture the tool call, and execute it through the **real handler functions** against a disposable test experiment — mocking the validation layer would measure nothing, because the validation layer is the claim ([research.md R-008](research.md))
- [X] T100 [US8] Emit `api/eval/metrics.json` matching [contracts/eval-metrics.md](contracts/eval-metrics.md), including `scenario_count`, `generated_at`, `git_sha`, the nine metrics with `passed`/`total`, `by_category`, and the `failures` list
- [X] T101 [P] [US8] Implement `web/components/reliability/ReliabilityDashboard.tsx` against `web/lib/fixtures/eval-metrics.example.json`: render `scenario_count` adjacent to every figure, honour `lower_is_better` so rate metrics are not drawn as if high were good, **render the failures list**, and say so plainly when `metrics.json` is absent rather than showing a placeholder
- [ ] T102 [US8] Run the harness and wire the dashboard to the real `api/eval/metrics.json`; confirm `procedure_hallucination_rate` and `false_record_creation_rate` are both **0.000** — any other value is a release blocker, not a metric

---

## Phase 11: Polish & Cross-Cutting Concerns

- [X] T103 [P] Implement `get_sample_history` in `api/app/tools/handlers.py` returning current values only — **first item to cut** if scope must shrink
- [X] T104 [P] Implement `web/components/experiment/ExperimentTimeline.tsx` rendering the append-only `events` trail, filterable (FR-028)
- [ ] T105 Run the audit invariant from [quickstart.md §1.4](quickstart.md) — `select count(*) from measurements m where not exists (select 1 from events e where e.entity_id = m.id)` must return **0**. Any other number means a write path bypassed the dispatcher (Constitution Principle II)
- [X] T106 [P] Write `README.md` covering setup for both services, the architecture, why AssemblyAI is central, why there is no agent framework, and the Phase 0 accuracy figures from T016
- [ ] T107 [P] Apply the visual priorities from [plan.md](plan.md) in `web/components/experiment/MeasurementTable.tsx` — the measurement cell updating the instant the value is spoken is the hero moment and deserves a crisp highlight flash
- [ ] T108 Run the full Gate I3 eleven-step demo path in [quickstart.md](quickstart.md) with no keyboard or mouse, cross-checking every value the agent spoke against the database row by row
- [ ] T109 Delete `spike/` and remove it from the repository before submission
- [ ] T110 Remove the Sync Impact Report comment block from `.specify/memory/constitution.md` now that the amendment has been reviewed
- [ ] T111 Complete the demo-day checklist in [quickstart.md](quickstart.md): Chromium, warm backend, database reset to seed state, notifications silenced, dashboard preloaded in a second tab

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — no dependencies; serial, one agent; **blocks everything**
- **Phase 2 (Foundational)** — depends on Phase 1; **blocks all user stories**
- **Phases 3–10 (User Stories)** — all depend on Phase 2
- **Phase 11 (Polish)** — depends on the desired stories being complete

### User story dependencies

- **US1 (P1)** — after Phase 2. No dependencies on other stories. **This is the MVP.**
- **US2 (P1)** — after Phase 2. Extends `record_measurement`, so it **serialises with US1's T061**
- **US3 (P1)** — after Phase 2. Independent of US2
- **US4 (P2)** — after Phase 2. Fully independent
- **US5 (P2)** — after Phase 2. Fully independent
- **US6 (P2)** — after Phase 2. Best validated once US1 has produced data
- **US7 (P2)** — after Phase 2. Touches only Stream E; independent of every backend story
- **US8 (P3)** — scenario authoring (T098) and the dashboard (T101) run from day one against contracts; **only T099/T100/T102 need the handlers**

### Integration gates ([quickstart.md](quickstart.md))

| Gate | Entry | Outcome |
|---|---|---|
| **Gate 0** | Phase 1 | Deployed frontend reaches deployed backend, cross-origin |
| **I1** | T024 + T029 + T039 | `POST /tools` writes real rows and rejects correctly |
| **I2** | T029 + T041 + T052 | Speak, hear a reply, see transcripts, interrupt |
| **I3** | I1 + I2 + T065 | Speak a measurement, watch the cell update |
| **I4** | I1 + T102 | Dashboard renders numbers the harness just produced |

I1 and I2 are independent and may complete in either order.

---

## Parallel Opportunities

**Phase 1**: T004–T011 all parallel.

**Phase 2** — six streams run concurrently, each against contracts rather than each other's code:

```
Stream P: T015 → T016 → T017 → T018
Stream A: T019 → T020 → T021 → T022 → T024        (T023 parallel with T019–T022)
Stream B: T025 ∥ T026 ∥ T027 ∥ T028 → T029        (T030 parallel)
Stream C: T031 → T032 → T037 → T039               (T033 ∥ T034 ∥ T035 ∥ T036 parallel)
Stream D: T041 → T042
Stream E: T043 ∥ T044 ∥ T045 ∥ T046 → T047 → T048 → T050 → T052   (T049 ∥ T051 parallel)
Stream F: T053 ∥ T054 ∥ T055 ∥ T056 ∥ T057 → T058 → T059
```

**Phases 3–10** — backend handler tasks serialise on `handlers.py`; frontend panel tasks are parallel with all of them:

```
# Frontend panels — all different files, all parallel:
T063 MeasurementTable.tsx   T072 VoiceStatus.tsx     T076 correction badge
T079 ObservationPanel.tsx   T085 ProtocolProgress.tsx + DeviationPanel.tsx
T092 ExperimentHeader.tsx   T101 ReliabilityDashboard.tsx

# Test authoring — all different files, all parallel, all written before their handler:
T060  T062  T066  T073  T075  T077  T080  T083  T087  T089  T098
```

### Suggested agent allocations ([plan.md §Parallel Execution Model](plan.md))

- **Six agents**: `P` → `A+B` → `C` → `D+E` → `F` → `G+H`
- **Three agents** *(recommended for a solo operator)*: `A+B+C+G` · `D+E` · `F+H` — three coherent mental models rather than eight context switches
- **One agent**: follow task order as written; the dependency graph is unchanged, only the wall clock differs

Beyond six, agents contend for integration gates rather than doing independent work.

---

## Implementation Strategy

### MVP first

1. Phase 1 (Setup) → Gate 0
2. Phase 2 (Foundational) → Gates I1 and I2
3. Phase 3 (US1) → **Gate I3**
4. **STOP and validate**: this is a demonstrable product. Everything before it is preparation; everything after is depth and evidence.

### Incremental delivery

US1 (hero loop) → US2 (refusal) → US3 (corrections) — the three P1 stories are the demonstration.
Then US5 (protocol grounding, including the refusal line) and US6 (completion gate) for depth, US4 and US7 for completeness, US8 for evidence.

### Cut lines, in order

If time runs short: T103 `get_sample_history` first, then `create_sample`. **Keep** the deviation flow and the completion gate — they carry the workflow-depth and integrity arguments. If the evaluation is unfinished, show the harness and partial scenarios honestly; **never fabricate a number** (Constitution Principle V).

---

## Notes

- `[P]` means different files and no dependency on an incomplete task
- Commit after each task or logical group (Constitution, Development Workflow)
- Tests are written before their handler and must be seen to fail first
- Every rejection test asserts **both** the error returned **and** that no row was written
- Scope is a contract: an implementer asked for a deferred feature declines and points at [spec.md §Scope](spec.md)
- A stream that cannot proceed without another stream's code has a missing contract, not a scheduling problem
