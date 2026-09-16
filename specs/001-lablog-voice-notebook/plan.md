# Implementation Plan: LabLog — Voice-Native AI Laboratory Notebook

**Branch**: `001-lablog-voice-notebook` | **Date**: 2026-09-15 | **Spec**: [spec.md](spec.md)

**Input**: [spec.md](spec.md), derived from `LabLog_Implementation_Plan.md` (repo root, authoritative brief)

**Phase 0 research**: [research.md](research.md) · **Contracts**: [contracts/](contracts/) · **Data model**: [data-model.md](data-model.md) · **Validation**: [quickstart.md](quickstart.md)

---

## Summary

LabLog turns spoken laboratory activity into validated, auditable database records. A scientist with occupied hands says "A17 is 4.2 Celsius"; within a second the measurement is in Postgres with an audit event, the workspace reflects it, and the agent confirms by restating what was actually stored.

The technical approach: **AssemblyAI's Voice Agent API owns the conversation** — speech recognition, turn detection, reasoning, tool selection, speech synthesis and barge-in — over a single WebSocket that runs **directly between the browser and AssemblyAI**. A **FastAPI service owns the truth** — it mints the session credential, authors the session configuration, and exposes exactly one mutation endpoint through which every state change must pass, validating the model's output before any of it reaches the database. The model proposes; the backend disposes.

This plan is written to be executed by **several agents working concurrently**. The mechanism is a contract freeze (§Parallel Execution Model): five interfaces are fixed before any implementation starts, each work stream owns a disjoint set of files, and streams integrate against committed fixtures rather than against each other's in-progress code.

---

## Technical Context

**Language/Version**: Python 3.11+ (backend, evaluation) · TypeScript 5.x on Node 20 (frontend)

**Primary Dependencies**: FastAPI + Pydantic v2 + uvicorn + httpx + PyJWT + supabase-py (backend) · Next.js 14 App Router + React 18 + TanStack Query + `@supabase/supabase-js` + Tailwind + shadcn/ui + Recharts (frontend) · AssemblyAI Voice Agent API (external, no SDK dependency — raw WebSocket, see R-001)

**Storage**: Supabase PostgreSQL — 7 tables, protocol steps embedded as JSONB, append-only `events` table, corrections modelled by supersession. Row-level security enabled and owner-scoped.

**Testing**: pytest (handler unit tests with a faked database client; integration tests against a disposable Supabase project) · Vitest + Testing Library (frontend units, transcript/state-machine reducers) · a domain-specific evaluation harness in `api/eval/` that is the source of every reliability figure (R-008)

**Target Platform**: Desktop Chromium browser with microphone access (R-012 — Firefox/Safari need worklet resampling and are explicitly out of scope). Backend as a container on an always-warm host co-located with the database (R-013).

**Project Type**: Two-service web application — Next.js frontend and FastAPI backend — plus a database migration set and an evaluation harness.

**Performance Goals**: Tool round trip (browser → FastAPI → Postgres → browser) p95 under 400 ms, so it disappears inside a spoken turn. Optimistic UI patch within one frame of the tool result. Measurement visible within 2 s of the end of the utterance (SC-002). Audio sent in ~50 ms frames (R-012).

**Constraints**: No credential capable of bypassing per-user access control may be reachable from the browser (FR-020). Every mutation passes through one code path and writes an audit event (FR-005). All timestamps server-generated (FR-006). Tool set capped at ten (R-010). Agent audio never routes through the backend (§Architecture A1).

**Scale/Scope**: One demonstration account, one workspace screen, ten tools, seven tables, 30–50 evaluation scenarios. Deliberately narrow — the scope table in the source brief is a contract against feature creep, not a starting point for negotiation.

---

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

### ⚠️ Finding: the project constitution is an unfilled template

`.specify/memory/constitution.md` still contains `[PRINCIPLE_1_NAME]`-style placeholders. **There are no ratified principles to gate against.** Rather than declare a vacuous pass, this plan gates against the **de facto constitution** — the eleven standing instructions in §17 of `LabLog_Implementation_Plan.md`, which the project owner wrote precisely as binding constraints on implementation.

**Recommendation**: run `/speckit-constitution` and promote the gates below into `constitution.md`. They matter more than usual here because multiple agents will be applying them without a shared conversation.

### Gates derived from the source brief §17

