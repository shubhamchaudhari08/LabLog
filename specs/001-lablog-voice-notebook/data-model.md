# Phase 1 — Data Model

**Feature**: 001-lablog-voice-notebook · **Owner**: Stream A (schema) · **Consumers**: Streams C, F, G

This is the frozen contract for the database. Stream A implements it; Streams C, F and G code against it without reading `supabase/`.

---

## Entity overview

```
  protocols ──1:N──► experiments ──1:N──► samples
                          │  │  │  │           ▲
                          │  │  │  └──1:N──► measurements ──self──► measurements (superseded_by)
                          │  │  └─────1:N──► observations ─────────┘ (sample_id)
                          │  └────────1:N──► deviations
                          └───────────1:N──► events   (append-only, never updated or deleted)
```

Seven tables. Protocol steps are embedded as JSONB rather than given their own table — for a fixed, seeded, six-step protocol a steps table buys normalisation nobody needs and costs a join on the hottest read path.

---

## `protocols`

The authority on what "next" means. Never generated, only read (FR-007).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `protocol_code` | text NOT NULL | e.g. `STAB` |
| `name` | text NOT NULL | |
| `version` | text | e.g. `v1` |
| `steps` | jsonb NOT NULL default `'[]'` | ordered array, see below |
| `owner_id` | uuid → `auth.users` | nullable = shared/library protocol |
| `created_at` | timestamptz NOT NULL default `now()` | |

### `steps` element shape

```json
{
  "index": 1,
  "id": "initial_temp",
  "name": "Record initial temperature",
  "required_fields": ["sample_id", "temperature"],
  "default_unit": { "temperature": "C" }
}
```

- `index` — zero-based, must equal the array position. Stream A asserts this in the seed.
- `required_fields` — drives `check_experiment_completeness`. A `measurement_type` name here (e.g. `"temperature"`) means: a non-superseded measurement of that type must exist **for every active sample** in the experiment. `"sample_id"` is a marker that the requirement is per-sample rather than per-experiment.
- `default_unit` — maps measurement type → unit, used to resolve an omitted unit before falling back to `UNIT_REQUIRED` (FR-014).

**Invariant**: `steps` is immutable once an experiment references the protocol. Nothing in the MVP writes to it.

---

## `experiments`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `experiment_code` | text NOT NULL **UNIQUE** | e.g. `STAB-104` |
| `name` | text NOT NULL | |
| `description` | text | |
| `protocol_id` | uuid → `protocols` | |
| `owner_id` | uuid NOT NULL → `auth.users` | **the authorisation anchor** (R-006) |
| `status` | text NOT NULL default `'DRAFT'` | CHECK in the enum below |
| `current_step_index` | int NOT NULL default `0` | |
| `started_at`, `completed_at` | timestamptz | server-set only |
| `created_at`, `updated_at` | timestamptz NOT NULL default `now()` | `updated_at` maintained by trigger |

### Status state machine

```
DRAFT ──► READY ──► RUNNING ──► COMPLETED
                      │  ▲
                      │  └── PAUSED
                      └─────► CANCELLED
```

**Enforced transitions (MVP)**: only `RUNNING → COMPLETED`, by `complete_experiment`, and only when the completeness check passes **and** the caller confirmed (FR-010). Every other transition is seeded, not performed. The demo experiment is seeded `RUNNING`.

**Mutation guard**: every write handler rejects unless `status = 'RUNNING'` (FR-015), with error `EXPERIMENT_NOT_RUNNING`.

### `current_step_index`

Bounded to `[0, len(protocol.steps) - 1]`. `complete_protocol_step` advances by one and clamps at the last step rather than erroring — the final step is a terminal position, not an error condition.

---

## `samples`

The resolution target for spoken sample identifiers — the highest-risk entity in the system (A5).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `experiment_id` | uuid NOT NULL → `experiments` ON DELETE CASCADE | |
| `sample_code` | text NOT NULL | e.g. `A17`, `CONTROL-01` |
| `name` | text | |
| `sample_type` | text default `'experimental'` | `experimental` \| `control` |
| `status` | text default `'active'` | `active` \| `consumed` |
| `metadata` | jsonb default `'{}'` | |
| `created_at` | timestamptz NOT NULL default `now()` | |
| | | **UNIQUE (`experiment_id`, `sample_code`)** |

### Resolution rule (owned by Stream C, `normalize.py`)

A spoken code resolves in this order, and the first hit wins:

1. Exact match on `sample_code`.
2. **Normalised** match — both sides casefolded, all non-alphanumerics stripped: `"control one"` → `controlone`, `CONTROL-01` → `control01`. Spelled-out digits zero–twenty are mapped to digits first, and a leading zero is tried both with and without (`control1` ≈ `control01`).
3. No match → `SAMPLE_NOT_FOUND`, **with the experiment's valid codes in the payload** so the agent can suggest rather than apologise (FR-013).

