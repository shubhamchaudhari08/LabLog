# Research: Manual Protocol Authoring

No external wire formats are involved. These are the decisions resolved from the codebase.

## R-101 Where the write happens

- **Decision**: A new FastAPI route `POST /protocols` in `api/app/routers/protocols.py`, using the service-role client, following the same sequence as the `/tools` dispatcher.
- **Rationale**: The `/tools` dispatcher requires an experiment and gates mutations on `RUNNING`. Protocol creation has neither. Browser writes under RLS would skip semantic validation and auditing.
- **Alternatives considered**: A `create_protocol` voice tool (rejected: needs a fake experiment, uses a tool slot, and lets the model create procedure). A Supabase RLS insert policy (rejected: no semantic checks and no event).

## R-102 Auditing an experiment-less mutation

- **Decision**: Migration `0002` runs `alter table events alter column experiment_id drop not null;`. The event is written with `event_type='PROTOCOL_CREATED'`, `entity_type='protocol'`, `entity_id=<protocol id>`, `actor_id=<user>`, and a payload containing the code, name and step count.
- **Rationale**: This is the smallest change that keeps Principle II true. The existing `evt_by_owner` RLS policy already hides rows with a null `experiment_id` from the browser, which is correct because no screen reads protocol events. The Ledger stays per experiment.
- **Alternatives considered**: A `protocol_events` table (a second audit trail). Adding a `protocol_id` column (not needed, because `entity_id` already carries it).

## R-103 Step shape and index assignment

- **Decision**: The request carries `steps: [{name, readings: [{type, unit?}]}]` in display order. The server derives `index = position`, `id = "step_{position+1}"`, `required_fields = ["sample_id", *types]` when there are readings (otherwise `[]`), and `default_unit = {type: unit}` for readings that have a unit.
- **Rationale**: This matches the stored shape the seed, `write_protocol_step` and the web `ProtocolSteps` component already use. Nothing downstream changes. The client cannot send an index or id, so gaps and duplicates are impossible.
- **Alternatives considered**: Sending the raw stored shape from the client (rejected: the client would own indexes and ids, against FR-105). A `protocol_steps` table (rejected: 001 data-model deliberately chose JSONB).

## R-104 Unit validation

- **Decision**: For a type listed by `vocabulary.lookup`, the unit must be one of its `units`. A dimensionless type (pH) with no unit gets its default. For an unlisted type the unit is optional and free text.
- **Rationale**: This reuses the single vocabulary declaration (Principle IV) and keeps the list open, as 001 does. It rejects "pH in C" without adding a unit-conversion system (a non-goal).

## R-105 Code uniqueness

- **Decision**: Reject with `PROTOCOL_CODE_TAKEN` when a protocol with the same code (compared case-insensitively) exists with `owner_id = user` or `owner_id is null`. This is enforced in application code, with no DB constraint.
- **Rationale**: Codes are what the agent and the list show. Two readable `PCR-01` rows would be ambiguous. A DB unique constraint across owner and null-owner does not express "readable by this user" cleanly, and existing `ADHOC-*` rows are not guaranteed unique.
- **Known ceiling**: Two concurrent saves with the same code can both pass the check. This is acceptable for single-user use. Add a partial unique index if that ever matters.

## R-106 The form (web)

- **Decision**: One client page at `web/app/(app)/protocols/new/page.tsx`. Its state is `{name, code, version, steps: StepDraft[]}` held in `useState`. Step keys come from `crypto.randomUUID()` so reordering keeps focus. Reordering uses Move up and Move down buttons. The reading picker is a `<datalist>` fed by `GET /settings/measurement-types`, with the unit as a `<select>` for listed types and a text input for unlisted ones. A native `beforeunload` guard protects a dirty draft. Save is disabled while a request is in flight.
- **Rationale**: There are no new dependencies, keyboard-accessible reorder is free, and native controls handle keyboard and screen-reader users.
- **Alternatives considered**: A drag-and-drop library (rejected: a new dependency and extra accessibility work for something buttons already do). A modal on the list page (rejected: long step lists need a full page, and a URL can be revisited).

## R-107 Step ceiling

- **Decision**: Accept 1–200 steps, 1–200 characters per name, and at most 20 readings per step.
- **Rationale**: "As many as they like" in practice. These are abuse guards on a JSONB column, not product limits.
