"""POST /protocols — a protocol created from the Protocols screen.

specs/002-manual-protocol-authoring/contracts/protocols-api.md. Every rejection
also asserts that nothing was written (Constitution: "Rejections must not
corrupt").
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import protocols as protocols_router
from tests.conftest import OTHER_USER_ID, OWNER_ID, PROTOCOL_ID, FakeSupabase
from tests.test_api import JWT_SECRET, make_token

URL = "/protocols"

CONTRACT_REQUEST = {
    "protocol_code": "PCR-02",
    "name": "Colony PCR screen",
    "version": "v1",
    "steps": [
        {"name": "Record initial temperature", "readings": [{"type": "temperature", "unit": "C"}]},
        {"name": "Add master mix", "readings": [{"type": "volume", "unit": "mL"}]},
        {"name": "Load thermocycler", "readings": []},
    ],
}

CONTRACT_STEPS = [
    {
        "index": 0,
        "id": "step_1",
        "name": "Record initial temperature",
        "required_fields": ["sample_id", "temperature"],
        "default_unit": {"temperature": "C"},
    },
    {
        "index": 1,
        "id": "step_2",
        "name": "Add master mix",
        "required_fields": ["sample_id", "volume"],
        "default_unit": {"volume": "mL"},
    },
    {"index": 2, "id": "step_3", "name": "Load thermocycler", "required_fields": []},
]


@pytest.fixture
def client(sb: FakeSupabase, monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)
    monkeypatch.setattr(protocols_router, "supabase_admin", lambda: sb)
    app = FastAPI()
    app.include_router(protocols_router.router)
    return TestClient(app)


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(OWNER_ID)}"}


def post(client: TestClient, body: dict) -> dict:
    response = client.post(URL, json=body, headers=auth())
    assert response.status_code == 200
    return response.json()


def one_step(**step) -> dict:
    return {**CONTRACT_REQUEST, "steps": [{"name": "Step", **step}]}


def created(sb: FakeSupabase) -> dict:
    return next(p for p in sb.rows("protocols") if p["protocol_code"] == "PCR-02")


# -- US1: create ---------------------------------------------------------------


def test_requires_auth(client):
    assert client.post(URL, json=CONTRACT_REQUEST).status_code == 401


def test_creates_protocol_as_contract_example(client, sb):
    body = post(client, CONTRACT_REQUEST)

    assert body["success"] is True
    row = created(sb)
    assert row["steps"] == CONTRACT_STEPS
    assert row["owner_id"] == OWNER_ID
    assert (row["name"], row["version"]) == ("Colony PCR screen", "v1")
    assert body["protocol"] == row


def test_writes_one_protocol_created_event(client, sb):
    post(client, CONTRACT_REQUEST)

    [event] = sb.rows("events")
    assert event["event_type"] == "PROTOCOL_CREATED"
    assert event["experiment_id"] is None
    assert (event["entity_type"], event["entity_id"]) == ("protocol", created(sb)["id"])
    assert event["actor_id"] == OWNER_ID
    assert event["payload"] == {
        "protocol_code": "PCR-02",
        "name": "Colony PCR screen",
        "version": "v1",
        "step_count": 3,
    }


def test_ignores_client_supplied_server_fields(client, sb):
    body = {
        **CONTRACT_REQUEST,
        "owner_id": OTHER_USER_ID,
        "created_at": "2001-01-01T00:00:00Z",
        "steps": [{"name": "Only step", "index": 9, "id": "x"}],
    }
    post(client, body)

    row = created(sb)
    assert row["owner_id"] == OWNER_ID
    assert "created_at" not in row  # the database default, never the request
    assert row["steps"][0]["index"] == 0 and row["steps"][0]["id"] == "step_1"


def test_duplicate_reading_stored_once(client, sb):
    reading = {"type": "temperature", "unit": "C"}
    post(client, one_step(readings=[reading, reading]))
    assert created(sb)["steps"][0]["required_fields"] == ["sample_id", "temperature"]


def test_step_without_readings(client, sb):
    post(client, one_step())
    step = created(sb)["steps"][0]
    assert step["required_fields"] == []
    assert "default_unit" not in step


def test_dimensionless_default_unit(client, sb):
    post(client, one_step(readings=[{"type": "ph"}]))
    step = created(sb)["steps"][0]
    assert step["required_fields"] == ["sample_id", "pH"]
    assert step["default_unit"] == {"pH": "pH"}


def test_unlisted_type_stored_as_given(client, sb):
    post(client, one_step(readings=[{"type": "turbidity", "unit": "NTU"}]))
    assert created(sb)["steps"][0]["default_unit"] == {"turbidity": "NTU"}


def test_text_is_trimmed_not_rewritten(client, sb):
    post(client, {**one_step(), "name": "  Colony PCR   screen  ", "steps": [{"name": " spin DOWN "}]})
    row = created(sb)
    assert row["name"] == "Colony PCR   screen"
    assert row["steps"][0]["name"] == "spin DOWN"


# -- US2: any number of steps ---------------------------------------------------


def test_indexes_follow_submitted_order_for_many_steps(client, sb):
    names = [f"Step {n}" for n in range(24)]
    post(client, {**CONTRACT_REQUEST, "steps": [{"name": n} for n in names]})

    steps = created(sb)["steps"]
    assert [s["index"] for s in steps] == list(range(24))
    assert [s["id"] for s in steps] == [f"step_{i + 1}" for i in range(24)]
    assert [s["name"] for s in steps] == names


def test_accepts_200_steps(client):
    body = {**CONTRACT_REQUEST, "steps": [{"name": f"S{i}"} for i in range(200)]}
    assert post(client, body)["success"] is True


# -- US3: rejections write nothing ------------------------------------------------


def assert_rejected(client, sb, body: dict, error: str) -> dict:
    before = (len(sb.rows("protocols")), len(sb.rows("events")))
    result = post(client, body)
    assert result["success"] is False
    assert result["error"] == error
    assert (len(sb.rows("protocols")), len(sb.rows("events"))) == before
    return result


def test_rejects_201_steps(client, sb):
    body = {**CONTRACT_REQUEST, "steps": [{"name": f"S{i}"} for i in range(201)]}
    assert_rejected(client, sb, body, "INVALID_ARGS")


def test_rejects_zero_steps(client, sb):
    assert_rejected(client, sb, {**CONTRACT_REQUEST, "steps": []}, "INVALID_ARGS")


def test_rejects_blank_name(client, sb):
    assert_rejected(client, sb, {**CONTRACT_REQUEST, "name": "   "}, "INVALID_ARGS")


def test_rejects_blank_step_name(client, sb):
    result = assert_rejected(client, sb, one_step(name="  "), "INVALID_ARGS")
    assert result["detail"]["errors"][0]["loc"] == ["steps", 0, "name"]


def test_rejects_bad_code_pattern(client, sb):
    assert_rejected(client, sb, {**CONTRACT_REQUEST, "protocol_code": "-x"}, "INVALID_ARGS")


def _seed_protocol(sb: FakeSupabase, code: str, owner_id: str | None) -> None:
    sb.rows("protocols").append(
        {"id": f"seed-{code}-{owner_id}", "protocol_code": code, "name": "Existing", "steps": [], "owner_id": owner_id}
    )


def test_rejects_code_used_by_own_protocol_case_insensitive(client, sb):
    _seed_protocol(sb, "PCR-02", OWNER_ID)
    result = assert_rejected(
        client, sb, {**CONTRACT_REQUEST, "protocol_code": "pcr-02"}, "PROTOCOL_CODE_TAKEN"
    )
    assert "Existing" in result["message"]


def test_rejects_code_used_by_library_protocol(client, sb):
    # The seeded library protocol (owner_id null) is STAB.
    assert_rejected(client, sb, {**CONTRACT_REQUEST, "protocol_code": "stab"}, "PROTOCOL_CODE_TAKEN")


def test_allows_code_used_only_by_another_user(client, sb):
    _seed_protocol(sb, "PCR-02", OTHER_USER_ID)
    assert post(client, CONTRACT_REQUEST)["success"] is True


def test_rejects_listed_type_with_foreign_unit(client, sb):
    result = assert_rejected(
        client, sb, one_step(readings=[{"type": "pH", "unit": "C"}]), "INVALID_UNIT"
    )
    assert result["detail"] == {"step_index": 0, "type": "pH", "allowed": ["pH"]}


# ---------------------------------------------------------------------------
# PUT / DELETE /protocols/{id}: only the creator, only while no experiment uses it.
# ---------------------------------------------------------------------------

EDITED = {
    "protocol_code": "PCR-03",
    "name": "Colony PCR screen (revised)",
    "version": "v2",
    "steps": [{"name": "Record initial temperature", "readings": [{"type": "temperature", "unit": "C"}]}],
}


def _mine(client) -> dict:
    return client.post(URL, json=CONTRACT_REQUEST, headers=auth()).json()["protocol"]


def _as(user: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(user)}"}


def _counts(sb):
    return sb.count("protocols"), sb.count("events")


def test_creator_edits_protocol_and_prior_definition_is_audited(client, sb):
    mine = _mine(client)
    res = client.put(f"{URL}/{mine['id']}", json=EDITED, headers=auth()).json()

    assert res["success"], res
    assert res["protocol"]["id"] == mine["id"]
    assert res["protocol"]["protocol_code"] == "PCR-03"
    assert res["protocol"]["steps"] == [CONTRACT_STEPS[0]]
    assert res["protocol"]["owner_id"] == OWNER_ID

    event = sb.rows("events")[-1]
    assert event["event_type"] == "PROTOCOL_UPDATED" and event["entity_id"] == mine["id"]
    assert event["payload"]["before"]["steps"] == CONTRACT_STEPS
    assert event["payload"]["after"]["name"] == "Colony PCR screen (revised)"


def test_edit_may_keep_its_own_code(client, sb):
    mine = _mine(client)
    res = client.put(f"{URL}/{mine['id']}", json={**EDITED, "protocol_code": "pcr-02"}, headers=auth()).json()
    assert res["success"], res


def test_creator_deletes_protocol_and_snapshot_is_kept(client, sb):
    mine = _mine(client)
    res = client.delete(f"{URL}/{mine['id']}", headers=auth()).json()

    assert res == {"success": True, "deleted": mine["id"]}
    assert all(p["id"] != mine["id"] for p in sb.rows("protocols"))
    event = sb.rows("events")[-1]
    assert event["event_type"] == "PROTOCOL_DELETED"
    assert event["payload"]["steps"] == CONTRACT_STEPS


@pytest.mark.parametrize("method", ["put", "delete"])
def test_other_user_cannot_edit_or_delete(client, sb, method):
    mine = _mine(client)
    before = _counts(sb)
    kwargs = {"json": EDITED} if method == "put" else {}
    res = getattr(client, method)(f"{URL}/{mine['id']}", headers=_as(OTHER_USER_ID), **kwargs)
    assert res.status_code == 403
    assert _counts(sb) == before
    assert next(p for p in sb.rows("protocols") if p["id"] == mine["id"])["name"] == "Colony PCR screen"


@pytest.mark.parametrize("method", ["put", "delete"])
def test_library_protocol_is_nobodys_to_change(client, sb, method):
    # The seeded STAB protocol is a shared library protocol (owner_id null).
    before = _counts(sb)
    kwargs = {"json": EDITED} if method == "put" else {}
    res = getattr(client, method)(f"{URL}/{PROTOCOL_ID}", headers=auth(), **kwargs)
    assert res.status_code == 403
    assert _counts(sb) == before


@pytest.mark.parametrize("method", ["put", "delete"])
def test_protocol_in_use_cannot_be_edited_or_deleted(client, sb, method):
    mine = _mine(client)
    sb.rows("experiments").append({"id": "e9", "experiment_code": "PCR-02-1", "protocol_id": mine["id"], "owner_id": OWNER_ID, "status": "DRAFT"})
    before = _counts(sb)
    kwargs = {"json": EDITED} if method == "put" else {}
    res = getattr(client, method)(f"{URL}/{mine['id']}", headers=auth(), **kwargs).json()
    assert res["error"] == "PROTOCOL_IN_USE" and res["detail"]["experiments"] == ["PCR-02-1"]
    assert _counts(sb) == before


def test_edit_rejections_write_nothing(client, sb):
    mine = _mine(client)
    client.post(URL, json={**CONTRACT_REQUEST, "protocol_code": "OTHER-1"}, headers=auth())
    before = _counts(sb)
    assert client.put(f"{URL}/{mine['id']}", json={**EDITED, "steps": []}, headers=auth()).json()["error"] == "INVALID_ARGS"
    assert client.put(f"{URL}/{mine['id']}", json={**EDITED, "protocol_code": "other-1"}, headers=auth()).json()["error"] == "PROTOCOL_CODE_TAKEN"
    bad_unit = {**EDITED, "steps": [{"name": "x", "readings": [{"type": "pH", "unit": "C"}]}]}
    assert client.put(f"{URL}/{mine['id']}", json=bad_unit, headers=auth()).json()["error"] == "INVALID_UNIT"
    assert _counts(sb) == before


@pytest.mark.parametrize("path", ["not-a-uuid", "99999999-9999-9999-9999-999999999999"])
def test_missing_protocol_is_404(client, sb, path):
    assert client.delete(f"{URL}/{path}", headers=auth()).status_code == 404
    assert client.put(f"{URL}/{path}", json=EDITED, headers=auth()).status_code == 404


def test_edit_and_delete_require_a_token(client, sb):
    assert client.put(f"{URL}/{PROTOCOL_ID}", json=EDITED).status_code == 401
    assert client.delete(f"{URL}/{PROTOCOL_ID}").status_code == 401
