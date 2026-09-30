"""Voice from any screen: the desk profile, scoped dispatch, and the bench greeting.

specs/003-post-mvp-features contracts/tools-api-v2.md and voice-session.md, and
constitution amendment A-1. Every rejection asserts nothing was written.
"""

from __future__ import annotations

import pytest

from app.routers import voice as voice_router
from tests.conftest import EXPERIMENT_ID, OTHER_USER_ID, OWNER_ID, PROTOCOL_ID, FakeSupabase
from tests.test_api import client, make_token  # noqa: F401 — shared app fixture


def call(client, tool, args, *, user=OWNER_ID, experiment_id=None):  # noqa: F811
    body = {"tool": tool, "args": args, "session_id": "sess-1"}
    if experiment_id:
        body["experiment_id"] = experiment_id
    res = client.post("/tools", json=body, headers={"Authorization": f"Bearer {make_token(user)}"})
    return res


def counts(sb: FakeSupabase):
    return sb.count("experiments"), sb.count("samples"), sb.count("events")


CREATE = {"name": "Enzyme Stability Trial 12", "protocol_ref": "STAB", "sample_codes": ["a1", "A2"]}


# -- desk tools through POST /tools, with no experiment open -----------------


def test_list_protocols_needs_no_experiment(client, sb):  # noqa: F811
    sb.rows("protocols").append({"id": "p2", "protocol_code": "PRIV", "name": "Private", "steps": [], "owner_id": OTHER_USER_ID})
    data = call(client, "list_protocols", {}).json()["data"]
    assert [p["protocol_code"] for p in data["protocols"]] == ["STAB"]
    assert data["protocols"][0]["step_count"] == 6


def test_create_asks_for_confirmation_first_and_writes_nothing(client, sb):  # noqa: F811
    before = counts(sb)
    res = call(client, "create_experiment", {**CREATE, "confirmed": False}).json()
    assert res["error"] == "NEEDS_CONFIRMATION"
    assert res["detail"]["sample_codes"] == ["A1", "A2"]
    assert res["detail"]["protocol"]["protocol_code"] == "STAB"
    assert res["detail"]["will_start"] is True
    assert counts(sb) == before


def test_confirmed_create_starts_the_run(client, sb):  # noqa: F811
    data = call(client, "create_experiment", {**CREATE, "confirmed": True}).json()["data"]
    assert data["experiment_code"] == "STAB-105"
    assert data["status"] == "RUNNING"
    assert data["sample_codes"] == ["A1", "A2"]
    events = [e for e in sb.rows("events") if e["experiment_id"] == data["experiment_id"]]
    assert [e["event_type"] for e in events] == ["EXPERIMENT_CREATED", "SAMPLE_CREATED", "SAMPLE_CREATED", "EXPERIMENT_STARTED"]
    assert all(e["voice_session_id"] == "sess-1" for e in events)
    assert events[1]["payload"]["source"] == "voice"


def test_spoken_protocol_name_resolves_by_its_words(client, sb):  # noqa: F811
    data = call(client, "create_experiment", {**CREATE, "protocol_ref": "sample stability", "confirmed": True}).json()["data"]
    assert data["protocol"]["protocol_code"] == "STAB"


@pytest.mark.parametrize("said", ["Sample Stability Evaluation protocol", "the sample stability protocol"])
def test_filler_words_around_a_spoken_protocol_name_are_ignored(client, sb, said):  # noqa: F811
    # The agent passes the protocol as said (specs/007 R-716), so "protocol" and
    # "the" come along; live probe C1 hit PROTOCOL_NOT_FOUND on exactly this.
    data = call(client, "create_experiment", {**CREATE, "protocol_ref": said, "confirmed": True}).json()["data"]
    assert data["protocol"]["protocol_code"] == "STAB"


def test_start_false_leaves_it_ready(client, sb):  # noqa: F811
    data = call(client, "create_experiment", {**CREATE, "start": False, "confirmed": True}).json()["data"]
    assert data["status"] == "READY"


