"""POST /experiments and POST /experiments/{id}/start: quick create and start from the UI.

specs/003-post-mvp-features/contracts/http-api.md (FR-214). Every rejection also
asserts that nothing was written (Constitution: "Rejections must not corrupt").
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import experiments as experiments_router
from tests.conftest import EXPERIMENT_ID, OTHER_USER_ID, OWNER_ID, PROTOCOL_ID, FakeSupabase
from tests.test_api import JWT_SECRET, make_token


@pytest.fixture
def client(sb: FakeSupabase, monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)
    monkeypatch.setattr(experiments_router, "supabase_admin", lambda: sb)
    app = FastAPI()
    app.include_router(experiments_router.router)
    return TestClient(app)


def auth(user: str = OWNER_ID) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(user)}"}


def counts(sb: FakeSupabase) -> tuple[int, int, int]:
    return sb.count("experiments"), sb.count("samples"), sb.count("events")


def events_of(sb: FakeSupabase, entity_id: str) -> list[str]:
    return [e["event_type"] for e in sb.rows("events") if e.get("experiment_id") == entity_id]


# -- create -----------------------------------------------------------------


def test_create_and_start_with_protocol(client, sb):
    body = {"name": "  Enzyme Stability Trial 12 ", "protocol_id": PROTOCOL_ID, "sample_codes": ["a1", "A2"], "start": True}
    res = client.post("/experiments", json=body, headers=auth()).json()

    assert res["success"], res
    exp = res["experiment"]
    assert exp["experiment_code"] == "STAB-105"
    assert exp["name"] == "Enzyme Stability Trial 12"
    assert exp["status"] == "RUNNING"
    assert exp["owner_id"] == OWNER_ID
    assert exp["started_at"] and exp["current_step_index"] == 0
    assert [s["sample_code"] for s in res["samples"]] == ["A1", "A2"]
    assert events_of(sb, exp["id"]) == ["EXPERIMENT_CREATED", "SAMPLE_CREATED", "SAMPLE_CREATED", "EXPERIMENT_STARTED"]

    created = next(e for e in sb.rows("events") if e["event_type"] == "EXPERIMENT_CREATED")
    assert created["payload"] == {
        "experiment_code": "STAB-105",
        "name": "Enzyme Stability Trial 12",
        "protocol_id": PROTOCOL_ID,
        "status": "READY",
    }
    sample_event = next(e for e in sb.rows("events") if e["event_type"] == "SAMPLE_CREATED")
    assert sample_event["payload"]["source"] == "ui"


def test_create_with_protocol_without_start_is_ready(client, sb):
    res = client.post("/experiments", json={"name": "Trial", "protocol_id": PROTOCOL_ID}, headers=auth()).json()
    assert res["experiment"]["status"] == "READY"
    assert res["experiment"].get("started_at") is None


def test_create_without_protocol_is_draft_with_exp_prefix(client, sb):
    res = client.post("/experiments", json={"name": "Free-form run"}, headers=auth()).json()
    assert res["experiment"]["status"] == "DRAFT"
    assert res["experiment"]["experiment_code"] == "EXP-1"
    assert res["experiment"].get("protocol_id") is None


def test_server_owned_fields_in_the_body_are_ignored(client, sb):
    body = {
        "name": "Trial",
        "protocol_id": PROTOCOL_ID,
        "owner_id": OTHER_USER_ID,
        "status": "COMPLETED",
        "experiment_code": "HACK-1",
        "started_at": "2000-01-01T00:00:00Z",
        "created_at": "2000-01-01T00:00:00Z",
    }
    exp = client.post("/experiments", json=body, headers=auth()).json()["experiment"]
    assert exp["owner_id"] == OWNER_ID
    assert exp["status"] == "READY"
    assert exp["experiment_code"] == "STAB-105"
    assert exp.get("started_at") is None
    assert exp.get("created_at") != "2000-01-01T00:00:00Z"


def test_code_numbers_continue_past_the_highest_existing(client, sb):
    sb.rows("experiments").append({"id": "x", "experiment_code": "STAB-120", "owner_id": OTHER_USER_ID, "status": "COMPLETED"})
    exp = client.post("/experiments", json={"name": "Trial", "protocol_id": PROTOCOL_ID}, headers=auth()).json()["experiment"]
    assert exp["experiment_code"] == "STAB-121"


def test_code_collision_retries(client, sb, monkeypatch):
    from app import lifecycle

    calls = {"n": 0}
    real = lifecycle.next_experiment_code

    def stale(sb_, prefix):
        # First answer is stale (someone else took it between read and insert).
        calls["n"] += 1
        return "STAB-104" if calls["n"] == 1 else real(sb_, prefix)

    monkeypatch.setattr(lifecycle, "next_experiment_code", stale)
    exp = client.post("/experiments", json={"name": "Trial", "protocol_id": PROTOCOL_ID}, headers=auth()).json()["experiment"]
    assert exp["experiment_code"] == "STAB-105"
    assert calls["n"] == 2


@pytest.mark.parametrize(
    "body, error",
    [
        ({"name": "   "}, "INVALID_ARGS"),
        ({"name": "x" * 201}, "INVALID_ARGS"),
        ({"name": "Trial", "sample_codes": ["A"] * 51}, "INVALID_ARGS"),
        ({"name": "Trial", "protocol_id": "not-a-protocol"}, "PROTOCOL_NOT_FOUND"),
        ({"name": "Trial", "sample_codes": ["-bad"]}, "INVALID_SAMPLE_CODE"),
        ({"name": "Trial", "sample_codes": ["a1", "A1"]}, "DUPLICATE_SAMPLE_CODE"),
        ({"name": "Trial", "start": True}, "NO_PROTOCOL"),
    ],
)
def test_rejections_write_nothing(client, sb, body, error):
    before = counts(sb)
    res = client.post("/experiments", json=body, headers=auth()).json()
    assert res["success"] is False and res["error"] == error, res
    assert counts(sb) == before


def test_another_users_protocol_is_not_found(client, sb):
    sb.rows("protocols").append({"id": "55555555-5555-5555-5555-555555555555", "protocol_code": "PRIV", "name": "Private", "steps": [], "owner_id": OTHER_USER_ID})
    before = counts(sb)
    res = client.post("/experiments", json={"name": "Trial", "protocol_id": "55555555-5555-5555-5555-555555555555"}, headers=auth()).json()
    assert res["error"] == "PROTOCOL_NOT_FOUND"
    assert counts(sb) == before


def test_own_protocol_is_allowed(client, sb):
    sb.rows("protocols").append({"id": "66666666-6666-6666-6666-666666666666", "protocol_code": "pcr-02", "name": "Mine", "steps": [], "owner_id": OWNER_ID})
    exp = client.post("/experiments", json={"name": "Trial", "protocol_id": "66666666-6666-6666-6666-666666666666"}, headers=auth()).json()["experiment"]
    assert exp["experiment_code"] == "PCR-02-1"


def test_create_requires_a_token(client, sb):
    assert client.post("/experiments", json={"name": "Trial"}).status_code == 401


# -- start ------------------------------------------------------------------


def _ready(client) -> dict:
    return client.post("/experiments", json={"name": "Trial", "protocol_id": PROTOCOL_ID}, headers=auth()).json()["experiment"]


def test_start_moves_ready_to_running(client, sb):
    exp = _ready(client)
    res = client.post(f"/experiments/{exp['id']}/start", headers=auth()).json()
    assert res["success"], res
    assert res["experiment"]["status"] == "RUNNING"
    assert res["experiment"]["started_at"]
    assert events_of(sb, exp["id"])[-1] == "EXPERIMENT_STARTED"


def test_start_running_is_invalid_state(client, sb):
    before = counts(sb)
    res = client.post(f"/experiments/{EXPERIMENT_ID}/start", headers=auth()).json()
    assert res["error"] == "INVALID_STATE" and res["detail"]["status"] == "RUNNING"
    assert counts(sb) == before


def test_start_without_protocol_is_no_protocol(client, sb):
    exp = client.post("/experiments", json={"name": "Draft"}, headers=auth()).json()["experiment"]
    before = counts(sb)
    res = client.post(f"/experiments/{exp['id']}/start", headers=auth()).json()
    assert res["error"] == "NO_PROTOCOL"
    assert counts(sb) == before
    assert next(e for e in sb.rows("experiments") if e["id"] == exp["id"])["status"] == "DRAFT"


def test_start_someone_elses_experiment_is_forbidden(client, sb):
    exp = _ready(client)
    before = counts(sb)
    assert client.post(f"/experiments/{exp['id']}/start", headers=auth(OTHER_USER_ID)).status_code == 403
    assert counts(sb) == before


def test_start_missing_experiment_is_404(client, sb):
    assert client.post("/experiments/nope/start", headers=auth()).status_code == 404


def test_start_requires_a_token(client, sb):
    assert client.post(f"/experiments/{EXPERIMENT_ID}/start").status_code == 401