| # | Gate | Status | Where enforced |
|---|---|---|---|
| G1 | Voice wire format verified against live docs before any voice code | **PASS** | [research.md R-001](research.md) — done, 13 corrections recorded, frozen in [contracts/aai-websocket.md](contracts/aai-websocket.md) |
| G2 | Build only what is in scope; no deferred features | **PASS** | [spec.md §Scope](spec.md); every work stream's brief names its cut line |
| G3 | Privileged credentials exist only in the backend; browser holds the anonymous key and the user's session | **PASS** | §Architecture A4; enforced by the environment-variable split and a CI grep |
| G4 | No agent framework; backend is a validated dispatcher | **PASS** | [research.md R-005](research.md) |
| G5 | The model never writes to the database; every mutation is authorise → validate → write → audit → return | **PASS** | §Architecture A4; one endpoint, [contracts/tools-api.md](contracts/tools-api.md) |
| G6 | All timestamps server-generated; reject any time supplied as an argument | **PASS** | [data-model.md §Validation](data-model.md); no Pydantic argument model declares a time field |
| G7 | Corrections supersede, never delete; every mutation writes an event | **PASS** | [data-model.md §Measurement](data-model.md) |
| G8 | Tool schemas have one source of truth (Pydantic → generated JSON Schema) | **PASS** | [research.md R-010](research.md) |
| G9 | Test each phase's definition of done before proceeding; write the evaluation scenario alongside the tool it tests | **PASS** | Each stream brief carries a DoD; the evaluation stream is scheduled in parallel, not at the end |
| G10 | Commit after each working increment | **⚠️ BLOCKED** | **The working directory is not a git repository.** See below. |
| G11 | Ambiguity produces a question, not a record | **PASS** | FR-016; realised by the `UNIT_REQUIRED` / `SAMPLE_NOT_FOUND` handler errors in [contracts/tools-api.md](contracts/tools-api.md) |

### ⚠️ Blocking issue: no version control

`C:\Shubham\AssemblyAI` is not a git repository. This blocks G10, and for a multi-agent build it is not a minor process gap — **file ownership, contract freezing and integration gates are all unenforceable without it**, and the submission checklist requires a public repository with steady commits. Initialise git and make the first commit (the contracts) **before** any stream starts. This is the one prerequisite that cannot be parallelised around.

### Post-design re-check (after Phase 1)

Re-evaluated against the generated artifacts: **all gates still pass**, with two design decisions worth recording because they are the kind that quietly violate a principle later:

- The dispatcher performs the ownership check **once**, before dispatch, rather than inside each of the ten handlers (R-006). A per-handler check would make G5 depend on ten independent authors each remembering it. Centralising it means the gate is structural.
- The evaluation harness calls the **real** handler functions rather than mocks (R-008). Mocking there would let G9 pass while measuring nothing.

**Complexity Tracking**: not required — no gate violations to justify.

---

## Architecture

### The shape of the system

```
                    ┌─────────────── audio path (latency-critical) ────────────────┐
                    │                                                              │
  ┌─────────┐   WSS │  wss://agents.assemblyai.com/v1/ws?token=…                    │
  │ Browser │◄──────┼──────────────────────────────────────────────►┌─────────────┐ │
  │ Next.js │       │   input.audio ▲ │ ▼ reply.audio, transcripts,  │ AssemblyAI  │ │
  │         │       │                 │   tool.call, reply.done      │ Voice Agent │ │
  └────┬────┘       └─────────────────┼──────────────────────────────└─────────────┘ │
       │                              │                                              │
       │ ① GET /voice/bootstrap       │ ⑥ tool.call arrives in the browser            │
       │    (Supabase JWT)            │ ⑦ tool.result returned after reply.done      │
       │    → token + session_config  └──────────────────────────────────────────────┘
       │
       │ ⑥a POST /tools  { tool, args, experiment_id, session_id }
       │    Authorization: Bearer <user's Supabase JWT>
       ▼
  ┌──────────────────────────────────────────────────┐
  │ FastAPI  — the only thing that may write         │
  │   verify JWT → authorise ownership → Pydantic    │
  │   validate → semantic validate → write → audit   │
  └───────────────────────┬──────────────────────────┘
                          │ service role (bypasses RLS — hence the explicit check)
                          ▼
  ┌──────────────────────────────────────────────────┐
  │ Supabase Postgres  (7 tables, RLS, append-only events)
  └───────────────────────┬──────────────────────────┘
                          │ ⑧ change events (anon key, RLS-scoped)
                          └────────────────► Browser: canonical UI reconciliation
```

Two deployed services. The audio WebSocket never touches FastAPI. FastAPI never touches audio.

