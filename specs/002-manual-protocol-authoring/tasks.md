# Tasks: Manual Protocol Authoring

**Input**: Design documents from `/specs/002-manual-protocol-authoring/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/protocols-api.md](contracts/protocols-api.md), [quickstart.md](quickstart.md)

**Tests**: These are included. The Constitution (Development Workflow) requires that every rejected operation be tested for writing no rows, and quickstart §1 lists the cases. API tests use `FakeSupabase` from `api/tests/conftest.py`. The web app has no test runner, so web behaviour is checked through quickstart §2.

**Format**: `- [ ] [ID] [P?] [Story] Description`. `[P]` means the task touches a different file from others and has no pending dependency.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/0002_protocol_events.sql` containing only `alter table events alter column experiment_id drop not null;`, with a header comment citing research R-102. Principle II requires an event for every mutation, and a protocol created from the form has no experiment. No RLS change: `evt_by_owner` already hides null-experiment rows from the browser.

---

## Phase 2: Foundational (blocks all stories)

- [X] T002 [P] In `api/app/audit.py`, add `"PROTOCOL_CREATED"` to the `EventType` Literal and change `write_event`'s `experiment_id` parameter to `experiment_id: str | None`. The row dict is unchanged. Do not add a timestamp parameter.
- [X] T003 [P] In `api/app/tools/models.py`, add request models built on `pydantic.BaseModel` with `model_config = ConfigDict(extra="ignore")`, not `_Args`. The contract says unknown fields such as `index`, `id`, `owner_id` and `created_at` are **ignored**, not rejected (FR-105).
  - `ReadingIn`: `type: str` (strip whitespace, 1–40 chars); `unit: str | None` (strip whitespace, max 20 chars, empty → None).
  - `ProtocolStepIn`: `name: str` (strip whitespace, "1–200 chars"); `readings: list[ReadingIn] = []` ("at most 20 readings per step").
  - `CreateProtocolRequest`: `protocol_code: str`, stripped, "2–32 chars, `^[A-Za-z0-9][A-Za-z0-9._-]*$`"; `name: str`, stripped, "1–200 chars"; `version: str = "v1"`, stripped, "1–20 chars"; `steps: list[ProtocolStepIn]` with "1–200 steps".
  - Use `Annotated[str, StringConstraints(strip_whitespace=True, min_length=…, max_length=…)]` so a whitespace-only name fails as blank.
- [X] T004 Create `api/app/routers/protocols.py` with `router = APIRouter()`, plus a module docstring explaining why this is a second write route (plan.md Complexity Tracking). Copy the `_fail(error, message, **detail)` envelope from `api/app/routers/tools.py` as a local helper (success:false, HTTP 200). Register the router in `api/app/main.py` with `app.include_router(protocols.router)`, importing it alongside `health, settings, tools, voice`. Depends on T003.

**Checkpoint**: The migration exists, the models import, the router mounts, and `pytest -q` still passes.

---

## Phase 3: User Story 1: Create a protocol from the Protocols screen (P1) 🎯 MVP

**Goal**: A user fills name, code, version and steps (with optional readings and units), saves, and sees the protocol selected in the library exactly as entered.

**Independent test**: Create a 3-step protocol through the form. The stored row matches the contract example in [contracts/protocols-api.md](contracts/protocols-api.md), `owner_id` is the caller, and exactly one `PROTOCOL_CREATED` event exists.

### Tests for US1

- [X] T005 [US1] Create `api/tests/test_protocols.py`. Its `client` fixture follows `api/tests/test_api.py`:
  - set `SUPABASE_JWT_SECRET` to `JWT_SECRET`;
  - build a `FastAPI()` that includes `protocols_router.router`;
  - `monkeypatch.setattr(protocols_router, "supabase_admin", lambda: sb)`;
  - `auth()` uses `make_token(OWNER_ID)`.

  Write these tests:
  - (a) `test_requires_auth`: POST with no header returns 401.
  - (b) `test_creates_protocol_as_contract_example`: POST the contract request body; expect 200 and `success is True`. The stored `steps` equal the contract's example stored `steps` exactly, `owner_id == OWNER_ID`, and `response["protocol"]` is the stored row.
  - (c) `test_writes_one_protocol_created_event`: one new `events` row, with `event_type == "PROTOCOL_CREATED"`, `experiment_id is None`, `entity_type == "protocol"`, `entity_id ==` the new id, `actor_id == OWNER_ID`, and payload keys `protocol_code, name, version, step_count`.
  - (d) `test_ignores_client_supplied_server_fields`: the body includes `owner_id: OTHER_USER_ID`, `created_at`, and per step `index: 9, id: "x"`; the stored values are the server's.
  - (e) `test_duplicate_reading_stored_once`: `[{type:"temperature",unit:"C"},{type:"temperature",unit:"C"}]` is stored as `required_fields == ["sample_id","temperature"]`.
  - (f) `test_step_without_readings`: `required_fields == []` and no `default_unit` key.
  - (g) `test_dimensionless_default_unit`: a `pH` reading with no unit is stored with `default_unit == {"pH": "pH"}`.
  - (h) `test_unlisted_type_stored_as_given`: `turbidity`/`NTU` is accepted verbatim.

  Run the file and confirm these tests fail before T006.

