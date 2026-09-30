"""Test fixtures — in particular, a fake Supabase client.

Constitution, Development Workflow: "Validation logic MUST be unit-testable
without a live database." The validation layer is this product's central claim,
so it has to be testable cheaply and often. Handlers therefore accept `sb` as a
parameter and never construct a client; here we hand them a fake.

The fake stores rows in plain dicts and implements just enough of the
postgrest-py chaining API for the handlers to run unmodified.
"""

from __future__ import annotations

import copy
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

OWNER_ID = "11111111-1111-1111-1111-111111111111"
OTHER_USER_ID = "22222222-2222-2222-2222-222222222222"
EXPERIMENT_ID = "33333333-3333-3333-3333-333333333333"
PROTOCOL_ID = "44444444-4444-4444-4444-444444444444"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _like_regex(pattern: str) -> re.Pattern[str]:
    r"""SQL LIKE → regex. `%` and `_` are wildcards; `\%` and `\_` are literals."""
    out, i = [], 0
    while i < len(pattern):
        ch = pattern[i]
        if ch == "\\" and i + 1 < len(pattern):
            out.append(re.escape(pattern[i + 1]))
            i += 2
            continue
        out.append(".*" if ch == "%" else "." if ch == "_" else re.escape(ch))
        i += 1
    return re.compile("".join(out), re.IGNORECASE | re.DOTALL)


class UniqueViolation(Exception):
    """Carries the same message fragment as postgrest's APIError for code 23505."""


class _Result:
    def __init__(self, data: list[dict[str, Any]]):
        self.data = data


class _Query:
    """A chainable query over one in-memory table."""

    def __init__(self, store: "FakeSupabase", table: str):
        self._store = store
        self._table = table
        self._filters: list[tuple[str, str, Any]] = []
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None
        self._op: str | None = None
        self._payload: Any = None

    # -- verbs ---------------------------------------------------------------
    def select(self, *_columns: str) -> "_Query":
        self._op = "select"
        return self

    def insert(self, payload: dict[str, Any] | list[dict[str, Any]]) -> "_Query":
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload: dict[str, Any]) -> "_Query":
        self._op = "update"
        self._payload = payload
        return self

    def delete(self) -> "_Query":
        self._op = "delete"
        return self

    # -- filters -------------------------------------------------------------
    def eq(self, column: str, value: Any) -> "_Query":
        self._filters.append(("eq", column, value))
        return self

    def is_(self, column: str, value: Any) -> "_Query":
        self._filters.append(("is", column, value))
        return self

    def neq(self, column: str, value: Any) -> "_Query":
        self._filters.append(("neq", column, value))
        return self

    def in_(self, column: str, values: Any) -> "_Query":
        self._filters.append(("in", column, list(values)))
        return self

    def gte(self, column: str, value: Any) -> "_Query":
        self._filters.append(("gte", column, value))
        return self

    def lt(self, column: str, value: Any) -> "_Query":
        self._filters.append(("lt", column, value))
        return self

    def ilike(self, column: str, pattern: str) -> "_Query":
        self._filters.append(("ilike", column, _like_regex(pattern)))
        return self

    def order(self, column: str, desc: bool = False) -> "_Query":
        self._order = (column, desc)
        return self

    def limit(self, count: int) -> "_Query":
        self._limit = count
        return self

    # -- execution -----------------------------------------------------------
    def _matches(self, row: dict[str, Any]) -> bool:
        for kind, column, value in self._filters:
            if kind == "eq":
                if row.get(column) != value:
                    return False
            elif kind == "is":
                wanted_null = value in (None, "null", "NULL")
                if wanted_null != (row.get(column) is None):
                    return False
            elif kind == "neq":
                if row.get(column) == value:
                    return False
            elif kind == "in":
                if row.get(column) not in value:
                    return False
            elif kind in ("gte", "lt"):
                # Postgres drops NULLs from range comparisons; so do we.
                cell = row.get(column)
                if cell is None or (cell < value if kind == "gte" else cell >= value):
                    return False
            elif kind == "ilike":
                if not value.fullmatch(str(row.get(column) or "")):
                    return False
        return True

    def execute(self) -> _Result:
        rows = self._store.tables.setdefault(self._table, [])

        if self._op == "insert":
            payloads = self._payload if isinstance(self._payload, list) else [self._payload]
            for payload in payloads:
                self._store._check_unique(self._table, payload, rows)
            inserted = []
            for payload in payloads:
                row = dict(payload)
                row.setdefault("id", str(uuid.uuid4()))
                # The database supplies these defaults; a handler that tried to
                # set them would be violating Constitution Principle I.
                for column in ("recorded_at", "created_at"):
                    if column in self._store.timestamp_columns.get(self._table, ()):
                        row.setdefault(column, _now())
                rows.append(row)
                inserted.append(row)
            return _Result(inserted)

        matched = [r for r in rows if self._matches(r)]

        if self._op == "update":
            for row in matched:
                row.update(self._payload)
            return _Result(matched)

        if self._op == "delete":
            self._store.tables[self._table] = [r for r in rows if r not in matched]
            return _Result(matched)

        if self._order:
            column, desc = self._order
            matched = sorted(matched, key=lambda r: r.get(column) or "", reverse=desc)
        if self._limit is not None:
            matched = matched[: self._limit]
        return _Result([dict(r) for r in matched])


