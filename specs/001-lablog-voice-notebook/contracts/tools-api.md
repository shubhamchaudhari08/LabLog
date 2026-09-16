# Contract — `POST /tools`

**Status**: FROZEN · **Owner**: Stream C · **Consumed by**: Stream E (forwards calls), Stream G (evaluates), Stream F (optimistic patches)

The single mutation endpoint. Every state change in LabLog passes through here — there is no second write path (plan.md §A4). That invariant is what makes the audit trail complete and the ownership check a single line.

---

## Envelope

### Request

```http
POST /tools
Authorization: Bearer <user's Supabase access token>
Content-Type: application/json
```

```jsonc
{
  "tool": "record_measurement",
  "args": { "sample_code": "A17", "measurement_type": "temperature", "value": 4.2, "unit": "C" },
  "experiment_id": "uuid",
  "session_id": "<AssemblyAI session_id from session.ready, may be null>"
}
```

`args` is passed through verbatim from `tool.call.arguments`. Stream E does not inspect, reshape or validate it — validation is the backend's job and duplicating it in the client creates two places for the rules to diverge.

### Response — always HTTP 200 for tool-level outcomes

```jsonc
{ "success": true,  "data": { /* per tool */ } }
{ "success": false, "error": "SAMPLE_NOT_FOUND", "message": "…", "detail": { /* optional */ } }
```

**Why tool failures are 200 and not 4xx**: a tool-level failure is a normal conversational outcome, not a transport error. `SAMPLE_NOT_FOUND` means the agent should ask a question — it is the system working correctly. Reserving non-2xx for genuine transport and auth failures lets Stream E distinguish "the agent needs to handle this" from "the request never landed" without parsing bodies.

Non-2xx is used only for:

| Status | Meaning |
|---|---|
| 401 | Missing, malformed or invalid JWT |
| 403 | Authenticated, but does not own the target experiment |
| 404 | Experiment does not exist |
| 500 | Unhandled server fault |

The whole `{success, error, message}` object is serialised into `tool.result.result` either way, so the agent sees and can speak about the failure.

---

## Dispatcher sequence (Stream C, in this order)

1. Verify the JWT → user id. Failure → **401**.
2. `tool` in the registry? → `UNKNOWN_TOOL`.
3. Validate `args` against the tool's Pydantic model → `INVALID_ARGS` with field-level detail.
4. Load the experiment. Missing → **404**.
5. **`experiment.owner_id == user.id`** → else **403**. Once, here, before dispatch — never repeated in ten handlers where one omission is one vulnerability ([research.md R-006](../research.md)).
6. Mutating tool and `status != 'RUNNING'` → `EXPERIMENT_NOT_RUNNING`.
7. Dispatch to the handler.
8. Handler writes, then writes an `events` row **in the same transaction**, then returns.

Steps 1–6 are the trust boundary. Everything above step 7 exists because the arguments came from a language model.

---

## Error codes

| Code | Raised when | The agent should |
|---|---|---|
| `UNKNOWN_TOOL` | Not in the registry | Never happens in practice; log it |
| `INVALID_ARGS` | Pydantic validation failed | Ask for the missing field |
| `EXPERIMENT_NOT_RUNNING` | Status is not `RUNNING` | State that the experiment is not running |
| `SAMPLE_NOT_FOUND` | No sample resolves | **Suggest from `detail.valid_samples`** |
| `SAMPLE_AMBIGUOUS` | More than one sample resolves | Ask which, listing `detail.candidates` |
| `UNIT_REQUIRED` | Unit absent and no protocol default | Ask for the unit, offering `detail.suggested_units` |
| `INVALID_VALUE` | Not finite (NaN, ±Inf) | Ask the user to repeat the value |
| `MEASUREMENT_NOT_FOUND` | Correction target does not exist | Say there is nothing to correct |
| `NEEDS_CONFIRMATION` | `complete_experiment` without `confirmed` | Ask for explicit confirmation |
| `INCOMPLETE` | Completeness check failed | Read out `detail.missing` |
| `TRANSPORT_ERROR` | *Client-side only* — the POST itself failed | Say the record could not be saved |

