# Phase 0 — Research & Decisions

**Feature**: 001-lablog-voice-notebook
**Date**: 2026-09-15
**Status**: All blocking unknowns resolved except **R-011** (empirical, requires the Phase 0 spike to run)

The source brief (`LabLog_Implementation_Plan.md`) carried an explicit warning that its §§7–9 were *reconstructed* from blog posts and had to be verified against live documentation before any voice code was written. That verification is done, and it is recorded here. **Several reconstructed details were wrong in ways that would have cost debugging time**; those corrections are marked ⚠️.

---

## R-001 — AssemblyAI Voice Agent wire protocol ⚠️ CORRECTS SOURCE BRIEF

**Decision**: Treat [`contracts/aai-websocket.md`](contracts/aai-websocket.md) as the single frozen transcription of the protocol. Every voice-side agent codes against that file, not against §7 of the source brief.

**Rationale**: The protocol is an external dependency we do not control and cannot negotiate. Writing it down once, precisely, converts the project's single largest unknown into a fixed interface that several agents can build against simultaneously.

**Findings — corrections to the source brief:**

| # | Source brief said | Live docs say | Why it matters |
|---|---|---|---|
| 1 | Tool schema is OpenAI-nested: `{"type":"function","function":{"name",...}}` | **Flat**: `{"type":"function","name","description","parameters",...}` | The brief's `_openai_fn()` helper would emit a shape the agent rejects. Single change point, but a silent failure if unnoticed. |
| 2 | `tool.call` carries `id` and `arguments` as a **JSON string** (`JSON.parse(call.arguments)`) | `tool.call` carries **`call_id`** and `arguments` as an already-parsed **object** | `JSON.parse()` on an object throws. Two bugs in one line of the brief. |
| 3 | `tool.result` returns `{tool_call_id, result}` | `{"type":"tool.result","call_id":…,"result":"<JSON **string**>"}` | Result must be serialised even though the inbound arguments are not. Asymmetric and easy to get backwards. |
| 4 | Audio in as `{type:"input_audio", audio:…}` | `{"type":"input.audio","audio":"<base64>"}` | Dotted namespacing throughout; underscore form is not recognised. |
| 5 | Agent audio "chunk" event unnamed | `reply.audio` with the payload in **`data`** (not `audio`) | Input uses `audio`, output uses `data`. |
| 6 | "verify audio format keys" | `input.format.encoding: "audio/pcm"` = PCM16 LE **24 kHz**; same enum for `output.format.encoding` | Confirms the brief's 24 kHz assumption — no resampling on Chromium. |
| 7 | Barge-in handled via an "interruption / user-started" event | Signalled by **`reply.done` with `status:"interrupted"`**, plus `input.speech.started`; enabled by `input.turn_detection.interrupt_response` (**default true**) | There is no dedicated interruption event to listen for. Building against the brief would produce a barge-in handler that never fires. |
| 8 | Reconnect: "use session resume if docs expose it" | **`session.resume` with `session_id`** exists; `session.ready` returns the `session_id` to save | FR-025 is fully achievable, not best-effort. |
| 9 | Not mentioned | **`input.keyterms`** — up to 100 transcription-bias terms, updatable mid-session | Directly attacks the project's #1 risk. See R-002. |
| 10 | Not mentioned | **`execution_mode`**: `"interactive"` (agent speaks filler while the tool runs) vs `"hold"` (silent) | Materially changes demo feel. See R-004. |
| 11 | Not mentioned | Tool results must be **buffered and sent only after `reply.done`** for the turn containing the `tool.call` | This is a hard protocol rule that shapes the client state machine. Sending early is the single most likely voice-loop bug. |
| 12 | Token via `GET /v1/token` with `Authorization: Bearer <key>` | Confirmed, plus `expires_in_seconds` (1–600) and `max_session_duration_seconds` (60–10800) | Brief was right; parameters now pinned. |
| 13 | REST agent management auth as `Bearer` | Agents REST API uses **`Authorization: <API_KEY>`** (no `Bearer`) while the token endpoint uses `Bearer` | Inconsistent between the two endpoints. Only matters if stored agents are used (they are not — R-003). |

**Alternatives considered**: Building against the brief and fixing at runtime — rejected; items 2, 6 and 11 fail in ways that look like platform flakiness rather than client bugs, which is the worst kind of debugging under a deadline.

**Residual risk**: Documentation can still lag implementation. Mitigation: the first task of the voice-transport stream is a 30-line connectivity probe that logs every received event type verbatim before any application code is written. If observed events disagree with the contract file, the contract file is corrected and the change is announced — not worked around locally.

---