class FakeSupabase:
    timestamp_columns = {
        "measurements": ("recorded_at",),
        "observations": ("recorded_at",),
        "deviations": ("created_at",),
        "experiments": ("created_at",),
        "samples": ("created_at",),
        "events": ("created_at",),
    }

    # Unique constraints from 0001_init.sql that handlers must survive colliding with.
    unique: dict[str, list[tuple[str, ...]]] = {
        "experiments": [("experiment_code",)],
        "samples": [("experiment_id", "sample_code")],
        # 0003_step_scoped_completeness.sql: partial, WHERE source_key IS NOT NULL.
        "deviations": [("experiment_id", "source_key")],
    }

    def __init__(self) -> None:
        self.tables: dict[str, list[dict[str, Any]]] = {}

    def _check_unique(self, table: str, payload: dict[str, Any], rows: list[dict[str, Any]]) -> None:
        for columns in self.unique.get(table, []):
            key = tuple(payload.get(c) for c in columns)
            if None in key:  # Postgres: NULLs never collide in a unique index
                continue
            if any(tuple(r.get(c) for c in columns) == key for r in rows):
                raise UniqueViolation(
                    f'duplicate key value violates unique constraint "{table}_{"_".join(columns)}_key"'
                )

    def table(self, name: str) -> _Query:
        return _Query(self, name)

    # -- convenience for assertions -----------------------------------------
    def rows(self, table: str) -> list[dict[str, Any]]:
        return self.tables.setdefault(table, [])

    def count(self, table: str) -> int:
        return len(self.rows(table))


PROTOCOL_STEPS = [
    {"index": 0, "id": "register", "name": "Register samples", "required_fields": []},
    {
        "index": 1,
        "id": "initial_temp",
        "name": "Record initial temperature",
        "required_fields": ["sample_id", "temperature"],
        "default_unit": {"temperature": "C"},
    },
    {"index": 2, "id": "prep_complete", "name": "Mark preparation complete", "required_fields": []},
    {
        "index": 3,
        "id": "second_temp",
        "name": "Record second temperature",
        "required_fields": ["sample_id", "temperature"],
        "default_unit": {"temperature": "C"},
    },
    {"index": 4, "id": "observation", "name": "Add visual observation", "required_fields": []},
    {"index": 5, "id": "complete", "name": "Complete evaluation", "required_fields": []},
]

# specs/004-step-timers: PROTOCOL_STEPS with one timed step (index 2) and one
# range step (index 4). Everything else is unchanged.
TIMED_STEPS = [
    *PROTOCOL_STEPS[:2],
    {"index": 2, "id": "spin", "name": "Centrifuge at 4,000 rpm for 10 minutes", "required_fields": []},
    PROTOCOL_STEPS[3],
    {"index": 4, "id": "incubate", "name": "Incubate 10-15 min", "required_fields": []},
    PROTOCOL_STEPS[5],
]


def _reading_step(index, code, name, measurement_type, *, unit=None, low=None, high=None):
    """A structured measurement step. `required_fields`/`default_unit` are kept too,
    so the web's step view (which reads them) shows the reading."""
    requirement = {"type": "measurement", "measurement_type": measurement_type, "scope": "all_samples", "min": low, "max": high}
    if unit:
        requirement["unit"] = unit
    step = {"index": index, "id": code, "name": name, "required_fields": ["sample_id", measurement_type], "requirements": [requirement]}
    if unit:
        step["default_unit"] = {measurement_type: unit}
    return step


# specs/007: "Sample Stability Evaluation v1.0", mirrored by supabase/seed.sql.
STABILITY_STEPS = [
    {
        "index": 0, "id": "REGISTER_SAMPLES", "name": "Register samples", "required_fields": [],
        "requirements": [
            {"type": "samples", "sample_type": "test", "count": 2},
            {"type": "samples", "sample_type": "control", "count": 1},
        ],
    },
    _reading_step(1, "INITIAL_TEMP", "Record initial temperature", "temperature", unit="C", low=2, high=8),
    _reading_step(2, "INITIAL_PH", "Record initial pH", "pH", low=6.5, high=7.5),
    {"index": 3, "id": "INITIAL_APPEARANCE", "name": "Record initial appearance", "required_fields": [],
     "requirements": [{"type": "observation", "scope": "all_samples"}]},
    {"index": 4, "id": "START_HOLD", "name": "Start stability hold", "required_fields": []},
    {
        "index": 5, "id": "STABILITY_HOLD", "name": "Stability hold", "required_fields": [],
        "expected_duration_seconds": 900, "min_duration_seconds": 840, "max_duration_seconds": 1020,
        "requirements": [{"type": "step_execution", "must_start": True, "must_complete": True}],
    },
    _reading_step(6, "FINAL_TEMP", "Record final temperature", "temperature", unit="C", low=2, high=8),
    _reading_step(7, "FINAL_PH", "Record final pH", "pH", low=6.5, high=7.5),
    {"index": 8, "id": "FINAL_APPEARANCE", "name": "Record final appearance", "required_fields": [],
     "requirements": [{"type": "observation", "scope": "all_samples"}]},
    {"index": 9, "id": "REVIEW_DEVIATIONS", "name": "Review deviations", "required_fields": [],
     "requirements": [{"type": "deviation_review"}]},
    {"index": 10, "id": "COMPLETE", "name": "Complete experiment", "required_fields": []},
]