def test_no_protocol_creates_a_draft_to_dictate(client, sb):  # noqa: F811
    data = call(client, "create_experiment", {"name": "Free run", "confirmed": True}).json()["data"]
    assert data["status"] == "DRAFT" and data["needs_protocol"] is True
    assert data["experiment_code"] == "EXP-1"


@pytest.mark.parametrize(
    "args, error",
    [
        ({**CREATE, "protocol_ref": "nonexistent", "confirmed": True}, "PROTOCOL_NOT_FOUND"),
        ({**CREATE, "sample_codes": ["-x"], "confirmed": True}, "INVALID_SAMPLE_CODE"),
        ({**CREATE, "sample_codes": ["a1", "A1"], "confirmed": True}, "DUPLICATE_SAMPLE_CODE"),
        ({**CREATE, "started_at": "2020-01-01", "confirmed": True}, "INVALID_ARGS"),
    ],
)
def test_create_rejections_write_nothing(client, sb, args, error):  # noqa: F811
    before = counts(sb)
    assert call(client, "create_experiment", args).json()["error"] == error
    assert counts(sb) == before


def test_ambiguous_protocol_returns_candidates(client, sb):  # noqa: F811
    sb.rows("protocols").append({"id": "p3", "protocol_code": "STAB2", "name": "Sample Stability Rapid", "steps": [], "owner_id": None})
    before = counts(sb)
    res = call(client, "create_experiment", {**CREATE, "protocol_ref": "sample stability", "confirmed": True}).json()
    assert res["error"] == "AMBIGUOUS_PROTOCOL"
    assert {c["protocol_code"] for c in res["detail"]["candidates"]} == {"STAB", "STAB2"}
    assert counts(sb) == before


# -- start_experiment: resolved by the dispatcher among the caller's own ----


def _ready(client):  # noqa: F811
    return call(client, "create_experiment", {**CREATE, "start": False, "confirmed": True}).json()["data"]


def test_start_by_code_after_confirmation(client, sb):  # noqa: F811
    ready = _ready(client)
    before = counts(sb)
    assert call(client, "start_experiment", {"experiment_ref": "stab-105", "confirmed": False}).json()["error"] == "NEEDS_CONFIRMATION"
    assert counts(sb) == before

    data = call(client, "start_experiment", {"experiment_ref": "STAB-105", "confirmed": True}).json()["data"]
    assert data["experiment_id"] == ready["experiment_id"]
    assert data["status"] == "RUNNING" and data["already_running"] is False
    assert data["current_step"] == {"index": 0, "name": "Register samples"}


def test_resuming_a_running_experiment_writes_nothing(client, sb):  # noqa: F811
    before = counts(sb)
    data = call(client, "start_experiment", {"experiment_ref": "STAB-104", "confirmed": False}).json()["data"]
    assert data["already_running"] is True and data["experiment_id"] == EXPERIMENT_ID
    assert counts(sb) == before


def test_another_users_experiment_is_not_found_not_forbidden(client, sb):  # noqa: F811
    before = counts(sb)
    res = call(client, "start_experiment", {"experiment_ref": "STAB-104", "confirmed": True}, user=OTHER_USER_ID)
    assert res.status_code == 200 and res.json()["error"] == "EXPERIMENT_NOT_FOUND"
    assert counts(sb) == before


def test_completed_experiment_cannot_start(client, sb):  # noqa: F811
    sb.rows("experiments")[0]["status"] = "COMPLETED"
    before = counts(sb)
    res = call(client, "start_experiment", {"experiment_ref": "STAB-104", "confirmed": True}).json()
    assert res["error"] == "INVALID_STATE"
    assert counts(sb) == before


def test_bench_tool_without_an_experiment_is_refused(client, sb):  # noqa: F811
    before = counts(sb)
    res = call(client, "record_measurement", {"sample_code": "A17", "measurement_type": "temperature", "value": 4.2, "unit": "C"}).json()
    assert res["error"] == "EXPERIMENT_REQUIRED"
    assert counts(sb) == before


