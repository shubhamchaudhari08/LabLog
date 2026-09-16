# Contract — AssemblyAI Voice Agent WebSocket protocol

**Status**: FROZEN · verified against live documentation 2026-09-15
**Nature**: External. We do not control this and cannot negotiate it.
**Consumed by**: Stream E (voice transport), Stream D (session config authoring)

> **Stream E must read this file instead of the AssemblyAI documentation, and instead of §7 of `LabLog_Implementation_Plan.md`.** The source brief's §7 was reconstructed from blog posts before the API was verified; it is wrong in thirteen places, catalogued in [research.md R-001](../research.md). Several of its errors fail *silently*.

---

## 1. Credential

Minted server-side only (Stream D). The browser never sees the API key.

```http
GET https://agents.assemblyai.com/v1/token?expires_in_seconds=300&max_session_duration_seconds=3600
Authorization: Bearer <ASSEMBLYAI_API_KEY>
```

Response: `{ "token": "<temporary token>" }`

- `expires_in_seconds` — redemption window, 1–600. **Use 300.** This is how long the browser has to open the socket, not how long the session lasts.
- `max_session_duration_seconds` — session cap once open, 60–10800. **Use 3600.**
- The token is **single-use**: it starts exactly one session. A reconnect needs a fresh token.

---

## 2. Connection

```
wss://agents.assemblyai.com/v1/ws?token=<token>
```

(Server-side clients may instead send `Authorization: Bearer <API_KEY>` as a header. The browser must use the query parameter.)

---

## 3. Client → server messages

| Type | Fields | Purpose |
|---|---|---|
| `session.update` | `type`, `session` | Configure the agent. **First message after open.** May be sent again mid-session to update most fields. |
| `input.audio` | `type`, `audio` | Base64 PCM16. Send only after `session.ready`. |
| `tool.result` | `type`, `call_id`, `result` | Return a tool outcome. **See §6 — timing is a hard rule.** |
| `session.resume` | `type`, `session_id` | Reconnect to a prior session. |
| `session.end` | `type` | Clean teardown. |
| `reply.create` | `type`, optional `instructions` | Force a reply now. Not used in the MVP. |

### `session.update` payload

The `session` object is produced by the backend and passed through verbatim by the browser (see [voice-bootstrap.md](voice-bootstrap.md)). Stream E must **not** author or mutate it.

```jsonc
{
  "type": "session.update",
  "session": {
    "system_prompt": "…",
    "greeting": "LabLog ready. Experiment STAB-104 is running.",
    "input": {
      "format":         { "encoding": "audio/pcm" },      // PCM16 LE, 24 kHz, mono
      "keyterms":       ["A17", "A18", "CONTROL-01", "temperature", "Celsius", "pH"],
      "turn_detection": {
        "vad_threshold":     0.5,    // 0.0–1.0, lower = more speech-sensitive
        "min_silence":       1000,   // ms
        "max_silence":       3000,   // ms, must exceed min_silence
        "interrupt_response": true   // barge-in; default true
      }
    },
    "output": {
      "format": { "encoding": "audio/pcm" },
      "voice":  "anna",
      "volume": 80
    },
    "tools": [ /* see §5 */ ]
  }
}
```

**Field notes**
- `greeting` is spoken verbatim and is **not** processed by the language model. It is **immutable after `session.ready`**.
- `input.keyterms` — up to **100** terms, updatable mid-session. Central to entity accuracy ([research.md R-002](../research.md)).
- `agent_id` binds a stored agent and is **mutually exclusive** with the inline fields above. We do not use it ([research.md R-003](../research.md)).

---

## 4. Server → client messages

| Type | Key fields | Stream E must |
|---|---|---|
| `session.ready` | `session_id` | **Store `session_id`** — needed for `session.resume` and sent on every `POST /tools`. Begin sending audio. |
| `session.updated` | — | Confirms config applied. |
| `input.speech.started` | — | Status → *Listening*. Secondary barge-in signal. |
| `input.speech.stopped` | — | Status → *Thinking*. |
| `transcript.user.delta` | `text` | Render as provisional (grey) text. |
| `transcript.user` | `text`, `item_id` | Commit the user turn; clear the provisional buffer. |
| `reply.started` | `reply_id` | Status → *Speaking*. Open a turn buffer for pending tool results. |
| `reply.audio` | **`data`** (base64) | Decode and schedule for playback. |
| `transcript.agent` | `text`, `reply_id`, `item_id`, `interrupted` | Commit the agent turn. |
| `reply.done` | `status`: `"completed"` \| `"interrupted"` | **Flush pending tool results now (§6).** If `interrupted`, run barge-in (§7). Status → *Listening*. |
| `tool.call` | `call_id`, `name`, `arguments` | Dispatch (§6). |
| `session.error` / `error` | `code`, `message`, optional `param` | Surface, and reconnect if fatal (§8). |
| `session.ended` | `session_duration_seconds`, `audio_duration_seconds` | Teardown. |

---

## 5. Tool declaration shape ⚠️

**Flat, not OpenAI-nested.** The source brief's `{"type":"function","function":{…}}` wrapper is wrong and the agent will reject it.

