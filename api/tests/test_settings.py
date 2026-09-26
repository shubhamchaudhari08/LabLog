"""The settings screen reads the same vocabulary the voice tools use."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import settings as settings_router
from app.tools import vocabulary
from tests.conftest import OWNER_ID
from tests.test_api import JWT_SECRET, make_token

URL = "/settings/measurement-types"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)
    app = FastAPI()
    app.include_router(settings_router.router)
    return TestClient(app)


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(OWNER_ID)}"}


def test_requires_auth(client):
    assert client.get(URL).status_code == 401


def test_serves_the_tool_vocabulary(client):
    response = client.get(URL, headers=auth())
    assert response.status_code == 200
    body = response.json()
    assert [t["name"] for t in body] == vocabulary.type_names()
    assert next(t for t in body if t["name"] == "pH") == {
        "name": "pH",
        "units": ["pH"],
        "default_unit": "pH",
        "spoken_units": [],
        "dimensionless": True,
    }


def test_there_is_no_write_path(client):
    assert client.post(URL, json={"name": "x", "units": ["g"]}, headers=auth()).status_code == 405
    assert client.put(f"{URL}/x", json={}, headers=auth()).status_code == 404
    assert client.delete(f"{URL}/x", headers=auth()).status_code == 404