### A1 — Why audio goes browser↔AssemblyAI directly, and not through the backend

Audio is the only genuinely latency-critical path in the system, and it is continuous: roughly 20 messages per second in each direction for the whole session. Proxying it through FastAPI would add a network hop in each direction to every frame, double the backend's bandwidth, and — most damagingly — make the backend **stateful**, holding one live WebSocket per active user. Barge-in, which is a local decision about a local audio buffer, would become a distributed one.

Routing it directly keeps FastAPI stateless: it answers two kinds of short HTTP request and holds nothing between them. The cost is that the browser needs a credential for AssemblyAI, which is resolved by minting a **single-use token with a 60–300 second redemption window** server-side (R-001 #12). The browser never sees the API key; the token it does see starts exactly one session and then is spent.

### A2 — Why the tool call detours through the browser

AssemblyAI can call our HTTPS endpoints directly (server-side HTTP tools), which would remove steps ⑥/⑦ entirely. We deliberately do not use it, and the reason is **identity** (full argument in R-003).

Server-side HTTP tools authenticate with static headers stored on the agent. They cannot carry the *end user's* credential. We would have to either keep a session→user correlation table with a shared secret, or accept a user identifier as a *tool argument* — which means the model asserts who the user is. In a system whose entire claim is "the model is never trusted," letting it assert identity is the one concession that undoes the claim.

Forwarding through the browser means the request arrives already carrying the signed-in user's JWT. Authorisation is then a property of the transport rather than something we reconstruct. It also keeps the tool result **in the browser**, which is what makes the sub-second UI update possible (A6).

The accepted cost: the browser is on the write path, so a tab that dies mid-call loses that write. It fails cleanly — the backend never saw the call, so nothing is half-written, and the agent's turn errors rather than confirming something that did not happen.

### A3 — Why there is no agent framework

The reasoning loop is not in our process. AssemblyAI's LLM Gateway holds the conversation history, decides when to call a tool, and manages turn-taking. What runs in our code is: receive a name and an arguments object, validate, write, return a row. That is a **dispatcher**. An orchestration framework orchestrates a loop you own, and we own no loop — so it would wrap one function call, adding a dependency, an abstraction and a debugging surface for no control gained. Full reasoning in R-005; it is worth stating in the submission, because a deliberate omission with an articulable reason reads very differently from an oversight.

What would normally be "agent state" is ordinary database state: the active experiment, its sample codes and its protocol position are read from Postgres, injected into the system prompt at session start, and re-read inside every handler. Nothing can go stale in a framework's memory because there is no framework memory.

### A4 — The trust boundary (this is the differentiator)

Three zones, with the boundaries drawn deliberately:

**Zone 1 — untrusted: the model's tool arguments.** Structurally validated by Pydantic (types, required fields, enums), then *semantically* validated against reality: does this sample exist in this experiment? Is the value finite? Can the unit be resolved from the utterance or the protocol's defaults? Is the experiment RUNNING? Structural validation alone is the common mistake — it proves the model produced well-formed JSON, not that it produced true statements.

**Zone 2 — authenticated: the browser.** Holds the anonymous database key and the user's own session. It can read what the user owns, because row-level security says so. It cannot write anything directly.

**Zone 3 — privileged: FastAPI.** Holds the service role key and the AssemblyAI key. The service role key **bypasses row-level security by design** — which is exactly why the ownership check must live in application code (R-006). Postgres will not stop a service-role write against someone else's experiment; only our code will.

The invariant that makes this tractable: **every state change in the system crosses exactly one code path.** One endpoint, one dispatcher, one authorise-validate-write-audit sequence. There is no second way to write. That is what makes the audit trail complete rather than aspirational, and it is what makes the ownership check a single line rather than ten.

### A5 — Layered defence for entity accuracy

The project's largest technical risk is speech recognition mishearing alphanumeric sample identifiers. Four layers, each independently useful (R-002):

1. **`input.keyterms`** — the experiment's sample codes and measurement vocabulary are injected at session start, biasing recognition toward exactly the rare tokens that matter. This was not in the source brief and materially changes the risk profile.
2. **Normalisation** in the handler — a per-experiment alias map built from the seeded sample list resolves "control one", "control-1", "CONTROL 01" to `CONTROL-01` before lookup.
3. **Specific rejection** — a failed lookup returns the valid sample codes, so the agent asks "did you mean A17 or A18?" instead of guessing or apologising vaguely.
4. **Barcode selection** — held in reserve, promoted into scope only if the measured accuracy gate fails (R-011).

The ordering matters: each layer is cheaper and less invasive than the next, and layer 4 changes the product.

### A6 — Two paths into the UI, and why both

A successful tool result patches the local cache immediately; the database's own change stream is the canonical path and reconciles afterwards, winning on conflict (R-007).

They answer different questions. The optimistic patch answers "did the system hear me?" in one frame — the moment the demonstration is selling. The change stream answers "is it actually stored?", which is the claim the product is making. Using only the subscription costs a visible round trip at the worst possible moment; using only the optimistic patch means the screen shows what the client believes, which is precisely the failure this product exists to prevent. Unconfirmed optimistic rows are marked as such after 10 seconds rather than silently retained.

### A7 — Protocol rules that shape the client state machine

Two discovered constraints are not implementation details — they determine the structure of the voice client (R-001 #7, #11):

- **Tool results must be buffered and sent only after `reply.done`** for the turn that contained the `tool.call`. So the client cannot be a stateless event router; it needs a per-turn pending-results buffer. Sending early is the most likely voice-loop bug and it will present as the agent ignoring results.
- **There is no interruption event.** Barge-in is signalled by `reply.done` carrying `status: "interrupted"`. A handler written against the source brief's imagined event name would compile, run, and never fire.

Both are frozen in [contracts/aai-websocket.md](contracts/aai-websocket.md), which is why the transport stream can be built by an agent that never reads the AssemblyAI documentation.

---

## Parallel Execution Model

The user requirement for this plan is that **multiple agents can work from it simultaneously**. Parallel agents fail for one dominant reason: two agents edit the same file, or one agent waits on another's half-finished module. Both are addressed structurally rather than by coordination.

### The three rules

**Rule 1 — Contracts are frozen before any stream starts.** Five interfaces (below) are written down and committed first. Every agent codes against the contract file, never against another agent's source. An agent that believes a contract is wrong **stops and escalates**; it does not edit the contract and it does not work around it locally. A silently diverging contract is the one failure this model cannot absorb.

**Rule 2 — File ownership is exclusive.** Every file in the repository has exactly one owning stream. No file has two. Where a stream needs something another stream owns, it depends on the *contract* plus a committed fixture, not on an import of work in progress.

**Rule 3 — Streams integrate at named gates, not continuously.** Four integration gates, each with a defined entry condition and a single observable outcome. Between gates, streams do not block on each other.

### Stream 0 — Foundation (serial, blocking, one agent, ~1 session)

This cannot be parallelised and everything else depends on it. Deliverables:

1. `git init`, first commit. (Resolves the G10 blocker — nothing else may start first.)
2. Monorepo skeleton: `web/` and `api/` trees with every directory and an empty or stub file at every path named in §Project Structure. Agents must never need to create a directory another agent might also create.
3. **Complete** dependency manifests — `api/requirements.txt` and `web/package.json` written in full, up front, for all streams. These are the highest-conflict files in the repository; writing them once eliminates the conflict rather than managing it.
4. Both services deployed empty, with cross-origin configuration working and a health endpoint reachable from the deployed frontend. Deploy-day problems are cheap now and expensive in week four (R-013).
5. `contracts/` committed, plus the example fixtures each contract references.
6. `.env.example` for both services with the credential split enforced (G3).

**Definition of done**: the deployed frontend successfully calls the deployed backend's health endpoint from a browser, and `contracts/` is committed.

### Stream P — Entity-accuracy spike (parallel with everything, gates only Stream C)

Throwaway code in `spike/`, deleted before submission. Mints a token, opens the WebSocket, streams microphone audio, logs partial and final transcripts. Runs the test matrix from the source brief §5 **twice — with and without `input.keyterms`** (R-002).

**Outputs**: the locked sample-identifier scheme, the alias pairs the normalisation map must handle, the number/unit phrasing conventions for the demo script, and the keyterms lift figure. Written into the repository README.

**Gate (R-011)**: ≥95% sample-identifier accuracy with keyterms → proceed as planned. Below → promote barcode selection into scope, which changes Stream F's brief and only Stream F's.

This is scheduled first in wall-clock terms because its result can change the plan, but it blocks nobody: every other stream's work is identical either way.

### The eight parallel streams

| # | Stream | Owns (exclusive) | Depends only on | Produces for others |
|---|---|---|---|---|
| **A** | Database & seed | `supabase/**` | data-model.md | A migrated, seeded database |
| **B** | API core | `api/app/main.py`, `deps.py`, `db.py`, `audit.py`, `routers/health.py` | contracts/tools-api.md | `get_current_user`, `supabase_admin()`, `write_event()` |
| **C** | Tool layer | `api/app/tools/**`, `api/app/routers/tools.py`, `api/tests/tools/**` | data-model.md, contracts/tools-api.md | `TOOL_REGISTRY`, `TOOL_SCHEMAS`, `build_prompt()` |
| **D** | Voice bootstrap | `api/app/routers/voice.py`, `api/tests/voice/**` | contracts/voice-bootstrap.md | The bootstrap response |
| **E** | Voice transport | `web/components/voice/**`, `web/lib/voiceClient/**` | contracts/aai-websocket.md, contracts/voice-bootstrap.md | `useVoiceAgent()` hook |
| **F** | Workspace UI | `web/app/**`, `web/components/experiment/**`, `web/lib/supabase.ts`, `web/lib/api.ts`, `web/lib/queries/**` | data-model.md, contracts/db-read.md | The workspace screen |
| **G** | Evaluation harness | `api/eval/**` | contracts/tools-api.md, contracts/eval-metrics.md | `metrics.json` |
| **H** | Reliability dashboard | `web/components/reliability/**` | contracts/eval-metrics.md | The dashboard panel |

Note the dependency column: **no stream depends on another stream's code.** Every dependency is on a frozen document. That is what makes the parallelism real rather than nominal.

### How each stream works without the others

This is the part that usually breaks, so it is specified per stream:

- **C without B**: handlers take the database client as a parameter and never construct one. Unit tests pass a fake. Handler logic — the entire validation layer, which is the differentiator — is fully testable before the real client exists.
- **C without A**: the handler test suite uses fixture rows shaped by `data-model.md`. Real-database integration happens at Gate I1.
- **D without C**: imports `TOOL_SCHEMAS` by the name the contract declares, against the stub Stream 0 committed. Its own tests assert the *shape* of the bootstrap response against `contracts/voice-bootstrap.example.json`, not the schema contents.
- **E without D**: reads `contracts/voice-bootstrap.example.json` from disk in development, behind a one-line switch. Connects to AssemblyAI with a manually minted token. The entire voice loop — microphone, playback, transcripts, barge-in, the pending-results buffer — is buildable and demonstrable before the backend exists.
- **E without C**: routes `tool.call` to a local echo that returns a canned success from the contract's examples. Proves the round trip without any handler.
- **F without A**: renders from fixture data matching `contracts/db-read.md`, behind the same switch.
- **F without E**: the workspace takes voice state as props with a defined shape; a development control panel drives it manually. The screen is fully buildable with no microphone involved.
- **G without C**: scenarios (the bulk of the work, and the part needing judgement) are written entirely against `contracts/tools-api.md`. Only the runner's final wiring needs real handlers.
- **H without G**: renders `contracts/eval-metrics.example.json`. The dashboard is finished before a single scenario has run.

### Integration gates

| Gate | Entry | Single observable outcome |
|---|---|---|
| **I1 — Backend truth** | A + B + C complete | `POST /tools` with a real user JWT creates a real measurement row and a real event row, and rejects an unowned experiment, an unknown sample, and a missing unit |
| **I2 — Voice loop** | B + D + E complete | Speak into the deployed frontend, hear a reply, see live and final transcripts, interrupt the agent successfully. No tools yet |
| **I3 — The hero** | I1 + I2 + F | Say "A17 is 4.2 Celsius" and watch the measurement cell update, then hear a confirmation that restates the stored values |
| **I4 — Evidence** | I1 + G + H | The evaluation runs against real handlers and the dashboard renders the numbers it just produced |

I1 and I2 are independent and can complete in either order. I3 is the project's actual success condition — everything before it is preparation and everything after is evidence and polish.

### Suggested agent allocations

**Six agents** (maximum useful concurrency): `P` → `A+B` → `C` → `D+E` → `F` → `G+H`. Streams A and B are small and adjacent; D and E share the bootstrap contract; G and H share the metrics contract.

**Three agents**: `A+B+C+G` (backend and evidence) · `D+E` (voice) · `F+H` (interface). This is the recommended allocation for a solo operator — three coherent mental models rather than eight context switches.

**One agent**: A → B → C → I1 → D → E → I2 → F → I3 → G → H → I4. The dependency order is unchanged; only the wall clock differs.

Beyond six, agents begin contending for the integration gates rather than doing independent work.

### The contract change protocol

Contracts will need to change — the AssemblyAI documentation may lag its implementation, and the spike may reshape Stream F. The protocol:

1. The discovering agent **stops** and reports the specific divergence with evidence (a logged event, a failing response).
2. The contract file is amended, with the change noted in its changelog section.
3. Every stream that names that contract in its dependency column is notified before continuing.

The failure mode this prevents is the expensive one: an agent that finds a contract wrong, works around it locally, and ships code that disagrees with three other streams in a way nobody discovers until the integration gate.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-lablog-voice-notebook/
├── plan.md                        # This file
├── spec.md                        # Derived requirements
├── research.md                    # Phase 0 — decisions, incl. 13 corrections to the source brief
├── data-model.md                  # Phase 1 — entities, validation, state transitions
├── quickstart.md                  # Phase 1 — how to prove each gate
├── contracts/
│   ├── README.md                  # Index + the change protocol
│   ├── aai-websocket.md           # FROZEN external protocol (verified against live docs)
│   ├── voice-bootstrap.md         # GET /voice/bootstrap  (+ .example.json)
│   ├── tools-api.md               # POST /tools — all 10 tools, args, results, errors
│   ├── db-read.md                 # Browser read + change-subscription contract
│   └── eval-metrics.md            # metrics.json schema (+ .example.json)
└── tasks.md                       # NOT created by /speckit-plan — run /speckit-tasks
```

### Source code (repository root)

```text
lablog/
├── web/                                   # Next.js — Streams E, F, H
│   ├── app/
│   │   ├── (auth)/login/page.tsx                          [F]
│   │   └── dashboard/experiments/[id]/page.tsx            [F]  the one screen
│   ├── components/
│   │   ├── voice/                                         [E]
│   │   │   ├── VoiceAgent.tsx  useVoiceAgent.ts
│   │   │   ├── TranscriptPanel.tsx  VoiceStatus.tsx  MicControl.tsx
│   │   │   └── audio/micWorklet.ts  audio/player.ts
│   │   ├── experiment/                                    [F]
│   │   │   ├── ExperimentHeader.tsx  ProtocolProgress.tsx  SamplePanel.tsx
│   │   │   ├── MeasurementTable.tsx  ObservationPanel.tsx  DeviationPanel.tsx
│   │   │   └── ExperimentTimeline.tsx
│   │   └── reliability/ReliabilityDashboard.tsx           [H]
│   └── lib/
│       ├── voiceClient/                                   [E]  protocol types + state machine
│       ├── supabase.ts  api.ts  queries/                  [F]
│       └── fixtures/                                      [0]  committed contract examples
│
├── api/                                   # FastAPI — Streams B, C, D, G
│   ├── app/
│   │   ├── main.py  deps.py  db.py  audit.py              [B]
│   │   ├── routers/health.py                              [B]
│   │   ├── routers/tools.py                               [C]
│   │   ├── routers/voice.py                               [D]
│   │   └── tools/models.py  schemas.py  handlers.py  normalize.py  prompt.py   [C]
│   ├── eval/scenarios.py  run.py  metrics.json            [G]
│   ├── tests/                                             [B/C/D own their subtrees]
│   └── requirements.txt  .env.example  Dockerfile         [0]
│
├── supabase/                              # Stream A
│   ├── migrations/0001_init.sql
│   └── seed.sql
│
├── spike/                                 # Stream P — deleted before submission
└── README.md                              [0 creates; each stream appends its section]
```

**Structure decision**: A monorepo with two independently deployed services. The split follows the trust boundary (A4) rather than convenience — everything holding a privileged credential is in `api/`, everything shipped to a browser is in `web/`. That makes the security property inspectable by looking at the directory tree, and it makes the environment-variable rule (G3) mechanically checkable in continuous integration rather than a matter of discipline.

`supabase/` sits outside both because the schema is shared truth owned by neither service.

---

## What is deliberately not being built

Listed because a plan that only says what to build gives an agent no basis for refusing work. From [spec.md §Scope](spec.md): additional evaluation scenarios beyond the corpus, barcode sample selection (unless R-011 fails), previous-run comparison, mid-session vocabulary reconfiguration, voice-driven search, a multi-screen shell, and voice-driven experiment creation.

Cross-browser audio support is also out (R-012) — Firefox and Safari need worklet resampling, which is real work for no demonstration value.

An agent asked to add any of these should decline and point here.

---

## Next step

Run `/speckit-tasks` to generate `tasks.md`. The stream table above maps directly onto parallelisable task groups, and the file-ownership column is what lets the generated tasks be marked genuinely independent rather than optimistically so.
