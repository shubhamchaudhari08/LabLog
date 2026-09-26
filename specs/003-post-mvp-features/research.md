# Research: Post-MVP Product Features

Numbering continues from 001 (R-001…R-013) and 002 (R-101…R-107). Phase R's inventory is in [`docs/RECONCILE.md`](../../docs/RECONCILE.md). This file records only the decisions that follow from it.

---

## R-201: Tool budget: session profiles instead of one flat tool set ⚠️ REQUIRES CONSTITUTION AMENDMENT A-1

**Problem**: The constitution caps the tool set at 10 (R-010: selection accuracy degrades past about ten). The registry already has 11, and Phases C–E add 6 more, for a total of 17.

**Decision**: Keep one registry, which stays the single source of truth. Expose a **profile**, a named subset chosen by the backend from stored state. The profile changes live through `session.update` (R-202).

| Profile | When | Tools | Count |
|---|---|---|---|
| `desk` | No experiment bound | `list_protocols`, `search_experiments`, `create_experiment`, `associate_protocol`, `start_experiment` | 5 |
| `setup` | Bound, status DRAFT or READY | `get_active_experiment`, `list_protocols`, `associate_protocol`, `start_experiment`, `write_protocol_step`, `get_next_protocol_step` | 6 |
| `bench` | Bound, any other status | the 11 existing tools + `compare_with_previous_run` | 12 |

`bench` preserves today's tool set exactly (PROTECTED P-1). A DRAFT experiment today gets all 11 tools, but every mutating one is refused by the dispatcher's RUNNING gate. `setup` therefore removes only calls that could never succeed, plus `get_sample_history` and `check_experiment_completeness`, which are meaningless before a run. `write_protocol_step` stays in `setup`, so the protected "new protocol and start" path is unchanged.

**The dispatcher does not gate on profile.** A stale configuration may call a tool outside its profile. The handler's own state checks (for example, `start_experiment` requires READY) remain the guarantee, and profiles only steer selection. This keeps one validation path (Principle I).

**Amendment A-1 (proposed text)**, replacing "The tool set MUST NOT exceed ten tools; adding one requires displacing another.":
> No single session configuration may expose more than twelve tools. A tool set may be split into state-scoped profiles drawn from one registry. Raising any profile's size requires an eval run showing that profile's tool-selection accuracy is no lower than the prior baseline on the same model.

This is a MINOR version bump (1.0.0 → 1.1.0), since the guidance is materially changed but no principle is removed. The 12 in `bench` is one above the current de-facto 11. **Fallback** if the `bench` accuracy gate fails: fold `compare_with_previous_run` into `get_sample_history` as an optional `compare_previous: bool`, which returns `bench` to 11.