The normalisation table is built per experiment at request time from that experiment's sample list. It is never a global dictionary — `A1` might be a valid code in one experiment and a mishearing of `A17` in another, and only the experiment's own sample set can tell them apart.

**Ambiguity**: if normalisation matches more than one sample, that is `SAMPLE_AMBIGUOUS`, not a coin flip (FR-016, FR-017).

---

## `measurements`

The central record. Append-only in effect: corrections add rows and mark the old one superseded; nothing is ever updated except `superseded_by`, and nothing is ever deleted (FR-004).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `experiment_id` | uuid NOT NULL → `experiments` ON DELETE CASCADE | |
| `sample_id` | uuid → `samples` | |
| `measurement_type` | text NOT NULL | see vocabulary below |
| `value` | numeric NOT NULL | must be finite |
| `unit` | text | resolved, never raw speech |
| `raw_spoken_value` | text | verbatim utterance — provenance, and the audit story |
| `protocol_step_index` | int | stamped from `experiment.current_step_index` at write time |
| `superseded_by` | uuid → `measurements` | self-reference; NULL = current |
| `correction_reason` | text | set on the *new* row of a correction |
| `created_by` | uuid → `auth.users` | |
| `recorded_at` | timestamptz NOT NULL default `now()` | **server-generated, never accepted as an argument (FR-006)** |

### Correction semantics

`correct_measurement` performs, in one transaction:

1. Find the latest row for (`experiment_id`, `sample_id`, `measurement_type`) where `superseded_by IS NULL`. None → `MEASUREMENT_NOT_FOUND` (never create a first record via a correction).
2. Insert a **new** row with the new value, `correction_reason` set, same type/unit/sample, fresh server timestamp.
3. Set the original's `superseded_by` to the new row's id.
4. Write a `MEASUREMENT_CORRECTED` event carrying both values.

**Invariant**: for any (`sample_id`, `measurement_type`) at most one row has `superseded_by IS NULL`. The supersession chain is linear — a correction of a correction supersedes only the most recent row.

**The "current values" read** is therefore `... WHERE superseded_by IS NULL`, and the correction badge in the UI is `EXISTS (SELECT 1 FROM measurements m2 WHERE m2.superseded_by = ...)` — or more cheaply, the presence of `correction_reason` on the current row.

### Measurement type vocabulary

`temperature`, `mass`, `volume`, `pH`, `concentration`, `duration`, `rpm`, `voltage`, `current`, `pressure`, `humidity`, plus free-form numeric types. Declared as a JSON Schema `enum` **with an open fallback** in the tool argument model (R-010) — a closed enum would make the agent silently coerce an unlisted type into a listed one, which is a data-corruption failure disguised as a validation success.

### Units

Stored as given or as resolved from the protocol default. **No unit conversion is performed** — it is explicitly out of scope, and a partial conversion library is worse than none because it converts the cases it knows and silently mislabels the rest.

---

## `observations`

Free text. Never coerced to numeric (FR-002).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `experiment_id` | uuid NOT NULL → `experiments` ON DELETE CASCADE | |
| `sample_id` | uuid → `samples` | nullable — an observation may be about the run, not a sample |
| `observation` | text NOT NULL | non-empty after trimming |
| `protocol_step_index` | int | stamped at write time |
| `created_by` | uuid → `auth.users` | |
| `recorded_at` | timestamptz NOT NULL default `now()` | server-generated |

No supersession — observations are amended by adding another observation.

---

## `deviations`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `experiment_id` | uuid NOT NULL → `experiments` ON DELETE CASCADE | |
| `protocol_step_index` | int | |
| `type` | text | `timing` \| `procedure` \| `other` |
| `description` | text NOT NULL | |
| `reason` | text | |
| `severity` | text default `'medium'` | `low` \| `medium` \| `high` |
| `status` | text default `'open'` | `open` \| `resolved` |
| `created_at`, `resolved_at` | timestamptz | |

Resolution is out of MVP scope — `status` stays `open` and `resolved_at` stays NULL. The columns exist so the model does not need migrating later.

---

## `events` — the append-only audit trail

Written on **every** mutation, by every handler, without exception (FR-005, G7). Never updated, never deleted.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `experiment_id` | uuid → `experiments` ON DELETE CASCADE | NOT NULL until migration `0002`; null for protocol-level events (`PROTOCOL_CREATED`, specs/002) |
| `event_type` | text NOT NULL | see below |
| `entity_type` | text | `measurement` \| `observation` \| `deviation` \| `experiment` |
| `entity_id` | uuid | |
| `payload` | jsonb | the change, including before/after for corrections |
| `actor_id` | uuid → `auth.users` | |
| `voice_session_id` | text | the AssemblyAI `session_id` — ties a record to the conversation that produced it |
| `created_at` | timestamptz NOT NULL default `now()` | |

