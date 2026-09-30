"""The fake store's filters must behave like PostgREST, or tests built on it lie."""

import pytest

from tests.conftest import FakeSupabase, UniqueViolation, seed_history, seeded_store


@pytest.fixture
def store() -> FakeSupabase:
    s = FakeSupabase()
    s.tables["t"] = [
        {"id": 1, "name": "Enzyme 50% trial", "n": 1, "at": "2026-09-01T00:00:00+00:00"},
        {"id": 2, "name": "enzyme_b", "n": 2, "at": "2026-09-10T00:00:00+00:00"},
        {"id": 3, "name": "Buffer", "n": 3, "at": None},
    ]
    return s


def ids(result):
    return [r["id"] for r in result.data]


def test_neq(store):
    assert ids(store.table("t").select("*").neq("n", 2).execute()) == [1, 3]


def test_in(store):
    assert ids(store.table("t").select("*").in_("id", [1, 3]).execute()) == [1, 3]


def test_gte_lt_drop_nulls(store):
    q = store.table("t").select("*").gte("at", "2026-09-01T00:00:00+00:00").lt("at", "2026-09-10T00:00:00+00:00")
    assert ids(q.execute()) == [1]


def test_ilike_wildcards_case_insensitive(store):
    assert ids(store.table("t").select("*").ilike("name", "%ENZYME%").execute()) == [1, 2]
    assert ids(store.table("t").select("*").ilike("name", "enzyme_b").execute()) == [2]


def test_ilike_escaped_literals(store):
    assert ids(store.table("t").select("*").ilike("name", r"%50\%%").execute()) == [1]
    assert ids(store.table("t").select("*").ilike("name", r"%e\_b").execute()) == [2]


def test_unique_violation_on_experiment_code():
    s = FakeSupabase()
    s.table("experiments").insert({"experiment_code": "STAB-105"}).execute()
    with pytest.raises(UniqueViolation, match="duplicate key value violates unique constraint"):
        s.table("experiments").insert({"experiment_code": "STAB-105"}).execute()
    assert s.count("experiments") == 1


def test_unique_violation_on_sample_per_experiment():
    s = FakeSupabase()
    s.table("samples").insert({"experiment_id": "e1", "sample_code": "B3"}).execute()
    s.table("samples").insert({"experiment_id": "e2", "sample_code": "B3"}).execute()
    with pytest.raises(UniqueViolation):
        s.table("samples").insert({"experiment_id": "e1", "sample_code": "B3"}).execute()


def test_seed_history_mirrors_the_sql_seed():
    # specs/006 T007: STAB-102's A17 is 4.4 at step 1 and 4.6 at step 3 (supabase/seed.sql).
    sb = seed_history(seeded_store())
    values = {m["value"] for m in sb.rows("measurements") if m["sample_id"] == "hist-2-A17"}
    assert values == {4.4, 4.6}