## R-002 — Entity-accuracy strategy: defence in depth, not a single bet ⚠️ CHANGES THE PHASE 0 GATE

**Decision**: Four independent layers, applied in this order.

1. **ASR bias** — inject the active experiment's sample codes and its measurement-type vocabulary into `input.keyterms` at session bootstrap (and refresh mid-session when context changes).
2. **Normalisation** — a per-experiment alias map built at bootstrap from the seeded sample list, applied in the handler *before* lookup: casefold, strip spaces/hyphens, map spelled-out digits ("control one", "control-1", "CONTROL 01" → `CONTROL-01`).
3. **Specific rejection** — on lookup failure return a not-found error carrying the list of valid sample codes, so the agent can ask "did you mean A17 or A18?" rather than guessing or apologising vaguely.
4. **Barcode fallback** — promote barcode-selects-sample from deferred to in-scope **only if** layers 1–3 together fail the accuracy gate.

**Rationale**: The source brief framed entity accuracy as a single make-or-break empirical gate ("strong accuracy → proceed; shaky → narrow the input space"). The discovery of `input.keyterms` changes the shape of that gate. Sample codes are exactly the "rare words, product names" case the feature exists for, and they are known at session start because the experiment is seeded. Measuring raw accuracy without keyterms would overstate the risk and could trigger an expensive barcode detour that was never needed.

**This modifies the source brief's §5**: the spike must measure **with keyterms enabled**, and should measure without them too — the delta is a genuinely interesting number for the submission ("keyterms lifted sample-ID accuracy from X% to Y%").

**Alternatives considered**:
- *Phonetically distinct sample IDs only* (e.g. avoid "A17"): works, but quietly redefines the demo to dodge the hard case. Keep realistic IDs; make them work.
- *Confirm-on-write for every measurement* ("did you say 4.2?"): doubles turn count and makes the demo feel slow and unconfident. Reserve confirmation for genuinely ambiguous input and for destructive actions, per FR-016 and FR-010.
- *Constrained grammar / forced choice*: not exposed by the API, and would fight the conversational premise.

**Open**: the empirical result. See R-011.

---

## R-003 — Client-side function tools, not server-side HTTP tools **[closes the source brief's open §3 decision]**

**Decision**: Use **inline session configuration with client-side function tools**. The browser receives `tool.call`, forwards it to FastAPI with the user's own credential, and returns `tool.result` over the WebSocket. Do **not** use stored agents with server-side HTTP tools.

**Rationale**: The source brief left this open until week 2 and leaned toward HTTP tools because FastAPI is publicly reachable. The documentation closes it against them, on four independent grounds:

1. **Identity is the decisive one.** HTTP-tool credentials are static `headers` stored on the agent at creation time. They cannot carry the *end user's* session credential. Per-user authorisation (FR-018, FR-019) would then require either a shared secret plus a session→user correlation table, or trusting a user identifier passed as a tool *argument* — i.e. letting the model assert who the user is. That inverts the project's central security claim ("the model is never trusted"). Forwarding through the already-authenticated browser makes the user's credential arrive by construction.
2. **The hero moment depends on it.** If AssemblyAI calls the backend directly, the browser learns about the write only when the database change propagates back. The sub-second "the cell updates as you speak" effect (SC-002) requires the tool result to arrive *in the browser*.
3. **Context is per-session.** Stored agents fix the system prompt and tool set at creation. LabLog injects live per-experiment context (sample codes, current step, keyterms) at session start; inline configuration is the natural fit.
4. **Response ceiling.** HTTP tool responses are capped at 8 KiB with redirects blocked. Sample history and completion summaries could brush that.

**Cost accepted**: the browser is now on the critical write path — if the tab dies between `tool.call` and `tool.result`, the write does not happen. This is acceptable: nothing is half-written (the backend never saw the call), and the agent's turn simply fails rather than falsely confirming. The event trail makes any such gap visible.

**Alternatives considered**: A hybrid — HTTP tools for reads (`get_next_protocol_step`, `get_sample_history`) and function tools for writes. Rejected as a second integration surface, a second auth story and a second failure mode, bought for no user-visible gain.

---

## R-004 — `execution_mode: "hold"` for mutating tools

**Decision**: `"hold"` for all ten tools. Revisit only if a handler is measured above ~800 ms.

**Rationale**: `"interactive"` makes the agent speak a filler phrase while the tool runs. Our handlers are a single indexed query plus one or two inserts against a database in the same region — hundreds of milliseconds. A filler phrase in front of a sub-second write makes the interaction feel *slower*, not faster, and it emits an utterance that is not grounded in a completed database write, which is precisely the failure mode this product exists to prevent. Silence, then a confirmation that restates what was actually stored, is both faster and more honest.