### Event types

`MEASUREMENT_CREATED` · `MEASUREMENT_CORRECTED` · `OBSERVATION_CREATED` · `DEVIATION_CREATED` · `PROTOCOL_STEP_COMPLETED` · `EXPERIMENT_COMPLETED` · `PROTOCOL_CREATED` (experiment_id null for protocol-level events; specs/002)

**Invariant that must hold at all times**: every row in `measurements`, `observations` and `deviations` has at least one corresponding `events` row. This is directly assertable (SC-008) and is the strongest single check that no write path bypasses the dispatcher.

`voice_session_id` is what makes the audit trail interesting rather than merely present — it links a stored value back to the specific spoken session, and combined with `raw_spoken_value` it reconstructs *what was said* alongside *what was stored*.

---

## Row-level security

Enabled on all seven tables, owner-scoped. `experiments` gates on `owner_id = auth.uid()` directly; the five child tables gate through an `EXISTS` against their parent experiment; `protocols` is readable when owned or when `owner_id IS NULL` (library protocols); `events` is `SELECT`-only for the browser.

**Critical, and the single most important line in this document**: the backend uses the **service role key, which bypasses row-level security entirely**. Row-level security protects the browser's direct reads and change subscriptions. It protects **nothing** on the backend write path. The explicit `experiment.owner_id == user.id` check in the dispatcher is the only thing standing there (R-006, A4).

---

## Validation rules (Stream C must enforce all of these)

| # | Rule | Error code |
|---|---|---|
| V1 | Caller owns the target experiment | `FORBIDDEN` (HTTP 403) |
| V2 | Experiment status is `RUNNING` for any mutation | `EXPERIMENT_NOT_RUNNING` |
| V3 | `sample_code` resolves to exactly one sample in this experiment | `SAMPLE_NOT_FOUND` / `SAMPLE_AMBIGUOUS` |
| V4 | `value` is a finite number (reject NaN and ±Infinity, which pass a float type check) | `INVALID_VALUE` |
| V5 | Unit resolves from the argument or the protocol step default | `UNIT_REQUIRED` |
| V6 | Correction targets an existing non-superseded measurement | `MEASUREMENT_NOT_FOUND` |
| V7 | No argument may supply a timestamp; the server generates all times | *structural* — no argument model declares one |
| V8 | `complete_experiment` requires `confirmed = true` **and** a passing completeness check | `NEEDS_CONFIRMATION` / `INCOMPLETE` |
| V9 | `current_step_index` stays within the protocol's bounds | *clamped, not an error* |
| V10 | Observation text is non-empty after trimming | `INVALID_ARGS` |

V4 deserves its own line because it is the one that gets missed: Pydantic accepts `float('nan')` as a valid `float`, and `numeric` accepts `NaN` in Postgres. A NaN measurement is silently poisonous — it displays, it stores, and it breaks every aggregate downstream.

---

## Seed data (Stream A)

Protocol `STAB` / "Sample Stability Evaluation" v1, six steps as specified in the source brief §6.

One **RUNNING** experiment `STAB-104` with samples `A17`, `A18`, `CONTROL-01` (`CONTROL-01` typed `control`), at `current_step_index = 1`.

Three **COMPLETED** historical experiments `STAB-100`, `STAB-101`, `STAB-102`, each with samples and a plausible spread of measurements, so aggregate views and comparisons have real data behind them.

### ⚠️ Two defects in the source brief's seed SQL, to be fixed by Stream A

1. **`'00000000-0000-0000-0000-0000000000p1'` is not a valid UUID** — `p` is not a hexadecimal digit, and Postgres rejects the insert. Use `…-000000000001`, or `gen_random_uuid()` with the value captured in a CTE.
2. **`owner_id` is left as a placeholder.** The seed must resolve the demo user's id at run time (`SELECT id FROM auth.users WHERE email = …`) rather than hard-coding one, or the seed is not reproducible on a fresh project — which the submission requires it to be.

---

## Indexes

Beyond the primary keys and the unique constraint on (`experiment_id`, `sample_code`):

```sql
create index on measurements (experiment_id, sample_id, measurement_type)
  where superseded_by is null;                  -- the current-values read, on the hot path
create index on measurements  (experiment_id, recorded_at desc);
create index on observations  (experiment_id, recorded_at desc);
create index on deviations    (experiment_id, created_at desc);
create index on events        (experiment_id, created_at desc);
```

The partial index matters more than it looks: resolving the current value for a sample/type is inside the spoken turn for both `record_measurement` (duplicate detection) and `correct_measurement` (finding the target), and it is the latency the user perceives as the agent hesitating.
