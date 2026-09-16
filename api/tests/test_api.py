"""T030, T038, T042 — the trust boundary, tested at the HTTP layer.

These are the tests that matter most. Everything else protects data quality;
these protect the claim that the model can never write to something it does not
own, and that privileged credentials never leave this service.
"""

from __future__ import annotations

import time

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import tools as tools_router
from app.routers import voice as voice_router
from tests.conftest import EXPERIMENT_ID, OTHER_USER_ID, OWNER_ID, FakeSupabase

JWT_SECRET = "test-secret-not-a-real-one"


def make_token(sub: str, *, audience: str = "authenticated", expired: bool = False) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": sub,
            "aud": audience,
            "iat": now,
            "exp": now - 10 if expired else now + 3600,
            "email": "demo@lablog.dev",
        },
        JWT_SECRET,
        algorithm="HS256",
    )


@pytest.fixture
def client(sb: FakeSupabase, monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")

    app = FastAPI()
    app.include_router(tools_router.router)
    app.include_router(voice_router.router)
    # The routers call supabase_admin() directly, so patch the module-level name.
    monkeypatch.setattr(tools_router, "supabase_admin", lambda: sb)
    monkeypatch.setattr(voice_router, "supabase_admin", lambda: sb)

    return TestClient(app)


def post_tool(client, token, tool="record_measurement", **overrides):
    body = {
        "tool": tool,
        "args": {
            "sample_code": "A17",
            "measurement_type": "temperature",
            "value": 4.2,
            "unit": "C",
        },
        "experiment_id": EXPERIMENT_ID,
        "session_id": "sess-1",
    }
    body.update(overrides)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.post("/tools", json=body, headers=headers)


# ---------------------------------------------------------------------------
# T030 — authentication
# ---------------------------------------------------------------------------
def test_missing_header_is_401(client, sb):
    assert post_tool(client, None).status_code == 401
    assert sb.count("measurements") == 0


def test_malformed_header_is_401(client, sb):
    response = client.post(
        "/tools", json={"tool": "x", "experiment_id": EXPERIMENT_ID}, headers={"Authorization": "abc"}
    )
    assert response.status_code == 401
    assert sb.count("measurements") == 0


def test_expired_token_is_401(client, sb):
    assert post_tool(client, make_token(OWNER_ID, expired=True)).status_code == 401
    assert sb.count("measurements") == 0


def test_wrong_audience_is_401(client, sb):
    assert post_tool(client, make_token(OWNER_ID, audience="anon")).status_code == 401
    assert sb.count("measurements") == 0


def test_token_signed_with_another_secret_is_401(client, sb):
    forged = jwt.encode(
        {"sub": OWNER_ID, "aud": "authenticated", "exp": int(time.time()) + 3600},
        "a-different-secret",
        algorithm="HS256",
    )
    assert post_tool(client, forged).status_code == 401
    assert sb.count("measurements") == 0


# ---------------------------------------------------------------------------
# T038 — authorization. The single most important test in the suite.
# ---------------------------------------------------------------------------
def test_authenticated_but_not_the_owner_is_403_and_writes_nothing(client, sb):
    response = post_tool(client, make_token(OTHER_USER_ID))
    assert response.status_code == 403
    # The service role key bypasses row-level security, so if the explicit
    # ownership check in the dispatcher were removed this would succeed and
    # write into someone else's experiment.
    assert sb.count("measurements") == 0
    assert sb.count("events") == 0


def test_unknown_experiment_is_404(client, sb):
    response = post_tool(client, make_token(OWNER_ID), experiment_id="00000000-0000-0000-0000-00000000dead")
    assert response.status_code == 404


def test_owner_succeeds(client, sb):
    response = post_tool(client, make_token(OWNER_ID))
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert sb.count("measurements") == 1


# ---------------------------------------------------------------------------
# T038 — dispatcher-level rejections
# ---------------------------------------------------------------------------
def test_unknown_tool(client, sb):
    body = post_tool(client, make_token(OWNER_ID), tool="drop_database").json()
    assert body["error"] == "UNKNOWN_TOOL"
    assert sb.count("measurements") == 0


def test_invalid_args_reports_the_field(client, sb):
    body = post_tool(
        client, make_token(OWNER_ID), args={"sample_code": "A17"}  # no type, no value
    ).json()
    assert body["error"] == "INVALID_ARGS"
    assert body["detail"]["errors"]
    assert sb.count("measurements") == 0


def test_unknown_argument_is_rejected_not_ignored(client, sb):
    # A model inventing an argument is a signal, usually that a description is
    # ambiguous. Silently dropping it hides that.
    body = post_tool(
        client,
        make_token(OWNER_ID),
        args={
            "sample_code": "A17",
            "measurement_type": "temperature",
            "value": 4.2,
            "recorded_at": "2020-01-01T00:00:00Z",
        },
    ).json()
    assert body["error"] == "INVALID_ARGS"
    assert sb.count("measurements") == 0


def test_mutation_rejected_when_experiment_is_not_running(client, sb):
    sb.rows("experiments")[0]["status"] = "COMPLETED"
    body = post_tool(client, make_token(OWNER_ID)).json()
    assert body["error"] == "EXPERIMENT_NOT_RUNNING"
    assert sb.count("measurements") == 0


def test_reads_are_allowed_when_not_running(client, sb):
    sb.rows("experiments")[0]["status"] = "COMPLETED"
    body = post_tool(client, make_token(OWNER_ID), tool="get_active_experiment", args={}).json()
    assert body["success"] is True


def test_tool_failures_use_http_200(client, sb):
    # A tool-level failure is a conversational outcome, not a transport error.
    response = post_tool(
        client,
        make_token(OWNER_ID),
        args={"sample_code": "A99", "measurement_type": "temperature", "value": 4.2, "unit": "C"},
    )
    assert response.status_code == 200
    assert response.json()["error"] == "SAMPLE_NOT_FOUND"


# ---------------------------------------------------------------------------
# T042 — voice bootstrap
# ---------------------------------------------------------------------------
@pytest.fixture
def fake_token(monkeypatch):
    async def _mint():
        return "TEMPORARY_TOKEN"

    monkeypatch.setattr(voice_router, "_mint_token", _mint)
    monkeypatch.setenv("ASSEMBLYAI_API_KEY", "super-secret-key")


def test_bootstrap_requires_ownership_before_minting(client, sb, monkeypatch):
    calls = []

    async def _mint():
        calls.append(1)
        return "TEMPORARY_TOKEN"

    monkeypatch.setattr(voice_router, "_mint_token", _mint)

    response = client.get(
        f"/voice/bootstrap?experiment_id={EXPERIMENT_ID}",
        headers={"Authorization": f"Bearer {make_token(OTHER_USER_ID)}"},
    )
    assert response.status_code == 403
    assert calls == [], "a token was minted for a user who does not own the experiment"


def test_bootstrap_returns_the_contract_shape(client, sb, fake_token):
    response = client.get(
        f"/voice/bootstrap?experiment_id={EXPERIMENT_ID}",
        headers={"Authorization": f"Bearer {make_token(OWNER_ID)}"},
    )
    assert response.status_code == 200
    body = response.json()

    assert body["token"] == "TEMPORARY_TOKEN"
    assert body["ws_url"] == "wss://agents.assemblyai.com/v1/ws"
    assert body["experiment"]["code"] == "STAB-104"

    config = body["session_config"]
    assert config["input"]["format"]["encoding"] == "audio/pcm"
    assert config["output"]["format"]["encoding"] == "audio/pcm"
    assert config["input"]["turn_detection"]["interrupt_response"] is True
    assert len(config["tools"]) == 10
    assert "STAB-104" in config["system_prompt"]
    assert config["greeting"]


def test_bootstrap_injects_sample_codes_as_keyterms(client, sb, fake_token):
    body = client.get(
        f"/voice/bootstrap?experiment_id={EXPERIMENT_ID}",
        headers={"Authorization": f"Bearer {make_token(OWNER_ID)}"},
    ).json()
    keyterms = body["session_config"]["input"]["keyterms"]
    # Layer 1 of the entity-accuracy defence: sample codes lead, because they are
    # what the 100-term cap exists to protect.
    assert keyterms[:3] == ["A17", "A18", "CONTROL-01"]
    assert len(keyterms) <= 100


def test_bootstrap_leaks_no_privileged_credential(client, sb, fake_token):
    raw = client.get(
        f"/voice/bootstrap?experiment_id={EXPERIMENT_ID}",
        headers={"Authorization": f"Bearer {make_token(OWNER_ID)}"},
    ).text
    for secret in ("super-secret-key", JWT_SECRET, "SERVICE_ROLE"):
        assert secret not in raw, f"{secret!r} appeared in the bootstrap response"


# ---------------------------------------------------------------------------
# Asymmetric signing keys — the default for Supabase projects since May 2025.
# ---------------------------------------------------------------------------
def test_es256_token_verified_via_jwks(client, sb, monkeypatch):
    from types import SimpleNamespace

    from cryptography.hazmat.primitives.asymmetric import ec

    from app import deps

    private = ec.generate_private_key(ec.SECP256R1())
    fake_jwks = SimpleNamespace(get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=private.public_key()))
    monkeypatch.setattr(deps, "_jwks", lambda: fake_jwks)

    now = int(time.time())
    token = jwt.encode(
        {"sub": OWNER_ID, "aud": "authenticated", "exp": now + 3600}, private, algorithm="ES256"
    )
    assert post_tool(client, token).status_code == 200
    assert sb.count("measurements") == 1

    # Signed by a different key: rejected, nothing written.
    other = ec.generate_private_key(ec.SECP256R1())
    forged = jwt.encode({"sub": OWNER_ID, "aud": "authenticated", "exp": now + 3600}, other, algorithm="ES256")
    assert post_tool(client, forged).status_code == 401
    assert sb.count("measurements") == 1


def test_unsigned_token_is_rejected(client, sb):
    token = jwt.encode({"sub": OWNER_ID, "aud": "authenticated"}, None, algorithm="none")
    assert post_tool(client, token).status_code == 401
    assert sb.count("measurements") == 0