def test_bench_tools_unchanged_with_an_experiment(client, sb):  # noqa: F811
    res = call(
        client,
        "record_measurement",
        {"sample_code": "A17", "measurement_type": "temperature", "value": 4.2, "unit": "C"},
        experiment_id=EXPERIMENT_ID,
    ).json()
    assert res["success"] and res["data"]["sample_code"] == "A17"


# -- bootstrap ---------------------------------------------------------------


@pytest.fixture
def minted(monkeypatch):
    calls = []

    async def _mint():
        calls.append(1)
        return "TEMPORARY_TOKEN"

    monkeypatch.setattr(voice_router, "_mint_token", _mint)
    return calls


def boot(client, query="", user=OWNER_ID):  # noqa: F811
    return client.get(f"/voice/bootstrap{query}", headers={"Authorization": f"Bearer {make_token(user)}"})


def test_desk_bootstrap_without_an_experiment(client, sb, minted):  # noqa: F811
    body = boot(client).json()
    assert body["profile"] == "desk" and body["experiment"] is None
    config = body["session_config"]
    assert [t["name"] for t in config["tools"]] == ["list_protocols", "search_experiments", "create_experiment", "start_experiment"]
    assert "No experiment is open" in config["greeting"]
    assert "STAB: Sample Stability Evaluation" in config["system_prompt"]
    assert "STAB-104" in config["system_prompt"]  # a running run the user can resume
    assert config["input"]["keyterms"][0] == "STAB"
    assert config["output"]["voice"]  # same voice as bench: it is immutable mid-session


def test_bench_greeting_names_the_experiment(client, sb, minted):  # noqa: F811
    greeting = boot(client, f"?experiment_id={EXPERIMENT_ID}").json()["session_config"]["greeting"]
    assert greeting.startswith("LabLog ready. Sample Stability Evaluation Run 104, STAB-104, is running.")
    assert "Step 2 of 6: Record initial temperature." in greeting


def test_finished_experiment_refuses_a_session_before_minting(client, sb, minted):  # noqa: F811
    sb.rows("experiments")[0]["status"] = "COMPLETED"
    res = boot(client, f"?experiment_id={EXPERIMENT_ID}")
    assert res.status_code == 409 and res.json()["detail"] == "EXPERIMENT_CLOSED"
    assert minted == []


# -- specs/006: search through POST /tools, and the tz envelope ---------------


def test_search_runs_with_no_experiment_open(client, sb):  # noqa: F811
    before = counts(sb)
    res = call(client, "search_experiments", {"status": "RUNNING"}).json()
    assert res["success"] is True
    assert [r["experiment_code"] for r in res["data"]["results"]] == ["STAB-104"]
    assert counts(sb) == before


def test_envelope_tz_reaches_search(client, sb):  # noqa: F811
    body = {"tool": "search_experiments", "args": {"period": "today"}, "tz": "Asia/Kolkata", "session_id": "s"}
    res = client.post("/tools", json=body, headers={"Authorization": f"Bearer {make_token(OWNER_ID)}"}).json()
    assert res["data"]["resolved"]["tz_used"] == "Asia/Kolkata"


def test_the_model_cannot_set_the_zone(client, sb):  # noqa: F811
    res = call(client, "search_experiments", {"tz": "UTC"}).json()
    assert res["success"] is False and res["error"] == "INVALID_ARGS"


def test_bench_tools_ignore_an_envelope_tz(client, sb):  # noqa: F811
    body = {"tool": "get_active_experiment", "args": {}, "experiment_id": EXPERIMENT_ID, "tz": "Asia/Kolkata"}
    res = client.post("/tools", json=body, headers={"Authorization": f"Bearer {make_token(OWNER_ID)}"}).json()
    assert res["success"] is True
