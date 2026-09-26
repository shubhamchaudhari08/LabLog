# Data Model: Manual Protocol Authoring

This feature uses no new tables. One constraint is relaxed.

## protocols (unchanged shape)

| Column | Set by | Rule |
|--------|--------|------|
| `id` | DB default | — |
| `protocol_code` | user | trimmed, 2–32 chars, `^[A-Za-z0-9][A-Za-z0-9._-]*$`; unique (case-insensitive) among the user's own protocols and library protocols (R-105) |
| `name` | user | trimmed, 1–200 chars |
| `version` | user | trimmed, 1–20 chars, default `v1` |
| `steps` | server, derived from the request | see below |
| `owner_id` | server | always the verified `user.id` |
| `created_at` | DB default | never from the request |

### Stored step (existing shape, and the only shape written)

```json
{ "index": 0, "id": "step_1", "name": "Record initial temperature",
  "required_fields": ["sample_id", "temperature"],
  "default_unit": { "temperature": "C" } }
```

The server derives this from a request step `{name, readings: [{type, unit?}]}`:

- `index` is the position in the submitted array. `id` is `step_{index+1}`.
- `required_fields` is `[]` when there are no readings. Otherwise it is `["sample_id", ...unique types in order]`.
- `default_unit` holds only the readings that have a unit. It is omitted when empty.
- Duplicate reading types within one step are collapsed to the first occurrence.

### Validation (all checked before any write)

| Rule | Error code |
|------|-----------|
| 0 steps or more than 200 steps, blank name, blank step name, bad code pattern | `INVALID_ARGS` (field path in `detail.errors`) |
| Code already readable by the user | `PROTOCOL_CODE_TAKEN` |
| A listed type with a unit not in `vocabulary` units | `INVALID_UNIT` (`detail.allowed`, `detail.step_index`) |

## events (one change)

- **Migration `0002_protocol_events.sql`**: `alter table events alter column experiment_id drop not null;`
- **New event type** `PROTOCOL_CREATED`: `experiment_id=null`, `entity_type='protocol'`, `entity_id=<protocols.id>`, `actor_id=<user>`, `payload={protocol_code, name, version, step_count}`.
- **Invariant check extended**: every owned, non-`ADHOC-*` protocol has a `PROTOCOL_CREATED` event. Voice-created `ADHOC-*` protocols are audited through their experiment's step events. The query is in [quickstart.md](quickstart.md) §3.

## State transitions

None. A created protocol is immediately readable and can be referenced by an experiment. Later changes to its steps go through the existing voice `write_protocol_step`, which already refuses shared protocols.