Every error carries a human-readable `message`, because that message is what the agent speaks. `"Sample A99 does not exist in STAB-104."` produces a useful spoken reply; `"validation failed"` produces an apology.

---

## The ten tools

Argument names are the JSON Schema property names the model sees. `enum` and `examples` are shown where they materially improve extraction ([research.md R-010](../research.md)).

---

### 1. `get_active_experiment` — read

Returns the session's context. Called at session start.

**Args**: none
**Data**:
```jsonc
{ "experiment_id": "uuid", "experiment_code": "STAB-104", "name": "…", "status": "RUNNING",
  "protocol": { "code": "STAB", "name": "…", "version": "v1", "step_count": 6 },
  "current_step": { "index": 1, "id": "initial_temp", "name": "Record initial temperature",
                    "required_fields": ["sample_id","temperature"] },
  "samples": [ { "code": "A17", "type": "experimental" },
               { "code": "A18", "type": "experimental" },
               { "code": "CONTROL-01", "type": "control" } ] }
```

---

### 2. `record_measurement` — write ★ the core tool

> Record ONE numeric measurement for a known sample. Do not call if the sample, the value, or (when it cannot be resolved from the protocol) the unit is missing — ask instead.

| Arg | Type | Req | Notes |
|---|---|---|---|
| `sample_code` | string | ✓ | `examples: ["A17","A18","CONTROL-01"]` |
| `measurement_type` | string | ✓ | `examples: ["temperature","pH","mass","volume","rpm"]` — open, not a closed enum (see data-model.md) |
| `value` | number | ✓ | must be finite |
| `unit` | string | ✗ | `examples: ["C","F","g","mL","rpm"]`. Omit only if the protocol resolves it |
| `raw_spoken_value` | string | ✗ | verbatim utterance — provenance |

**Handler**: resolve sample (V3) → check finite (V4) → resolve unit from arg, else `protocol.steps[current].default_unit[type]`, else `UNIT_REQUIRED` (V5) → insert, stamping `protocol_step_index` and a **server** timestamp → write `MEASUREMENT_CREATED`.

**Data**: `{ "measurement_id": "uuid", "sample_code": "A17", "measurement_type": "temperature", "value": 4.2, "unit": "C", "recorded_at": "2026-09-15T14:12:03Z" }`

The response echoes the **stored** values, not the requested ones, because the agent's spoken confirmation is generated from it. If normalisation changed `control one` to `CONTROL-01`, the agent says `CONTROL-01` — and the user hears what was actually written.

---

### 3. `correct_measurement` — write

> Correct the most recent measurement for a sample. Never deletes; supersedes and preserves history.

| Arg | Type | Req |
|---|---|---|
| `sample_code` | string | ✓ |
| `measurement_type` | string | ✓ |
| `new_value` | number | ✓ |
| `reason` | string | ✗ (default `"Voice correction"`) |

**Handler**: find the latest non-superseded row → none → `MEASUREMENT_NOT_FOUND` → insert a new row carrying `correction_reason` → set the original's `superseded_by` → write `MEASUREMENT_CORRECTED` with both values.

**Data**: `{ "measurement_id": "uuid", "sample_code": "A17", "measurement_type": "temperature", "previous_value": 4.2, "new_value": 4.3, "unit": "C" }`

Returning `previous_value` lets the agent say *"Corrected. A17 temperature changed from 4.2 to 4.3 degrees Celsius"* — the sentence that demonstrates the audit trail out loud.

---

### 4. `record_observation` — write

> Record a non-numeric textual observation. Never store an observation as a measurement.

| Arg | Type | Req |
|---|---|---|
| `observation` | string | ✓ (non-empty after trimming) |
| `sample_code` | string | ✗ |

