# Contract: `POST /tools` v2 (additive amendment to 001 `tools-api.md`)

**Status**: DRAFT until amendment A-1 is approved, then FROZEN · **Amends**: `specs/001-lablog-voice-notebook/contracts/tools-api.md`

Everything in the 001 contract still holds: the envelope, HTTP-200 tool failures, the non-2xx table, and the 11 existing tools and their results. This document lists **only the changes**.

## Changelog

| Version | Change |
|---|---|
| v2 | `experiment_id` is optional. New optional envelope field `tz`. New dispatcher step 4a (reference resolution). Six new tools. |

---

## Envelope changes

```jsonc
{
  "tool": "create_experiment",
  "args": { "name": "Enzyme Stability Trial 12", "protocol_ref": "STAB", "confirmed": true },
  "experiment_id": null,              // now optional: null in desk mode
  "session_id": "sess_…",
  "tz": "America/Denver"              // NEW, optional, IANA name; browser-supplied, never model-supplied
}
```

`tz` is used **only** to bucket `date_range` in `search_experiments`. It is never used for stored timestamps. If it is invalid or missing, the server uses UTC.

## Dispatcher sequence (v2)

1. Verify the JWT and get the user id (**401** on failure). *Unchanged.*
2. Unknown tool: `UNKNOWN_TOOL`. *Unchanged.*
3. Validate against the Pydantic model: `INVALID_ARGS`. *Unchanged.*
4. By the registry `scope`:
   - `experiment`: `experiment_id` is required (a missing id returns `EXPERIMENT_REQUIRED`, HTTP 200). Load the experiment and return **404** if it is missing. *Otherwise unchanged.*
   - **4a.** `experiment_ref`: resolve from `args.experiment_ref` if present, else from `experiment_id`, **querying only `owner_id = user.id`**. Code matches exactly (case-insensitive), then name matches exactly. No hit returns `EXPERIMENT_NOT_FOUND` with up to 5 of the user's DRAFT or READY experiments as alternatives. More than one hit returns `AMBIGUOUS_EXPERIMENT` with the candidates.
   - `user`: no experiment is loaded. Skip to step 7.
5. `experiment.owner_id == user.id`, else **403**. Applies to `experiment` and `experiment_ref`. *Unchanged.*
6. Tool in `MUTATING_TOOLS` and status is not RUNNING: `EXPERIMENT_NOT_RUNNING`. *Unchanged. No new tool is in `MUTATING_TOOLS`.*
7. Dispatch `handler(sb=, experiment=<row or None>, user_id=, args=, session_id=, tz=)`. Existing handlers accept `**_` for `tz`, or receive it only if declared.

---

## New tools

Every result below is the `data` of `{success: true, data}`. Every error is `{success:false, error, message, detail?}`, and **writes nothing** (tests assert the row counts are unchanged).

### `list_protocols` · scope `user` · profiles desk, setup

Args: none.
Returns `{ protocols: [{protocol_code, name, version, step_count}] }`. This is every protocol with `owner_id = user` or `owner_id is null`, ordered by name. It is capped at 25 entries, and `truncated: true` is set when the cap is hit.

### `create_experiment` · scope `user` · profile desk

Args: `name`, `description?`, `protocol_ref?`, `sample_codes?`, `confirmed`.

Order of checks:
1. Resolve the protocol if given: `PROTOCOL_NOT_FOUND` (detail `alternatives[]`) or `AMBIGUOUS_PROTOCOL` (detail `candidates[]`).
2. Validate the sample codes: `INVALID_SAMPLE_CODE` (detail `code`, `pattern`) or `DUPLICATE_SAMPLE_CODE`.
3. `confirmed` is false: `NEEDS_CONFIRMATION`, with detail `{name, protocol, sample_codes}`.

Writes: the experiment (DRAFT, or READY with a protocol), then the samples, then `EXPERIMENT_CREATED` and one `SAMPLE_CREATED` per sample.
Returns `{ experiment_id, experiment_code, name, status, protocol: {protocol_code,name,version} | null, sample_codes, needs_protocol: bool }`.
Code collision after 3 retries: `CODE_UNAVAILABLE`.

### `associate_protocol` · scope `experiment_ref` · profiles desk, setup

Args: `experiment_ref?`, `protocol_ref`.
Errors: `PROTOCOL_NOT_FOUND`, `AMBIGUOUS_PROTOCOL`, and `EXPERIMENT_ALREADY_STARTED` (status is not DRAFT or READY).
Writes: `protocol_id`, then status DRAFT→READY, then `PROTOCOL_ASSOCIATED`.
Returns `{ experiment_id, experiment_code, status, protocol: {…} }`.

### `start_experiment` · scope `experiment_ref` · profiles desk, setup

Args: `experiment_ref?`, `confirmed`.
Errors, in order: `NO_PROTOCOL`, `INVALID_STATE` (status is not READY, detail `status`), then `NEEDS_CONFIRMATION`.
Writes: `status=RUNNING`, `started_at=now()`, `current_step_index=0`, then `EXPERIMENT_STARTED`.
Returns `{ experiment_id, experiment_code, status: "RUNNING", current_step: {index, name} | null, step_count }`.

### `compare_with_previous_run` · scope `experiment` · profile bench · read-only

Args: `sample_ref?`, `measurement_type?` (defaults per research R-207).
Errors: `NO_PREVIOUS_RUN`, `NO_CORRESPONDING_MEASUREMENT` (detail `{which: "current"|"previous", sample_code, measurement_type}`), `SAMPLE_NOT_FOUND` (existing resolver and alternatives), `UNIT_MISMATCH` (detail `{current_unit, previous_unit}`).
Returns:
```jsonc
{ "sample_code": "A17", "measurement_type": "temperature", "unit": "C",
  "current": 4.3, "previous": 4.6, "delta": -0.3, "pct": -6.5,
  "direction": "lower",                    // "higher" | "lower" | "same": so the agent never infers a sign
  "prev_experiment_code": "STAB-102" }
```

### `search_experiments` · scope `user` · profile desk · read-only

Args: see data-model §5. Every field is optional. With no filters, it returns the 25 most recent experiments.
Errors: `PROTOCOL_NOT_FOUND` / `AMBIGUOUS_PROTOCOL` (for `protocol_ref`).
Returns:
```jsonc
{ "results": [{ "experiment_code", "name", "protocol_code", "status", "created_at", "deviation_count" }],
  "count": 3, "truncated": false,
  "resolved": { "date_range": {"from": "2026-09-21T00:00:00-06:00", "to": "2026-09-28T00:00:00-06:00"}, "tz_used": "America/Denver" } }
```
`resolved` echoes the server's interpretation, so the agent speaks the server's dates and never computes its own.

---

## Registry additions (Pydantic → `_openai_fn` → schemas; never hand-written)

| Tool | Description (steers selection) |
|---|---|
| `list_protocols` | "List the protocols the user can run. Use when they ask what protocols exist or have not said which one to use." |
| `create_experiment` | "Create a new experiment. Ask which protocol if the user did not say. Call with confirmed false first, read back the summary, and call again with confirmed true only after they agree out loud." |
| `associate_protocol` | "Attach a protocol to an experiment that has not started." |
| `start_experiment` | "Start a READY experiment. Only after the user explicitly confirms out loud." |
| `compare_with_previous_run` | "Compare a sample's current value with the same sample in the previous completed run of this protocol. Speak ONLY the numbers returned; never calculate." |
| `search_experiments` | "Find the user's experiments by protocol, status, date range, deviations, sample, measurement type or text. Pass date ranges as the listed words; never compute dates." |
