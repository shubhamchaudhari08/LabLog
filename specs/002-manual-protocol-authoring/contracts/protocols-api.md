# Contract: POST /protocols

Creates one protocol owned by the caller. Owned by the api stream. The web app calls it through `web/lib/api.ts`.

## Request

`Authorization: Bearer <supabase access token>` (required)

```json
{
  "protocol_code": "PCR-02",
  "name": "Colony PCR screen",
  "version": "v1",
  "steps": [
    { "name": "Record initial temperature", "readings": [{ "type": "temperature", "unit": "C" }] },
    { "name": "Add master mix", "readings": [{ "type": "volume", "unit": "mL" }] },
    { "name": "Load thermocycler", "readings": [] }
  ]
}
```

- `version` is optional and defaults to `"v1"`. `readings` is optional and defaults to `[]`. `unit` is optional.
- Unknown fields are **ignored**, including `index`, `id`, `owner_id` and `created_at` (FR-105). The model uses `extra="ignore"`.
- Limits: steps 1–200, name 1–200, readings ≤ 20 per step (research R-107).

## Responses

Failures use the envelope from `/tools` (001 contracts/tools-api.md), so the web app parses both the same way. Validation failures are returned as HTTP 200 with `success:false`, and only auth failures are non-2xx.

| HTTP | Body | When |
|------|------|------|
| 200 | `{"success": true, "protocol": <stored row>}` | created. `protocol` is the row the insert returned. |
| 200 | `{"success": false, "error": "INVALID_ARGS", "message": "...", "detail": {"errors": [...]}}` | structural or blank-field failure |
| 200 | `{"success": false, "error": "PROTOCOL_CODE_TAKEN", "message": "PCR-02 is already used by \"...\"."}` | duplicate code |
| 200 | `{"success": false, "error": "INVALID_UNIT", "message": "pH is recorded in pH, not C.", "detail": {"step_index": 1, "type": "pH", "allowed": ["pH"]}}` | bad unit |
| 401 | — | missing or invalid token |

## Guarantees

1. No row is written in `protocols` or `events` unless the response is `success:true`.
2. On success, exactly one `protocols` row and one `PROTOCOL_CREATED` event are written.
3. The stored `steps[i].index == i` for every i.
4. The web app invalidates the `['protocols']` query and navigates to `/protocols?id=<protocol.id>`.

## Example stored `steps` for the request above

```json
[
  {"index":0,"id":"step_1","name":"Record initial temperature","required_fields":["sample_id","temperature"],"default_unit":{"temperature":"C"}},
  {"index":1,"id":"step_2","name":"Add master mix","required_fields":["sample_id","volume"],"default_unit":{"volume":"mL"}},
  {"index":2,"id":"step_3","name":"Load thermocycler","required_fields":[]}
]
```

---

## Changelog

**2026-09-26: `PUT /protocols/{id}` and `DELETE /protocols/{id}` added (owner request: "edit/delete only by the user who created it").**

- **PUT** takes the same body and validation as POST (`INVALID_ARGS`, `INVALID_UNIT`, `PROTOCOL_CODE_TAKEN`; the protocol's own code does not count as taken). It replaces `protocol_code`, `name`, `version` and `steps`. `owner_id` and `created_at` never change. It returns `{"success": true, "protocol": <stored row>}`.
- **DELETE** returns `{"success": true, "deleted": "<id>"}`.
- Both routes:
  - return **404** for a missing or malformed id
  - return **403 `NOT_PROTOCOL_OWNER`** unless `owner_id == caller`. Library protocols (`owner_id` null) are therefore never editable.
  - return **`PROTOCOL_IN_USE`** (HTTP 200, `detail.experiments` lists the codes) when any experiment references the protocol. Its steps are the procedure those runs were recorded against.
- Every change is audited, and every refusal writes nothing:
  - `PROTOCOL_UPDATED` carries `{before, after}` full definitions.
  - `PROTOCOL_DELETED` carries the full deleted definition.
- The web app shows Edit and Delete only to the creator, and only while the protocol is unused. Edit reuses the create form at `/protocols/new?edit=<id>`.
