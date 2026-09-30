"""search_experiments: typed filters, server-resolved periods (specs/006 US1, research R-404/R-405).

Search writes nothing, so every case checks the row counts are unchanged.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app import search
from app.tools.models import SearchExperimentsArgs
from tests.conftest import EXPERIMENT_ID, OTHER_USER_ID, OWNER_ID, PROTOCOL_ID, seed_history, seeded_store

TABLES = ("experiments", "samples", "measurements", "deviations", "events")
# Monday 03:00 UTC is still Sunday 21:00 in Denver (MDT, UTC-6).
FROZEN = datetime(2026, 9, 21, 3, 0, tzinfo=timezone.utc)
DENVER = "America/Denver"


def snapshot(sb):
    return tuple(sb.count(t) for t in TABLES)


@pytest.fixture
def sb():
    return seed_history(seeded_store())


def run(sb, tz=None, now=None, **filters):
    before = snapshot(sb)
    result = search.search_experiments(sb, OWNER_ID, SearchExperimentsArgs(**filters), tz, now=now)
    assert snapshot(sb) == before
    return result


def codes(result):
    return [r["experiment_code"] for r in result["results"]]


def add_run(sb, code, name="Run", *, started_at=None, created_at=None, owner=OWNER_ID,
            status="COMPLETED", protocol_id=PROTOCOL_ID, description=None):
    sb.tables["experiments"].append(
        {
            "id": f"x-{code}",
            "experiment_code": code,
            "name": name,
            "description": description,
            "protocol_id": protocol_id,
            "owner_id": owner,
            "status": status,
            "started_at": started_at,
            "created_at": created_at,
        }
    )


def add_deviation(sb, experiment_id, description, type_="procedure", reason=None):
    sb.tables["deviations"].append(
        {"id": f"d-{len(sb.rows('deviations'))}", "experiment_id": experiment_id,
         "type": type_, "description": description, "reason": reason}
    )


# -- no filters, shape -------------------------------------------------------


def test_no_filters_lists_every_run_newest_first(sb):
    result = run(sb)
    assert codes(result) == ["STAB-104", "STAB-102", "STAB-101", "STAB-100"]
    assert result["count"] == 4 and result["truncated"] is False
    assert result["resolved"] is None and result["opened"] is None


def test_result_rows_have_exactly_the_contract_keys(sb):
    row = run(sb, tz="UTC")["results"][0]
    assert set(row) == {"experiment_id", "experiment_code", "name", "protocol_code", "status", "run_date",
                        "deviation_count"}
    assert row["protocol_code"] == "STAB"
    datetime.strptime(row["run_date"], "%Y-%m-%d")


# -- text --------------------------------------------------------------------


def test_text_matches_every_word_in_any_order(sb):
    assert len(codes(run(sb, text="stability"))) == 4
    assert len(codes(run(sb, text="stability sample"))) == 4
    assert codes(run(sb, text="STAB-102")) == ["STAB-102"]


def test_text_pcr_matches_the_name(sb):
    assert codes(run(sb, text="PCR")) == []
    add_run(sb, "STAB-105", "PCR Amplification Check", started_at=datetime.now(timezone.utc).isoformat())
    assert codes(run(sb, text="PCR")) == ["STAB-105"]


def test_text_searches_the_protocol_name(sb):
    # "evaluation" is not in "PCR Amplification Check"; only its protocol matches.
    add_run(sb, "STAB-105", "PCR Amplification Check", started_at=datetime.now(timezone.utc).isoformat())
    assert "STAB-105" in codes(run(sb, text="evaluation"))
    add_run(sb, "NOPROTO-1", "PCR without protocol", protocol_id=None, created_at=FROZEN.isoformat())
    assert "NOPROTO-1" not in codes(run(sb, text="evaluation"))


def test_blank_text_is_no_filter(sb):
    assert len(codes(run(sb, text="   "))) == 4


# -- status, sample ----------------------------------------------------------


def test_status(sb):
    assert codes(run(sb, status="COMPLETED")) == ["STAB-102", "STAB-101", "STAB-100"]
    assert codes(run(sb, status="RUNNING")) == ["STAB-104"]


def test_sample_code_ignores_case(sb):
    assert len(codes(run(sb, sample_code="a17"))) == 4
    assert codes(run(sb, sample_code="B3")) == []


# -- deviations --------------------------------------------------------------


def test_has_deviations_true_and_false(sb):
    add_deviation(sb, EXPERIMENT_ID, "Sample temperature rose above 8 C during transfer")
    with_ = run(sb, has_deviations=True)
    assert codes(with_) == ["STAB-104"] and with_["results"][0]["deviation_count"] == 1
    assert codes(run(sb, has_deviations=False)) == ["STAB-102", "STAB-101", "STAB-100"]


def test_deviation_about_matches_type_description_or_reason(sb):
    add_deviation(sb, EXPERIMENT_ID, "Sample temperature rose above 8 C during transfer")
    assert codes(run(sb, deviation_about="temperature")) == ["STAB-104"]
    assert codes(run(sb, deviation_about="timing")) == []
    add_deviation(sb, "hist-1", "Step ran long", type_="timing")
    assert codes(run(sb, deviation_about="timing")) == ["STAB-101"]
    add_deviation(sb, "hist-0", "Transfer delayed", reason="Freezer TEMPERATURE alarm")
    assert codes(run(sb, deviation_about="temperature")) == ["STAB-104", "STAB-100"]


def test_combination(sb):
    assert codes(run(sb, text="stability", status="COMPLETED", sample_code="A17")) == [
        "STAB-102", "STAB-101", "STAB-100"]


# -- periods -----------------------------------------------------------------


def only_runs(sb, *runs):
    sb.tables["experiments"] = []
    for code, started in runs:
        add_run(sb, code, "Stability", started_at=started)


def test_this_week_follows_the_users_zone(sb):
    only_runs(sb, ("SUNDAY-EVE", "2026-09-20T23:00:00+00:00"))  # Sunday 17:00 in Denver
    denver = run(sb, tz=DENVER, now=FROZEN, period="this_week")
    assert denver["resolved"] == {
        "period": "this_week",
        "start": "2026-09-14T00:00:00-06:00",
        "end": "2026-09-21T00:00:00-06:00",
        "tz_used": DENVER,
        "label": "this week (Mon 14 Sep to today)",
    }
    assert codes(denver) == ["SUNDAY-EVE"]
    # In UTC it is already Monday, so Sunday evening was last week.
    assert codes(run(sb, tz="UTC", now=FROZEN, period="this_week")) == []
    assert codes(run(sb, tz="UTC", now=FROZEN, period="last_week")) == ["SUNDAY-EVE"]


@pytest.mark.parametrize(
    "period, start, end, label",
    [
        ("today", "2026-09-20T00:00:00-06:00", "2026-09-21T00:00:00-06:00", "today (Sun 20 Sep)"),
        ("yesterday", "2026-09-19T00:00:00-06:00", "2026-09-20T00:00:00-06:00", "yesterday (Sat 19 Sep)"),
        ("last_week", "2026-09-07T00:00:00-06:00", "2026-09-14T00:00:00-06:00", "last week (Mon 7 Sep to Sun 13 Sep)"),
        ("this_month", "2026-09-01T00:00:00-06:00", "2026-10-01T00:00:00-06:00", "this month (since 1 Sep)"),
    ],
)
def test_period_bounds_and_labels(sb, period, start, end, label):
    resolved = run(sb, tz=DENVER, now=FROZEN, period=period)["resolved"]
    assert (resolved["start"], resolved["end"], resolved["label"]) == (start, end, label)


def test_period_is_half_open(sb):
    only_runs(sb, ("AT-START", "2026-09-14T06:00:00+00:00"), ("AT-END", "2026-09-21T06:00:00+00:00"))
    assert codes(run(sb, tz=DENVER, now=FROZEN, period="this_week")) == ["AT-START"]


def test_run_date_is_start_else_creation(sb):
    sb.tables["experiments"] = []
    add_run(sb, "STARTED-THIS-WEEK", created_at="2026-09-10T12:00:00+00:00", started_at="2026-09-16T12:00:00+00:00")
    add_run(sb, "NEVER-STARTED", created_at="2026-09-17T12:00:00+00:00")
    add_run(sb, "NO-DATES")
    result = run(sb, tz=DENVER, now=FROZEN, period="this_week")
    assert codes(result) == ["NEVER-STARTED", "STARTED-THIS-WEEK"]
    assert result["results"][0]["run_date"] == "2026-09-17"
    assert "NO-DATES" in codes(run(sb, tz=DENVER, now=FROZEN))  # only a period excludes it


@pytest.mark.parametrize("tz", [None, "Not/AZone", "../etc", ""])
def test_bad_zone_falls_back_to_utc(sb, tz):
    assert run(sb, tz=tz, now=FROZEN, period="today")["resolved"]["tz_used"] == "UTC"


# -- cap, isolation ----------------------------------------------------------


def test_cap_is_25_with_the_full_count(sb):
    for n in range(30):
        add_run(sb, f"BULK-{n:02}", "Bulk run", created_at=(FROZEN - timedelta(hours=n)).isoformat())
    result = run(sb, text="bulk")
    assert len(result["results"]) == 25 and result["count"] == 30 and result["truncated"] is True
    assert codes(result)[0] == "BULK-00"


def test_other_users_runs_are_never_returned(sb):
    add_run(sb, "THEIRS-1", "Sample Stability Evaluation", owner=OTHER_USER_ID,
            started_at=datetime.now(timezone.utc).isoformat())
    assert "THEIRS-1" not in codes(run(sb, text="stability"))
    assert "THEIRS-1" not in codes(run(sb))


# -- open (specs/006 US3) ----------------------------------------------------


def test_open_with_one_match_names_it(sb):
    result = run(sb, text="STAB-102", open=True)
    assert result["opened"] == {"experiment_id": "hist-2", "experiment_code": "STAB-102", "status": "COMPLETED"}


def test_open_with_several_matches_opens_nothing(sb):
    result = run(sb, text="stability", open=True)
    assert result["opened"] is None and result["count"] == 4


def test_open_with_no_match_opens_nothing(sb):
    result = run(sb, text="PCR", open=True)
    assert result["opened"] is None and result["count"] == 0


def test_one_match_without_open_opens_nothing(sb):
    assert run(sb, text="STAB-102")["opened"] is None
