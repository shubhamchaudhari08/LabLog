# Contract: New HTTP endpoints (non-tool)

**Status**: DRAFT · **Style**: the same as 002 `protocols-api.md`. Request models use `extra="ignore"`, so server-owned fields sent by a browser are dropped, not honoured. Tool-level failures are HTTP 200 `{success:false,…}`, and auth failures are 401/403/404.

## `POST /experiments`: quick create (FR-214)

Request: `{ "name": "Enzyme Stability Trial 12", "description"?: "…", "protocol_id"?: "<uuid>", "sample_codes"?: ["A1","A2"], "start"?: true }`

Sequence:
1. Verify the JWT.
2. Validate structurally. `name` is 1–200 characters after trim, `description` is ≤2000 characters, and `sample_codes` has ≤50 entries. Otherwise return `INVALID_ARGS`.
3. If `protocol_id` is given, it must be a protocol the caller can read (`owner_id = user` or `owner_id is null`), else `PROTOCOL_NOT_FOUND`.
4. Each sample code is uppercased and must match `^[A-Za-z0-9][A-Za-z0-9-]{0,31}$`, else `INVALID_SAMPLE_CODE`. Duplicates after normalisation return `DUPLICATE_SAMPLE_CODE`.
5. `start: true` without a protocol returns `NO_PROTOCOL`.
6. Generate the code per research R-205 and insert the experiment: DRAFT without a protocol, READY with one.
7. Insert the samples.
8. Write the `EXPERIMENT_CREATED` event, then one `SAMPLE_CREATED` per sample (`source: "ui"`).
9. If `start` is set, run the `POST /experiments/{id}/start` sequence.
10. Return `{success:true, experiment:<stored row>, samples:[…]}`.

Every check runs before the first insert. Unknown body keys (`owner_id`, `status`, `experiment_code`, `created_at`, `started_at`) are ignored.

## `POST /experiments/{experiment_id}/start`

Sequence:
1. Verify the JWT.
2. Load the experiment, returning **404** if it is missing.
3. Check `owner_id == user.id`, else **403**.
4. `NO_PROTOCOL` if `protocol_id` is null.
5. `INVALID_STATE` (detail `status`) unless the status is READY.
6. Write `status=RUNNING`, `started_at=now()` and `current_step_index=0`.
7. Write the `EXPERIMENT_STARTED` event.
8. Return `{success:true, experiment:<stored row>}`.

The click on **Start** is the confirmation gate. The voice tool `start_experiment` (US3) will reuse the same function behind a `confirmed` flag.

## `POST /experiments/{experiment_id}/samples`

Request: `{ "sample_code": "B3", "name": "Aliquot B3"?, "sample_type": "experimental" | "control"? }`

Sequence:
1. Verify the JWT.
2. Load the experiment (**404** if missing).
3. Check `owner_id == user.id` (**403** otherwise).
4. Reject status COMPLETED or CANCELLED with `EXPERIMENT_CLOSED`.
5. Uppercase the code and match it against `^[A-Za-z0-9][A-Za-z0-9-]{0,31}$`, returning `INVALID_SAMPLE_CODE` if it fails.
6. Return `SAMPLE_EXISTS` for a duplicate within the experiment.
7. Insert.
8. Write the `SAMPLE_CREATED` event, with `source: "ui"`.
9. Return `{success:true, sample:<stored row>}`.

The validation function is shared with `create_experiment.sample_codes` (`api/app/samples.py`).

## `GET /experiments/search`

Query parameters mirror `SearchExperimentsArgs`: `protocol_ref`, `status`, `date_range`, `has_deviations`, `contains_sample`, `measurement_type`, `free_text`, and `tz`. It calls the **same** `search.search_experiments()` as the tool and returns the same `data` shape (`tools-api-v2.md` §`search_experiments`). Invalid enum values return `INVALID_ARGS`, the same as the tool.

## `GET /voice/session-config`

See [voice-session.md](voice-session.md) §2.