**Alternatives considered**: `"interactive"` for `check_experiment_completeness` (which scans the whole experiment) — a reasonable exception, deferred until it is measured rather than assumed.

---

## R-005 — No agent framework **[confirms the source brief]**

**Decision**: No LangChain, LangGraph, or equivalent. Pydantic for validation and typed models; a dictionary-dispatch function for routing.

**Rationale**: The reasoning loop physically lives in AssemblyAI's LLM Gateway — it owns conversation history, turn-taking, tool-selection and in-session context. Our process receives a validated function call and returns a row. An orchestration framework orchestrates a loop *you own*; there is no such loop in this process, so the framework would wrap a single function call and add a dependency, an abstraction layer and a debugging surface for zero control gained. The only path that would justify one is abandoning the Voice Agent API for hand-rolled STT → own-loop → TTS, which re-implements turn detection, barge-in and streaming speech — the exact work the API removes — in a competition judged on using that API.

This is worth stating explicitly in the submission: choosing *not* to add a framework, for an articulable reason, is an architectural decision, not an omission.

**What replaces "agent state"**: ordinary database state. Active experiment, sample codes and protocol position are read from Postgres, injected into the system prompt at session start, and re-read inside each handler. There is no framework-held memory to go stale.

---

## R-006 — Explicit ownership checks, because the service role bypasses RLS

**Decision**: Row-level security is enabled on every table and scoped to the owner, **and** every tool handler independently re-verifies `experiment.owner_id == authenticated_user.id` before touching anything.

**Rationale**: These protect different paths and neither is redundant. RLS protects the browser's direct reads and its Realtime subscriptions, where the anon key carries the user's JWT and the database enforces scope. The backend uses the service role key specifically so it can write audit rows and compute summaries, and that key bypasses RLS entirely — so for backend writes the database enforces nothing and the check must be in application code. Omitting the explicit check would mean any authenticated user could mutate any experiment by supplying its id, and the model's arguments are the least trustworthy input in the system.

**Implementation note**: the check belongs in the dispatcher, once, before any handler runs — not repeated in each of the ten handlers where one omission is one vulnerability.

---

## R-007 — Two update paths into the UI, with a defined reconciliation rule

**Decision**: Patch the query cache optimistically from a successful `tool.result`, **and** subscribe to database change events as the canonical path. On conflict, the database wins.

**Rationale**: They serve different masters. The optimistic patch delivers SC-002 (visible within 2 s of the utterance — in practice one frame after the tool returns). The subscription is what makes the screen an honest reflection of stored state, and it is what makes the demo claim "this is really in the database" true rather than theatrical. Using only the subscription costs a visible round trip at the exact moment the demo is selling. Using only the optimistic patch means the screen shows what the client *believes*, which is the thing this product is against.

**Reconciliation rule**: optimistic rows are inserted with a client-generated temporary key and the server id returned by the tool result. When the corresponding change event arrives, it replaces the optimistic row by server id. Any optimistic row that has not been confirmed within 10 seconds is marked unconfirmed in the UI rather than silently kept.

---

## R-008 — Text-level evaluation, with ASR measured separately

**Decision**: Two distinct measurements, never combined into one figure.
- **Transcription accuracy** — measured in the Phase 0 spike, from real audio, reported as its own number.
- **Agent-decision accuracy** — measured by the evaluation harness at text level: given an utterance plus the real system prompt and the real tool schemas, does the model select the right tool with the right arguments, and does the real handler accept or reject correctly?

**Rationale**: A single blended number cannot be acted on — a regression could come from either layer, and neither can be tuned without knowing which. Separating them also makes both defensible under questioning, and the decision layer can be run hundreds of times cheaply because it needs no audio.

**Critical detail**: the harness must execute the **real handler functions** against a disposable experiment, not a mock. The validation layer is the differentiator; evaluating a simulation of it would prove nothing.

**Alternatives considered**: End-to-end audio evaluation. Rejected as slow, expensive and non-deterministic, for a number that is less informative than the two it replaces. It remains the right thing to do with more time.

---

## R-009 — Server-authored session configuration

**Decision**: `GET /voice/bootstrap` returns both the temporary token **and** the fully-formed session configuration — system prompt, tool schemas, voice, audio format, turn detection and keyterms — for the browser to pass through verbatim.

**Rationale**: It keeps the tool schemas generated from Pydantic models (one source of truth for both the schema the model sees and the validation the handler applies — R-010), keeps prompt engineering in one language and one repository, and lets the prompt and tool set change without a frontend deployment. The browser becomes a transport, which is exactly what it should be: it holds a credential that expires in minutes and configuration it did not author.