### Implementation for US1

- [X] T006 [US1] In `api/app/routers/protocols.py`, implement `@router.post("/protocols") async def create_protocol(body: dict, user: User = Depends(get_current_user))`, following `tools.py`:
  1. Validate with `CreateProtocolRequest(**body)`. On `ValidationError`, return `_fail("INVALID_ARGS", "Some protocol fields are missing or invalid.", errors=exc.errors(include_url=False))`.
  2. `sb = supabase_admin()` (imported at module level from `..deps` so tests can patch it).
  3. Build the stored steps with a module-level function `_stored_steps(steps) -> list[dict]` that follows data-model.md:
     - "`index` is the position in the submitted array. `id` is `step_{index+1}`"
     - `required_fields` is "`[]` when there are no readings. Otherwise it is `["sample_id", ...unique types in order]`"
     - `default_unit` holds "only the readings that have a unit. It is omitted when empty"
     - a dimensionless listed type with no unit gets `vocabulary.lookup(t).default_unit`
     - store the type name as the user typed it; for a listed type, use the vocabulary's canonical `name`
  4. Insert into `protocols` `{protocol_code, name, version, steps, owner_id: user.id}`, with no `created_at`.
  5. `write_event(sb, experiment_id=None, event_type="PROTOCOL_CREATED", entity_type="protocol", entity_id=row["id"], payload={...}, actor_id=user.id)`.
  6. Return `{"success": True, "protocol": row}`, where `row` is the insert result, not the request.

  Include the `ponytail:` comment carried from tools.py about the insert and the event being two PostgREST calls with no transaction. T005 (b)–(h) must pass.
- [X] T007 [P] [US1] In `web/lib/api.ts`, add:
  - `export interface ProtocolDraft { protocol_code: string; name: string; version: string; steps: { name: string; readings: { type: string; unit?: string }[] }[] }`
  - `export async function createProtocol(draft: ProtocolDraft): Promise<{ success: true; protocol: ProtocolSummary } | { success: false; error: string; message: string; detail?: Record<string, unknown> }>`

  It POSTs to `${env.apiUrl}/protocols` with `authHeaders()`. A 401 maps to `{success:false, error:'UNAUTHENTICATED', message:'Your session expired. Sign in again, your form is kept.'}`. Any other non-2xx throws. Import `ProtocolSummary` from `./queries/useExperiment`.
- [X] T008 [P] [US1] *(Done by reuse: `fetchMeasurementTypes` already existed in `web/lib/api.ts`, with query key `['measurement-types']`.)* In `web/lib/api.ts` (or next to it), add `fetchMeasurementTypes(): Promise<{ name: string; units: string[]; dimensionless: boolean }[]>` calling `GET ${env.apiUrl}/settings/measurement-types`. First check whether `web/app/(app)/settings/measurements/page.tsx` already has a fetcher or query for this endpoint. If it does, reuse or export that one instead of adding a second.
- [X] T009 [US1] Create `web/app/(app)/protocols/new/page.tsx` (`'use client'`). The page:
  - uses `usePageCrumbs([{label:'Protocols', href:'/protocols'}, {label:'New protocol'}])` from `@/components/shell/AppShell`;
  - reuses the `page`, `page-title`, `card`, `panel-label` and `badge` classes, and the header layout of `web/app/(app)/protocols/page.tsx`;
  - holds the state `{ protocol_code, name, version: 'v1', steps: StepDraft[] }`, where `StepDraft = { key: string; name: string; readings: { type: string; unit: string }[] }`; `key` comes from `crypto.randomUUID()` and is never sent;
  - starts with one empty step (acceptance US1-1).

  Fields are labelled `<input>`s for code, name and version. Each step renders:
  - its 1-based number;
  - a name input;
  - a readings list, where the type is an `<input list="measurement-types">` backed by one `<datalist>` from T008. The unit is a `<select>` of that type's `units` when the type is listed (lookup ignoring case), or a free-text `<input>` when it is not;
  - "Add reading" and "Remove reading" buttons.

  The **Save** button:
  - builds a `ProtocolDraft` (drop the `key`s, send `unit` only when non-empty);
  - calls `createProtocol`;
  - on success runs `queryClient.invalidateQueries({ queryKey: ['protocols'] })`, then `router.push('/protocols?id=' + protocol.id)`.

  Depends on T007 and T008.
