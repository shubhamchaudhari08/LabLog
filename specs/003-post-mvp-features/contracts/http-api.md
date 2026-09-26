# Contract: New HTTP endpoints (non-tool)

**Status**: DRAFT · **Style**: the same as 002 `protocols-api.md`. Request models use `extra="ignore"`, so server-owned fields sent by a browser are dropped, not honoured. Tool-level failures are HTTP 200 `{success:false,…}`, and auth failures are 401/403/404.

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