**Consequence for parallel work**: the browser transport stream and the backend bootstrap stream share only the shape of this response. Freeze it (see [`contracts/voice-bootstrap.md`](contracts/voice-bootstrap.md)) with a committed example fixture, and both can be built and tested simultaneously with no coupling.

---

## R-010 — Pydantic models as the single source of truth for tool schemas

**Decision**: Author each tool's arguments as a Pydantic model. Derive the JSON Schema the agent sees from the same model that validates the incoming call. Exactly one function performs the shape conversion.

**Rationale**: Hand-written JSON schemas alongside hand-written validation drift, and the drift is invisible — the agent sends what the schema promised and the handler rejects it, which reads as a model failure. Deriving both from one declaration makes drift structurally impossible. Isolating the shape conversion in one function is what made correction ⚠️#1 in R-001 a one-line fix rather than a ten-tool edit.

**Guidance discovered**: keep tool sets at ten or fewer for selection accuracy. The scoped set is exactly ten. This is a hard ceiling, not a coincidence — any new tool must displace an existing one.

**Schema enrichment**: JSON Schema `enum`, `pattern` and `examples` are supported and improve extraction accuracy. Use `enum` for measurement types and `examples` carrying real seeded sample codes.

---

## R-011 — OPEN (empirical): the entity-accuracy gate

**Status**: Cannot be resolved by research. Requires the Phase 0 spike to run against live audio.

**Question**: With R-002's layers 1–3 in place, what is the sample-identifier accuracy for spoken alphanumerics ("A seventeen", "sample A one seven", "control one"), and the value/unit accuracy for spoken numbers ("four point two", "twelve thousand RPM", "pH seven point four")?

**Gate**: ≥95% on sample identifiers with keyterms enabled → proceed as planned. Below that → promote barcode-selects-sample into scope and reduce voice to carrying the *value* only, with the sample set visually.

**Why it stays open**: this is the one question where reasoning cannot substitute for measurement, and it is the reason the spike is scheduled before anything else is built.

**Secondary outputs the spike must produce** (written into the repository README): the locked sample-identifier scheme, the number/unit phrasing conventions the demo script will use, and the concrete alias pairs the normalisation map must handle.

---

## R-012 — Browser audio pipeline

**Decision**: `AudioWorklet` at 24 kHz, Float32 → Int16 with bounds checking, base64, batched to roughly 50 ms per `input.audio` message. Playback schedules decoded buffers on a running cursor; on interruption the cursor resets to the current time and queued sources are stopped.

**Rationale**: Confirmed against the documented browser guidance. Two constraints worth recording:
- The worklet callback delivers 128 samples (~5.3 ms at 24 kHz). Sending a WebSocket message per callback is ~190 messages/second — wasteful. Accumulate to ~50 ms (1200 samples) before sending.
- **Chromium honours a forced 24 kHz `AudioContext`; Firefox and Safari do not** and require resampling inside the worklet. **Record the demo in Chromium.** Cross-browser resampling is real work for zero demo value and belongs behind the deferred line.

`ScriptProcessorNode` is deprecated and runs on the main thread, where a UI repaint becomes an audio glitch — precisely when the dashboard is animating, which is the moment being filmed.

---

## R-013 — Deployment topology

**Decision**: Frontend on Vercel; FastAPI on a container host **in the same region as the database**, kept warm.

**Rationale**: The tool round trip sits inside a spoken turn, so its latency is perceived directly as hesitation. The dominant term is the backend↔database round trip; co-locating them removes it. A cold start on a serverless backend would land on the first spoken measurement — the single most important moment of the demonstration — so an always-on instance is worth more than its cost here.

**Corollary**: deploy both services, empty, on day one. Cross-origin configuration, credential propagation and environment wiring are the classic end-of-project time sink, and they are trivial to solve against an empty application.

---

## Sources

- [Voice Agent API overview](https://www.assemblyai.com/docs/voice-agents/voice-agent-api)
- [Voice Agent WebSocket API spec](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/api-spec/voice-agent-websocket)
- [Browser integration](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/browser-integration)
- [Tools overview](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/tools/overview)
- [Manage agents (REST)](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/manage-agents)
- [Inline session configuration](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/session-configuration)
- [Raw WebSocket voice agent walkthrough](https://www.assemblyai.com/blog/raw-websocket-voice-agent-voice-agent-api)
- [LLM Gateway](https://www.assemblyai.com/blog/one-platform-multiple-models-simplifying-voice-ai-llm-gateway)
