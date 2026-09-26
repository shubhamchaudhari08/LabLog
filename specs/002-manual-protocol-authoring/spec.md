# Feature Specification: Manual Protocol Authoring

**Feature Branch**: `002-manual-protocol-authoring`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "On protocol screen add option to create the protocol manually. User can create a new protocol and fill in all the steps and details that are required for adding new protocol. User can add as many steps as he likes from start to finish"

**Amends**: `specs/001-lablog-voice-notebook/spec.md` §Assumptions ("protocols … are seeded rather than created through the interface") and the in-scope list, per the Constitution's scope rule. Voice authoring (`write_protocol_step`) is unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Create a protocol from the Protocols screen (Priority: P1)

A scientist opens Protocols and selects **New protocol**. They enter a name, a code and a version, then add steps one after another. Each step has a name and, optionally, the readings it requires for every sample, with a default unit for each reading. They save, and the new protocol appears in the library, selected, and shows the steps exactly as entered.

**Why this priority**: This is the whole feature. Without it a protocol can only be dictated during a run.

**Independent test**: Create a protocol with three steps through the form, then read the `protocols` row and check that name, code, version and each step's name, index, readings and units match the input exactly. Check that one `PROTOCOL_CREATED` event row exists.

**Acceptance Scenarios**:

1. **Given** the Protocols screen, **When** the user selects New protocol, **Then** a form opens with one empty step ready to fill.
2. **Given** a valid form, **When** the user saves, **Then** the protocol is stored, owned by the user, listed in the library, and selected.
3. **Given** a step with the reading "temperature" and unit "C", **When** saved, **Then** the stored step has `required_fields = ["sample_id","temperature"]` and `default_unit = {"temperature":"C"}`.
4. **Given** a saved protocol, **When** it is opened, **Then** the step order, names and readings are the ones entered. Nothing is added, reworded or reordered.

---

### User Story 2 — Any number of steps, arranged freely (Priority: P1)

While filling the form the user can add a step at the end or insert one after any step. They can also remove a step and move steps up or down. There is no practical limit on how many steps they add.

**Independent test**: Add 25 steps, remove step 3, move step 10 to position 1, then save. Check that the stored indexes run 0…23 with no gaps, in the order shown on screen.

**Acceptance Scenarios**:

1. **Given** N steps, **When** the user adds a step, **Then** N+1 steps are shown and the new one is focused.
2. **Given** steps 1–5, **When** step 3 is removed, **Then** steps renumber to 1–4 with no gaps.
3. **Given** a step, **When** it is moved up or down, **Then** the displayed numbering follows the new order.

---

### User Story 3 — Invalid input is refused without writing anything (Priority: P2)

If the input is incomplete or inconsistent, saving is refused. The screen names what is wrong and where, and nothing is stored.

**Acceptance Scenarios**:

1. **Given** an empty protocol name, any unnamed step, or zero steps, **When** saving, **Then** save is refused, the offending field is marked, and no protocol or event row is written.
2. **Given** a code already used by a protocol the user can read, **When** saving, **Then** save is refused with "code already in use" and nothing is written.
3. **Given** a listed reading type with a unit outside its known units (for example pH in "C"), **When** saving, **Then** save is refused and the allowed units are named.
4. **Given** unsaved changes, **When** the user navigates away, **Then** they are asked to confirm before the draft is discarded.

### Edge Cases

- The same reading is added twice to one step: it is stored once.
- A reading type that is not in the vocabulary: accepted, with a unit given as free text (the vocabulary is open; see data-model 001).
- The session expires mid-edit: the form keeps its contents, and save reports that the user must sign in again.
- A double-click on Save creates one protocol, not two.
- Surrounding whitespace in names is trimmed. Internal wording is stored verbatim.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-101**: The Protocols screen MUST offer a "New protocol" action that opens a creation form.
- **FR-102**: The form MUST collect the protocol name (required), protocol code (required), version (defaults to `v1`) and an ordered list of steps.
- **FR-103**: Each step MUST have a name. It MAY list the reading types required for every sample, and a default unit per listed reading.
- **FR-104**: The user MUST be able to add, insert, remove and reorder steps. The server MUST accept at least 200 steps.
- **FR-105**: The system MUST assign step indexes and ids server-side from the submitted order. Client-supplied indexes, ids, owners and timestamps MUST be ignored.
- **FR-106**: The system MUST reject a protocol with no steps, a blank name, a blank step name, a code already in use among protocols the user can read, or a unit not valid for a listed reading type. Nothing may be written on rejection.
- **FR-107**: A created protocol MUST be owned by its creator, and MUST be visible only to its creator and not to other users.
- **FR-108**: Creating a protocol MUST append one audit event in the same request.
- **FR-109**: The stored protocol MUST contain exactly the text the user entered, trimmed. Nothing is generated or rewritten.
- **FR-110**: Existing protocols are NOT editable through the form. Changing a step stays on the voice path.

### Key Entities

- **Protocol**: an existing entity, unchanged in shape. It now has a second creation route.
- **Protocol step**: an existing JSONB element: `index`, `id`, `name`, `required_fields`, `default_unit`.
- **Event**: may now record a protocol-level event that belongs to no experiment.

## Success Criteria *(mandatory)*

- **SC-101**: A user can create a 10-step protocol with readings in under 3 minutes without leaving the Protocols screen.
- **SC-102**: Every rejected submission in the test suite leaves the protocol and event row counts unchanged.
- **SC-103**: A protocol created by the form can be read by `get_next_protocol_step` for an experiment that references it, with no change to the voice tools.

## Out of Scope

Editing, versioning, duplicating, archiving or deleting existing protocols through the form; importing protocols from documents (a Constitution non-goal); sharing protocols with other users; creating experiments from the form.

## Assumptions

- Codes are unique per reader (the user's own protocols plus library protocols), enforced in application code. No database constraint is added.
- The 200-step ceiling is an abuse guard, not a product limit. Raise it if a real protocol needs more.
