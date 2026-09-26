# Implementation Plan: Manual Protocol Authoring

**Branch**: `002-manual-protocol-authoring` | **Date**: 2026-09-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-manual-protocol-authoring/spec.md`

## Summary

Add a **New protocol** action to the Protocols screen. It opens a form where the user enters the name, code and version, then builds an ordered list of steps: add, insert, remove, move up and down, with no practical limit. Each step has a name, optional per-sample readings, and a default unit for each reading. Saving posts to one new backend endpoint, `POST /protocols`. The endpoint runs the constitution's trust sequence (authenticate → validate structurally → validate semantically → write → audit → return). It assigns indexes and ids from the submitted order and stores the row owned by the user. The row uses the existing `protocols` shape, so the voice tools read it unchanged. The only schema change is making `events.experiment_id` nullable, so that protocol creation can be audited.

## Technical Context

**Language/Version**: Python 3.12 (api), TypeScript / Next.js App Router (web)

**Primary Dependencies**: FastAPI, Pydantic v2, supabase-py (api); React, TanStack Query, Tailwind (web). No new dependencies.

**Storage**: Supabase Postgres, with the existing `protocols` table (steps in JSONB) and `events`. One migration.

**Testing**: pytest with the in-memory `FakeSupabase` from `api/tests/conftest.py`. Web behaviour is checked through the quickstart walkthrough (the web app has no test runner).

**Target Platform**: Desktop Chromium (the same as 001)

**Project Type**: Web application (`api/` + `web/` + `supabase/`)

**Performance Goals**: N/A. It is one insert per save.

**Constraints**: Request body is capped at 200 steps (abuse guard). Server-assigned indexes, ids, owner and timestamps. No client field is trusted for these.

**Scale/Scope**: 1 endpoint, 1 Pydantic model pair, 1 migration line, 1 new page, 1 button on an existing page

No NEEDS CLARIFICATION remain. The decisions are recorded in [research.md](research.md).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Principle | Pre-design | Post-design | Evidence |
|------|-----------|-----------|-------------|----------|
| G1 One validated path per mutation | I | ⚠ justified | ✅ | This is a new route, but it follows the full sequence: auth dependency, Pydantic, semantic checks, then write, then audit. There is still one path *for protocol creation*. See Complexity Tracking. |
| G2 Semantic validation against stored reality | I | ✅ | ✅ | Code uniqueness is checked against readable protocols, units against `vocabulary.lookup`, and step names for non-blank ([contracts/protocols-api.md](contracts/protocols-api.md)). |
| G3 Explicit ownership | I | ✅ | ✅ | `owner_id` is always `user.id` from the verified JWT and is never read from the body. |
| G4 Server timestamps | I | ✅ | ✅ | The request model has no time field; `created_at` comes from the database default. |
| G5 Report stored values | I | ✅ | ✅ | The response is the inserted row as returned by the insert, not the request echoed back. |
| G6 Nothing generated | I / 001 FR-017 | ✅ | ✅ | Text is stored as the user typed it, trimmed. Only `index` and `id` are derived. |
| G7 Every mutation audited | II | ❌ → fixed | ✅ | `events.experiment_id NOT NULL` makes this impossible today. Migration `0002` drops the constraint and a `PROTOCOL_CREATED` event is written ([data-model.md](data-model.md)). |
| G8 Rejections write nothing | Workflow | ✅ | ✅ | All validation runs before the first insert. Tests assert row counts are unchanged ([quickstart.md](quickstart.md) §2). |
| G9 Secrets stay in api/ | III | ✅ | ✅ | The web app calls FastAPI with the user's own bearer token through `lib/api.ts`. No new keys. |
| G10 Single declaration | IV | ✅ | ✅ | The unit vocabulary is read from `api/app/tools/vocabulary.py` (server) and `GET /settings/measurement-types` (form). No copy is kept in the web app. |
| G11 Scope is amended first | Scope | ⚠ | ✅ | 001 treats protocols as seeded. This spec amends that assumption explicitly (spec.md header). Document ingestion stays out of scope. |
| G12 Tool cap ≤ 10 | Scope | ✅ | ✅ | No voice tool is added. |

**Result**: PASS, with one justified deviation (G1), recorded below.

## Project Structure

### Documentation (this feature)

```text
specs/002-manual-protocol-authoring/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── protocols-api.md
└── tasks.md             # /speckit-tasks — not created here
```

### Source Code (repository root)

```text
supabase/migrations/
└── 0002_protocol_events.sql      # NEW: events.experiment_id drop not null

api/app/
├── audit.py                      # EDIT: add "PROTOCOL_CREATED"; experiment_id optional
├── main.py                       # EDIT: include protocols router
├── routers/protocols.py          # NEW: POST /protocols (validate → insert → event)
└── tools/models.py               # EDIT: ProtocolStepIn, CreateProtocolRequest

api/tests/
└── test_protocols.py             # NEW: happy path, each rejection, count-unchanged asserts

web/app/(app)/protocols/
├── page.tsx                      # EDIT: "New protocol" link; fix "only one way" copy
└── new/page.tsx                  # NEW: the form (state = array of steps)

web/lib/
├── api.ts                        # EDIT: createProtocol()
└── queries/useExperiment.ts      # (reuse) invalidate ['protocols'] after save
```

**Structure Decision**: This is the existing web-application layout. The form is one route file and does not need a component library. It reuses `readingsRequired`, the `ProtocolStep` type, and the `/settings/measurement-types` endpoint that already exist.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A second write route (`POST /protocols`) beside `POST /tools` | `/tools` is experiment-scoped by contract: `ToolCall.experiment_id` is required, and ownership is anchored on the experiment. A library protocol belongs to no experiment. | **Add a `create_protocol` tool**: this needs a fake experiment id, exposes creation to the model (which must never author procedure), and uses one of the ten tool slots. **Write from the browser with the anon key under an RLS insert policy**: this skips semantic validation and the audit event (Principles I and II). |
| `events.experiment_id` becomes nullable | Principle II requires an event for every mutation, and a protocol created from the form has no experiment. | **Skip the event**: this violates Principle II. **A separate `protocol_events` table**: this means a second audit trail and a second invariant query for one event type. |