**Alternatives rejected**:
- *One `manage_experiment(action=…)` tool*: hides three confirmation semantics behind one enum. The eval showed argument-mode tools are where selection errors cluster (the `write_protocol_step` note in `models.py` says it's the odd one out).
- *Removing existing tools*: violates the additive rule.
- *Separate registries per profile*: two sources of truth for the same tool.

---

## R-202: Mid-session `session.update` field mutability (verified 2026-09-25)

**Source**: https://www.assemblyai.com/docs/voice-agents/voice-agent-api/session-configuration

| Field | After `session.ready` |
|---|---|
| `system_prompt` | **Mutable**. "Send a new prompt at any time to change the agent's behavior on the next turn." |
| `input.keyterms` | **Mutable**. "Replace the keyterms list at any time. The new list takes effect on the next user utterance." The limit is 100. |
| `tools` | **Accepted**. The docs say they are "accepted in subsequent session.update messages and don't raise immutable_field", but the wording is not explicit about effect. |
| `greeting` | **Immutable**. Raises `immutable_field`. |
| `output.voice` | **Immutable**. Raises `immutable_field`. |

**Decision**: Refresh payloads carry exactly `system_prompt`, `input.keyterms` and `tools`. They never carry `greeting`, `output` or `input.format` / `turn_detection`. Desk mode uses the same voice as bench (`anna`), so a rebind never needs a voice change.

**Open, empirical (first task of Phase C, T-C0)**: prove that a mid-session `tools` swap takes effect. Open a desk session, send a bench-profile `session.update`, then ask for something only a bench tool can do. If tools turn out not to be swappable, the fallback is to send the **union** of `setup`+`bench` (15 tools) to bound sessions, and that fails A-1. The other fallback is to reconnect on rebind using `session.resume`, which loses the zero-reconnect claim of SC-204. **Escalate to the owner if T-C0 fails**. The contract must be amended before code is built (Principle IV).

---

## R-203: Eval run persistence: committed JSON files, not an `eval_runs` table

**Decision**: `api/eval/run.py` writes `api/eval/runs/<UTC yyyymmddTHHMMSSZ>_<sha>.json` (full record, immutable, committed). It then regenerates two derived files:
- `web/public/metrics.json`: the latest run, in the unchanged 001 contract shape, **plus** a `details[]` array (additive).
- `web/public/eval-history.json`: a summary per run, oldest first, for the trend.

**Rationale**: This extends the existing pipeline (the plan says to adapt to the code). A global `eval_runs` table has no owner, and Principle III requires owner-scoped RLS on every table. Committed files are also more reproducible than rows: `git log api/eval/runs/` is the audit trail, and the page works in guest mode without a query.

**Alternatives rejected**: an `eval_runs` table with `owner_id` pinned to the demo account ties a quality artifact to an auth user. A service-only table gives the browser no read path without a new endpoint.

---

## R-204: Experiment-less dispatch and reference resolution

**Decision**: `ToolCall.experiment_id` becomes optional. Each registry entry gains a `scope`:
- `experiment`: the existing tools and `compare_with_previous_run`. These require `experiment_id`, and the current flow is unchanged.
- `experiment_ref`: `associate_protocol` and `start_experiment`. The dispatcher resolves the target **before dispatch**. It uses `args.experiment_ref` if given, else the bound `experiment_id`, else it returns `EXPERIMENT_REQUIRED`. Resolution queries **only rows with `owner_id = user.id`**, so another user's code resolves to `EXPERIMENT_NOT_FOUND` and never to 403, which avoids an existence oracle. The explicit `owner_id == user.id` check still runs on the loaded row (Principle I, step 5).
- `user`: `list_protocols`, `search_experiments` and `create_experiment`. The handler receives `user_id` and no experiment. Every query it makes is filtered by `owner_id = user_id`, or by `owner_id is null` for library protocols.

The RUNNING gate (`MUTATING_TOOLS`) is unchanged and still applies only to `experiment`-scope tools.

---

## R-205: Server-generated experiment codes

**Decision**: The prefix is the protocol's `protocol_code` uppercased, or `EXP` if there is no protocol. The number is 1 + the max numeric suffix among **all** experiments whose code matches `^<PREFIX>-\d+$`, because `experiment_code` is globally unique. Insert, and on a unique violation recompute and retry up to 3 times, then return `CODE_UNAVAILABLE`. With the seed, the next STAB code is `STAB-105`.

**Rationale**: It matches the seeded convention a scientist already reads, and it is deterministic enough to state in the confirmation. It is not reserved before confirmation. The agent says "a new STAB experiment", and the stored code is read back after the write (Principle I: report stored values).

---

## R-206: Lifecycle and confirmation

- `create_experiment(confirmed=false)` returns `NEEDS_CONFIRMATION` with the resolved protocol name and sample list, and writes nothing. Any protocol resolution error is returned **before** asking for confirmation.
- The name must be 1–200 characters. There is no uniqueness requirement on name, only on code.
- `associate_protocol` is allowed for DRAFT and READY. It moves DRAFT→READY, and READY stays READY (re-association). Any other status returns `EXPERIMENT_ALREADY_STARTED`.
- `start_experiment` returns `NEEDS_CONFIRMATION` if `confirmed` is false, and `NO_PROTOCOL` if the experiment has no protocol. It returns `INVALID_STATE` unless the experiment is READY. On success it sets `started_at=now()` and `current_step_index=0`.
- Protocol resolution order: exact `protocol_code` (case-insensitive), then exact name, then `name + version` ("enzyme stability v2"). More than one hit returns `AMBIGUOUS_PROTOCOL` with candidates. No hit returns `PROTOCOL_NOT_FOUND` with up to 5 readable protocols as alternatives.
- The existing `write_protocol_step(new_protocol=true)` DRAFT→RUNNING path is untouched.

---

## R-207: Previous-run comparison arithmetic

**Decision**: Use `decimal.Decimal(str(value))` for both values. `delta = current − previous`, rounded half-even to the larger number of decimal places in the two stored values. `pct = delta / |previous| × 100`, rounded to 1 decimal place, or `null` when previous = 0. The result returns the rounded numbers and the units. **Units must match exactly.** If they differ, the tool returns `UNIT_MISMATCH`, because nothing converts units (a spec 001 non-goal).

**Defaults**: If `measurement_type` is omitted, use the type of the latest current measurement in this experiment, optionally restricted to `sample_ref`. If `sample_ref` is omitted, use the sample of that same latest measurement. If there is no measurement at all, return `NO_CORRESPONDING_MEASUREMENT`.

**Index**: `experiments (protocol_id, owner_id, status, completed_at desc)`. The existing `measurements_current_idx` covers the sample and type lookup.

**Seed check**: STAB-102 is the most recent completed run. Its latest current A17 temperature is 4.6 C (the second reading, step 3). With 4.3 recorded on STAB-104, the result is delta −0.3 and pct −6.5.

---

## R-208: Search without model-authored queries

**Decision**: `api/app/search.py: search_experiments(sb, user_id, filters, tz) -> list[Row]` builds PostgREST filters with typed parameters only. The steps:
1. Start from `experiments` filtered by `owner_id`.
2. `status` must be an enum. `protocol_ref` is resolved via R-206 to `protocol_id`.
3. `date_range` becomes `[start, end)` in `tz`, compared on `created_at`.
4. `has_deviations`, `contains_sample` and `measurement_type` each become one sub-query returning an `experiment_id` set, which is intersected in Python.
5. `free_text` becomes an `ilike` on code, name and description, with `%` and `_` escaped.

The result is capped at 25 rows, newest first, and includes `deviation_count`. This is fine at demo scale. A Postgres function is the upgrade path if it grows.

**Time zone**: The browser sends `Intl.DateTimeFormat().resolvedOptions().timeZone` as a `tz` field **on the `/tools` envelope**, never in tool args, so the model cannot set it. It is validated with `zoneinfo.ZoneInfo`, and on failure the server uses UTC and reports `tz_used`. Weeks start on Monday. `this_month` starts on the 1st.

**Shared endpoint**: `GET /experiments/search?…` calls the same function, so History's server-side filters and the voice tool cannot diverge (FR-241).

---

## R-209: Adding samples (unblocks C and F)

**Decision**: Add `POST /experiments/{id}/samples` with body `{sample_code, name?, sample_type?}`. It is a router in the style of `POST /protocols` (002 R-101): authenticate, load the experiment, check ownership explicitly, reject COMPLETED and CANCELLED, validate the code pattern `^[A-Za-z0-9][A-Za-z0-9-]{0,31}$` (uppercased), reject duplicates with `SAMPLE_EXISTS`, insert, audit `SAMPLE_CREATED`, then return the stored row. `create_experiment.sample_codes` reuses the same validation function. **There is no voice tool for it**, because that would spend a tool slot (R-201).

---

## R-210: Read-only Detail

**Decision**: Add the new route `/experiments/[id]`. It composes `SampleBoard`, `Ledger`, `Timeline` and `ProtocolSteps` with a `readOnly` prop, which defaults to `false`, so existing callers are unchanged. In read-only mode each panel hides its mutation affordances, and the page does not mount `VoiceDock` or call `bind`. History rows link to `/experiments/[id]` for terminal states and to `/dashboard/experiments/[id]` for DRAFT, READY and RUNNING. The workspace route is untouched (P-7).

---

## R-211: Home stats: client-side counts under RLS, no view

**Decision**: Use browser Supabase `count: 'exact', head: true` queries (RLS applies) for each stat. **No `v_experiment_stats` view**: a plain Postgres view runs with its owner's privileges and bypasses RLS unless created `with (security_invoker = true)`. That is a footgun for a table-per-owner model, and it buys nothing at this scale. "Voice-recorded events" means events with non-null `voice_session_id`, read under `evt_by_owner`.

---

## R-212: Measuring the Phase F lift honestly

**Finding**: Keyterms bias **speech recognition**. The text-level eval never touches speech recognition, so it cannot measure keyterm lift. Claiming otherwise would violate Principle V.

**Decision**: Split Phase F's done-definition:
- **F-must**: prove the refresh without reconnect (SC-207) with a scripted browser session and the `session.updated` event. Add text-level scenarios where a sample that is absent from the prompt is rejected, and the same sample, once present, is resolved. This measures the prompt-context half.
- **F-stretch** (shared with the A audio stretch): an audio harness that synthesises the utterances and streams them through AssemblyAI streaming STT with and without the keyterm list. It reports sample-code accuracy both ways. The TTS source is **NEEDS VERIFICATION at task time**, and the harness is not built until that is resolved. Until it runs, the UI shows no lift figure.

---

## R-213: Refresh config endpoint

**Decision**: `GET /voice/session-config?experiment_id=` (with `experiment_id` optional) returns `{profile, session: {system_prompt, input: {keyterms}, tools}}`. It authorizes exactly like bootstrap and **mints no token**. `GET /voice/bootstrap` also makes `experiment_id` optional; without it, the backend builds the desk prompt and profile. Both endpoints use one `build_session(ctx | None)` function, so bootstrap and refresh cannot drift (Principle IV).

## Sources

- AssemblyAI session configuration (fetched 2026-09-25): https://www.assemblyai.com/docs/voice-agents/voice-agent-api/session-configuration
- Postgres views and RLS (`security_invoker`, PG15+): https://www.postgresql.org/docs/current/sql-createview.html