- [X] T010 [US1] In `web/app/(app)/protocols/page.tsx`:
  - Add a primary **New protocol** `<Link href="/protocols/new">` in the page header.
  - Rewrite the top-of-file doc comment and the header `<p>` copy. Both claim protocols are written only by voice and that there is deliberately no form editor. New copy: protocols are created here or dictated during a run; steps of an existing protocol change only by voice.
  - Change the empty-list message to point at New protocol.

**Checkpoint**: Quickstart §2 steps 1–3 and 6 work for a protocol with a few appended steps. `pytest tests/test_protocols.py` passes.

---

## Phase 4: User Story 2: Any number of steps, arranged freely (P1)

**Goal**: The user can add, insert after, remove, and move steps up or down, and the number of steps has no practical limit.

**Independent test**: Add 25 steps, remove step 3, move step 10 to position 1, then save. The stored indexes run 0…23 in the displayed order.

- [X] T011 [US2] Add these cases to `api/tests/test_protocols.py`:
  - `test_indexes_follow_submitted_order_for_many_steps`: 24 steps give stored `[s["index"] for s in steps] == list(range(24))` and `ids == [f"step_{i+1}" ...]`.
  - `test_accepts_200_steps`: expect success.
  - `test_rejects_201_steps`: expect `INVALID_ARGS`, with protocols and events counts unchanged.
- [X] T012 [US2] In `web/app/(app)/protocols/new/page.tsx`, give each step row four buttons, each with an `aria-label` that includes the step number:
  - **Insert step after**: a new empty `StepDraft` at `i+1`;
  - **Move up**: disabled on the first step;
  - **Move down**: disabled on the last step;
  - **Remove**: disabled when only one step remains.

  Also add an **Add step** button below the list that appends a step. Displayed numbers are always `position + 1`. Rows are keyed by `StepDraft.key`. After an add or insert, focus the new step's name input (a ref map keyed by `key` plus a `useEffect` on the pending key). Moving a step keeps focus on the button that was pressed. Reuse existing icons from `web/components/icons.tsx` where they fit; otherwise use text buttons. Do not add a drag-and-drop dependency (research R-106).

**Checkpoint**: The US2 independent test passes in the browser.

---

## Phase 5: User Story 3: Invalid input is refused without writing anything (P2)

**Goal**: Incomplete or inconsistent input is refused, the offending field is named, and nothing is stored. An unsaved draft is protected from accidental loss.

**Independent test**: Each quickstart §1 rejection case leaves `protocols` and `events` row counts unchanged. In the browser, quickstart §2 steps 4, 5 and 7 behave as described.

- [X] T013 [US3] Add rejection tests to `api/tests/test_protocols.py`. Each one also asserts `len(sb.rows("protocols"))` and `len(sb.rows("events"))` are unchanged from before the request (Constitution: "Rejections must not corrupt").
  - `test_rejects_zero_steps`, `test_rejects_blank_name` (`"   "`), `test_rejects_blank_step_name`, `test_rejects_bad_code_pattern` (`"-x"`): each returns `INVALID_ARGS`.
  - `test_rejects_code_used_by_own_protocol_case_insensitive`: seed an owned `PCR-02`, POST `pcr-02`, expect `PROTOCOL_CODE_TAKEN`.
  - `test_rejects_code_used_by_library_protocol`: `owner_id=None`, expect `PROTOCOL_CODE_TAKEN`.
  - `test_allows_code_used_only_by_another_user`: `owner_id=OTHER_USER_ID`, expect success.
  - `test_rejects_listed_type_with_foreign_unit`: pH in C, expect `INVALID_UNIT` with `detail.allowed == ["pH"]`, `detail.step_index == 0` and `detail.type == "pH"`.