**Data**: `{ "observation_id": "uuid", "observation": "…", "sample_code": "A18" | null }`

---

### 5. `create_deviation` — write

| Arg | Type | Req | Notes |
|---|---|---|---|
| `description` | string | ✓ | |
| `reason` | string | ✗ | |
| `type` | string | ✗ | `enum: ["timing","procedure","other"]` |
| `severity` | string | ✗ | `enum: ["low","medium","high"]`, default `medium` |

**Data**: `{ "deviation_id": "uuid", "description": "…", "type": "timing", "severity": "medium", "status": "open" }`

---

### 6. `get_next_protocol_step` — read

> Return the next approved protocol step from stored state. **Never invent steps.**

**Args**: none
**Data**: `{ "step_index": 2, "id": "prep_complete", "name": "Mark preparation complete", "required_fields": [], "is_final": false }`
Past the last step: `{ "is_final": true, "message": "This is the final step." }`

This handler is the mechanical guarantee behind FR-017. It reads an array element. It cannot generate, so the agent cannot be tricked into improvising procedure through it — and the system prompt's refusal instruction is backed by an implementation that has no generative path.

---

### 7. `complete_protocol_step` — write

| Arg | Type | Req |
|---|---|---|
| `step_id` | string | ✗ (defaults to the current step) |

Advances `current_step_index` by one, clamped at the last step. Writes `PROTOCOL_STEP_COMPLETED`.
**Data**: `{ "completed_step": {...}, "current_step": {...}, "is_final": false }`

---

### 8. `get_sample_history` — read

| Arg | Type | Req |
|---|---|---|
| `sample_code` | string | ✓ |

**Data**: `{ "sample_code": "A17", "measurements": [ { "type", "value", "unit", "recorded_at", "corrected": bool } ], "observations": [ { "observation", "recorded_at" } ] }`

Current (non-superseded) values only. Cut first if scope must shrink.

---

### 9. `check_experiment_completeness` — read ★ the integrity gate

> Return whether all protocol-required fields are recorded; list what is missing. Call before completing.

**Args**: none
**Data**:
```jsonc
{ "complete": false,
  "missing": [ { "step_index": 3, "step_name": "Record second temperature",
                 "field": "temperature", "samples": ["A18","CONTROL-01"] } ],
  "summary": { "measurements": 4, "observations": 1, "deviations": 1 } }
```

`missing` is structured per step and per sample so the agent can say exactly what is outstanding rather than "something is missing."

---

### 10. `complete_experiment` — write ★ irreversible

> Mark the experiment COMPLETED. Only after completeness passes AND the user explicitly confirms.

| Arg | Type | Req |
|---|---|---|
| `confirmed` | boolean | ✓ |

**Handler**: `confirmed != true` → `NEEDS_CONFIRMATION`. Re-run the completeness check **server-side** → failing → `INCOMPLETE` with `detail.missing`. Otherwise set `COMPLETED` with a server `completed_at`, write `EXPERIMENT_COMPLETED`, and return a summary.

**Data**:
```jsonc
{ "experiment_code": "STAB-104", "status": "COMPLETED", "completed_at": "…",
  "summary": { "duration_minutes": 47, "measurement_count": 6, "correction_count": 1,
               "observation_count": 2, "deviation_count": 1, "samples_measured": 3 } }
```

Two properties are deliberate. The completeness check is **re-run in the handler** rather than trusted from a previous tool call — the model could otherwise complete an experiment by calling this directly, and a gate the caller can skip is not a gate. And every figure in `summary` is **computed by the database**, never by the model ([spec.md](../spec.md) FR-011); a model-computed duration is a plausible-looking number with no relationship to the data.

---

## Fixtures

`tools-api.example.json` holds a request/response pair for every tool, success and error. Stream E routes to these in development; Stream G uses them as expected outputs; Stream F uses the success bodies to shape optimistic patches.

## Changelog

| Date | Change |
|---|---|
| 2026-09-15 | Initial freeze. |