```jsonc
{
  "type": "function",
  "name": "record_measurement",
  "description": "Record ONE numeric measurement for a known sample…",
  "parameters": {                       // standard JSON Schema
    "type": "object",
    "properties": { "sample_code": { "type": "string", "examples": ["A17", "CONTROL-01"] } },
    "required": ["sample_code", "measurement_type", "value"]
  },
  "execution_mode": "hold",             // "interactive" (speaks a filler) | "hold" (silent)
  "timeout_seconds": 30                 // 1–300, default 120
}
```

`enum`, `pattern`, `format` and `examples` are supported and measurably improve argument extraction — use them.

**Limit: keep the tool set at ten or fewer** for selection accuracy. The scoped set is exactly ten; a new tool must displace an existing one.

We use `execution_mode: "hold"` throughout ([research.md R-004](../research.md)).

---

## 6. Tool call round trip ⚠️ — the timing rule

Inbound:
```jsonc
{ "type": "tool.call", "call_id": "call_abc123", "name": "record_measurement",
  "arguments": { "sample_code": "A17", "value": 4.2, "unit": "C" } }
```

- The field is **`call_id`**, not `id`.
- **`arguments` is already an object.** Do **not** `JSON.parse()` it — the source brief says to, and it throws.

Outbound:
```jsonc
{ "type": "tool.result", "call_id": "call_abc123",
  "result": "{\"success\":true,\"data\":{\"sample_code\":\"A17\",\"value\":4.2,\"unit\":\"C\"}}" }
```

- **`result` must be a JSON *string***, even though `arguments` arrives as an object. The asymmetry is easy to get backwards.

### The hard rule

> **Accumulate tool results and send them only after `reply.done` arrives for the turn that contained the `tool.call`.**

Stream E therefore cannot be a stateless event router. It needs a per-turn pending buffer:

```
reply.started(reply_id)  → open buffer for reply_id
tool.call                → dispatch async; push {call_id, result} into the buffer on completion
reply.done(reply_id)     → send every buffered tool.result, then close the buffer
```

A result that arrives *after* `reply.done` (a slow backend) is sent immediately. A `tool.call` whose dispatch fails still sends a result — an error result (`{"success":false,"error":"TRANSPORT_ERROR"}`), never silence. Silence leaves the agent waiting until `timeout_seconds` with a live microphone and no explanation, which on camera looks exactly like a crash.

Sending early is the single most likely voice-loop bug, and it presents as the agent ignoring tool results rather than as a client error.

---

## 7. Barge-in ⚠️

**There is no interruption event.** A handler written against the source brief's imagined "interruption / user-started" event compiles, runs, and never fires.

Interruption is signalled by:
- `reply.done` with `status: "interrupted"` — the authoritative signal, and
- `input.speech.started` while the agent is speaking — an earlier, softer hint.
- `transcript.agent.interrupted: true` — confirmation after the fact.

On interruption the player must: stop every scheduled buffer source, clear the queue, and **reset the scheduling cursor to `audioContext.currentTime`**. The reset is the part that gets forgotten; without it the cursor still points into the future and the next reply is played late, or stale audio resumes seconds later.

`input.turn_detection.interrupt_response` defaults to `true` — do not disable it.

---

## 8. Reconnection

`session.resume` with a stored `session_id` exists, so FR-025 is fully achievable:

1. Socket drops → show a degraded state and **disable destructive actions** immediately.
2. Mint a **fresh token** (the old one is spent).
3. Reconnect and send `{"type":"session.resume","session_id":"<stored>"}`.
4. On failure, fall back to a fresh `session.update` and tell the user the conversation context was lost.

**Never claim a save that did not happen.** Any tool call in flight when the socket dropped has an unknown outcome — reconcile against the database rather than assuming either result.

Relevant error codes: `session_not_found`, `session_expired`, `UNAUTHORIZED`, `FORBIDDEN`, `invalid_format`, `invalid_audio`, `invalid_value`, `immutable_field`, `agent_init_failed`, `INTERNAL_ERROR`.

---

## 9. Browser audio pipeline

**Capture**
- `new AudioContext({ sampleRate: 24000 })` — honoured on Chromium. **Firefox and Safari ignore it** and need resampling inside the worklet; they are out of scope. Record the demo in Chromium.
- `AudioWorkletNode`, never `ScriptProcessorNode` — the latter is deprecated and runs on the main thread, where a UI repaint becomes an audio glitch, precisely while the dashboard is animating.
- The worklet callback delivers **128 samples** (~5.3 ms). **Accumulate to ~50 ms (1200 samples) before sending** — one message per callback is ~190/second and wasteful.
- Float32 → Int16: `Math.round(s * 32767)` clamped to `[-32768, 32767]`. Clamping is not optional; unclamped overflow wraps and produces audible clicks that degrade recognition.
- Base64-encode the `Int16Array` buffer and send as `input.audio`.

**Playback**
- Decode `reply.audio.data` → Int16 → Float32 → `AudioBuffer` at 24 kHz.
- Schedule with a running cursor: `start(max(cursor, ctx.currentTime))`, then advance the cursor by the buffer duration. A small lead (~50 ms) absorbs jitter.
- On interruption, reset per §7.

---

## Changelog

| Date | Change |
|---|---|
| 2026-09-15 | Initial freeze. Verified against live docs; 13 corrections to `LabLog_Implementation_Plan.md` §7 recorded in [research.md R-001](../research.md). |