def stability_store() -> FakeSupabase:
    """STAB-104 on Sample Stability Evaluation v1.0 at step 2 (index 1); A17, A18 test, CONTROL-01 control."""
    store = seeded_store()
    protocol = store.rows("protocols")[0]
    protocol.update(steps=copy.deepcopy(STABILITY_STEPS), version="v1.0")  # tests may edit their copy
    for sample in store.rows("samples"):
        if sample["sample_type"] == "experimental":
            sample["sample_type"] = "test"
    return store


def seeded_store() -> FakeSupabase:
    """A seeded fake database: STAB-104 RUNNING at step 1 with three samples.

    Plain function (not only a fixture) so eval/run.py can drive the real handlers
    against the same state.
    """
    store = FakeSupabase()

    store.tables["protocols"] = [
        {
            "id": PROTOCOL_ID,
            "protocol_code": "STAB",
            "name": "Sample Stability Evaluation",
            "version": "v1",
            "steps": PROTOCOL_STEPS,
            "owner_id": None,
        }
    ]
    store.tables["experiments"] = [
        {
            "id": EXPERIMENT_ID,
            "experiment_code": "STAB-104",
            "name": "Sample Stability Evaluation Run 104",
            "protocol_id": PROTOCOL_ID,
            "owner_id": OWNER_ID,
            "status": "RUNNING",
            "current_step_index": 1,
            "started_at": (datetime.now(timezone.utc) - timedelta(minutes=35)).isoformat(),
            "completed_at": None,
        }
    ]
    store.tables["samples"] = [
        {
            "id": "a17-0000-0000-0000-000000000001",
            "experiment_id": EXPERIMENT_ID,
            "sample_code": "A17",
            "sample_type": "experimental",
            "status": "active",
        },
        {
            "id": "a18-0000-0000-0000-000000000002",
            "experiment_id": EXPERIMENT_ID,
            "sample_code": "A18",
            "sample_type": "experimental",
            "status": "active",
        },
        {
            "id": "ctrl-0000-0000-0000-000000000003",
            "experiment_id": EXPERIMENT_ID,
            "sample_code": "CONTROL-01",
            "sample_type": "control",
            "status": "active",
        },
    ]
    store.tables["measurements"] = []
    store.tables["observations"] = []
    store.tables["deviations"] = []
    store.tables["events"] = []
    return store


def seed_history(sb: FakeSupabase) -> FakeSupabase:
    """STAB-100..102 COMPLETED on the same protocol, as supabase/seed.sql:88-125 (specs/006).

    Plain function, so eval/run.py can seed the same history. Values are rounded:
    4.2 + 0.4 is 4.6000000000000005 in float, which a real numeric column never stores.
    """
    now = datetime.now(timezone.utc)
    for i in range(3):
        exp_id = f"hist-{i}"
        started = now - timedelta(days=14 - i * 4)
        sb.tables["experiments"].append(
            {
                "id": exp_id,
                "experiment_code": f"STAB-10{i}",
                "name": f"Sample Stability Evaluation Run 10{i}",
                "protocol_id": PROTOCOL_ID,
                "owner_id": OWNER_ID,
                "status": "COMPLETED",
                "current_step_index": 5,
                "created_at": started.isoformat(),
                "started_at": started.isoformat(),
                "completed_at": (started + timedelta(minutes=52)).isoformat(),
            }
        )
        for code in ("A17", "A18", "CONTROL-01"):
            sample_id = f"hist-{i}-{code}"
            sb.tables["samples"].append(
                {
                    "id": sample_id,
                    "experiment_id": exp_id,
                    "sample_code": code,
                    "sample_type": "control" if code == "CONTROL-01" else "experimental",
                    "status": "active",
                }
            )
            base = 4.0 if code == "CONTROL-01" else 4.0 + i * 0.1
            for offset, step, minutes in ((0.2, 1, 12), (0.4, 3, 38)):
                sb.tables["measurements"].append(
                    {
                        "id": f"{sample_id}-s{step}",
                        "experiment_id": exp_id,
                        "sample_id": sample_id,
                        "measurement_type": "temperature",
                        "value": round(base + offset, 1),
                        "unit": "C",
                        "protocol_step_index": step,
                        "superseded_by": None,
                        "created_by": OWNER_ID,
                        "recorded_at": (started + timedelta(minutes=minutes)).isoformat(),
                    }
                )
    return sb


@pytest.fixture
def sb() -> FakeSupabase:
    return seeded_store()


@pytest.fixture
def experiment(sb: FakeSupabase) -> dict[str, Any]:
    return sb.rows("experiments")[0]