- [X] T014 [US3] In `api/app/routers/protocols.py`, before any insert, add these checks in order:
  1. **Code uniqueness** (research R-105): select `protocols` with `.eq("owner_id", user.id)` and separately with `.is_("owner_id", "null")`. The FakeSupabase supports only `eq` and `is_`, so do not use `.or_` or `ilike`. Compare `protocol_code.casefold()` in Python. On a match, return `_fail("PROTOCOL_CODE_TAKEN", f'{code} is already used by "{existing name}".')`.
  2. **Units** (research R-104): for each step `i` and reading, when `vocabulary.lookup(type)` is set and `unit` is not None and `unit not in listed.units`, return `_fail("INVALID_UNIT", f"{listed.name} is recorded in {', '.join(listed.units)}, not {unit}.", step_index=i, type=listed.name, allowed=list(listed.units))`.

  Leave a `ponytail:` comment about the concurrent-save race and the partial-unique-index upgrade from R-105. T013 must pass.
- [X] T015 [US3] In `web/app/(app)/protocols/new/page.tsx`, add client-side checks before calling the API:
  - blank name, blank step name, empty code;
  - on failure, set `aria-invalid` plus an inline message on each offending input and focus the first one.

  Map server failures:
  - `INVALID_ARGS`: map `detail.errors[].loc`, such as `["steps", 3, "name"]`, to the matching field; otherwise show a form-level message.
  - `PROTOCOL_CODE_TAKEN`: mark the code field with the server `message`.
  - `INVALID_UNIT`: mark the unit on `detail.step_index` and list `detail.allowed`.
  - `UNAUTHENTICATED`: show a form-level message and keep all state.

  Put form-level messages in an `aria-live="polite"` region.
- [X] T016 [US3] In `web/app/(app)/protocols/new/page.tsx`:
  - Track `dirty`, meaning any field differs from the initial state, and `saving`.
  - While `dirty && !saving`, register a `beforeunload` handler (with `preventDefault`).
  - Make the in-app Cancel/back link run `confirm('Discard this protocol draft?')` when dirty.
  - Disable Save and show "Saving…" while `saving`, so a double click cannot create two protocols (spec Edge Cases).
  - Clear `dirty` before `router.push` on success.

**Checkpoint**: Every quickstart §1 case passes, and quickstart §2 steps 4, 5 and 7 behave as specified.

---

## Phase 6: Polish and cross-cutting

- [X] T017 [P] Update `specs/001-lablog-voice-notebook/spec.md`. Amend the Assumption "protocols … are seeded rather than created through the interface" so it references `specs/002-manual-protocol-authoring/spec.md`, and add manual protocol creation to the In scope paragraph. This is the Constitution scope rule: amend the spec first.
- [X] T018 [P] In `specs/001-lablog-voice-notebook/data-model.md` §events, add the `PROTOCOL_CREATED` type and the note "experiment_id null for protocol-level events" to the event-type list. Do not edit `supabase/migrations/0001_init.sql`: applied migrations are immutable, and `0002` carries the change.
- [X] T019 Run `cd api && pytest -q`; all pass, including the existing suites. Then run `cd web && npm run lint && npx tsc --noEmit`; both are clean.
- [ ] T020 Run quickstart §2–§4 against the dev Supabase project after applying `0002`. Record the §3 invariant query result (expected 0 rows) and the §4 voice readback in the PR description (Principle V: claims require evidence).

---

## Dependencies and execution order

```text
T001 ─┐
T002 ─┼─> T004 ─> US1 (T005 → T006; T007, T008 ∥ → T009 → T010)
T003 ─┘                │
                       ├─> US2 (T011; T012 edits the T009 page)
                       └─> US3 (T013 → T014; T015, T016 edit the T009 page)
                                      └─> Polish (T017, T018 ∥ → T019 → T020)
```

- US2 and US3 each depend only on US1. They do not depend on each other, but T012, T015 and T016 all edit `protocols/new/page.tsx`, so run them one after another.
- API tasks (T011, T013, T014) and web tasks (T012, T015, T016) in US2 and US3 can run in parallel with each other.

## Parallel examples

- **Phase 2**: T002 (`audit.py`) ∥ T003 (`models.py`).
- **US1**: T005 → T006 on the API side ∥ T007 + T008 on the web side, then T009 once both web tasks are done.
- **US2 and US3**: T011 → T013 → T014 (API, one file) ∥ T012 → T015 → T016 (web, one file).
- **Polish**: T017 ∥ T018.

## Implementation strategy

1. **MVP = Phases 1–3 (T001–T010).** A user can create a protocol with appended steps, and the API is audited and ownership-safe. Stop and run the US1 independent test.
2. **Add US2 (T011–T012).** Insert, remove and reorder make long protocols practical.
3. **Add US3 (T013–T016).** Duplicate-code and unit checks, field-level errors, and draft protection.
4. **Polish (T017–T020).** Scope records, full test and lint run, evidence captured.

Commit after each phase (Constitution: commit per working increment).
