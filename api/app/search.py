"""Experiment search: typed filters, periods resolved on the server (specs/006 R-404, R-405).

The model never writes a query or a date. It picks filters from
SearchExperimentsArgs, and this module turns "this week" into instants in the
user's time zone, which the browser sends on the /tools envelope. Only the
caller's own experiments are read. Nothing is written.

Kept outside tools/ so a History endpoint can call the same function later
(003 FR-241's intent; deferred by specs/006 R-407).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .resolve import _norm, readable_protocols

CAP = 25


def _zone(tz_name: str | None) -> tuple[Any, str]:
    """The user's zone, or UTC when it is missing or unknown."""
    if tz_name:
        try:
            return ZoneInfo(tz_name), tz_name
        except (ZoneInfoNotFoundError, ValueError, TypeError):
            pass
    return timezone.utc, "UTC"


def _day(d: datetime) -> str:
    # d.day, not %-d: strftime's no-padding flag does not exist on Windows.
    return f"{d:%a} {d.day} {d:%b}"


def _bounds(period: str, zone, now: datetime) -> tuple[datetime, datetime, str]:
    """[start, end) at local midnights, and the phrase the agent speaks."""
    local = now.astimezone(zone)
    today = datetime(local.year, local.month, local.day, tzinfo=zone)
    monday = today - timedelta(days=today.weekday())
    if period == "today":
        return today, today + timedelta(days=1), f"today ({_day(today)})"
    if period == "yesterday":
        start = today - timedelta(days=1)
        return start, today, f"yesterday ({_day(start)})"
    if period == "this_week":
        return monday, monday + timedelta(days=7), f"this week ({_day(monday)} to today)"
    if period == "last_week":
        start = monday - timedelta(days=7)
        return start, monday, f"last week ({_day(start)} to {_day(monday - timedelta(days=1))})"
    if period == "this_month":
        start = today.replace(day=1)
        end = (start + timedelta(days=32)).replace(day=1)
        return start, end, f"this month (since {start.day} {start:%b})"
    raise ValueError(f"unknown period {period!r}")


def _instant(experiment: dict[str, Any]) -> datetime | None:
    """A run's date for search: when it started, else when it was created."""
    raw = experiment.get("started_at") or experiment.get("created_at")
    if not raw:
        return None
    value = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _blank(value: str | None) -> str | None:
    return value if value and value.strip() else None


def search_experiments(sb, user_id: str, args, tz: str | None = None, now: datetime | None = None) -> dict[str, Any]:
    """The contract §2 `data`. Four reads, whatever the filters.

    ponytail: loads all of the user's experiments per search; move to a SQL
    function via .rpc() when a user has thousands.
    """
    now = now or datetime.now(timezone.utc)
    zone, tz_used = _zone(tz)

    rows = sb.table("experiments").select("*").eq("owner_id", user_id).execute().data or []
    protocols = {p["id"]: p for p in readable_protocols(sb, user_id)}
    ids = [r["id"] for r in rows]
    samples: list[dict[str, Any]] = []
    deviations: list[dict[str, Any]] = []
    if ids:
        samples = sb.table("samples").select("*").in_("experiment_id", ids).execute().data or []
        deviations = sb.table("deviations").select("*").in_("experiment_id", ids).execute().data or []

    sample_codes: dict[str, set[str]] = {}
    for s in samples:
        sample_codes.setdefault(s["experiment_id"], set()).add(_norm(s.get("sample_code")))
    devs: dict[str, list[str]] = {}
    for d in deviations:
        devs.setdefault(d["experiment_id"], []).append(
            _norm(" ".join(str(d.get(k) or "") for k in ("type", "description", "reason")))
        )

    words = _norm(_blank(args.text)).split()
    wanted_sample = _norm(_blank(args.sample_code))
    about = _norm(_blank(args.deviation_about))
    resolved = None
    if args.period:
        start, end, label = _bounds(args.period, zone, now)
        resolved = {"period": args.period, "start": start.isoformat(), "end": end.isoformat(),
                    "tz_used": tz_used, "label": label}

    def keep(e: dict[str, Any]) -> bool:
        if args.status and e.get("status") != args.status:
            return False
        if words:
            p = protocols.get(e.get("protocol_id")) or {}
            hay = _norm(" ".join(str(v or "") for v in (
                e.get("experiment_code"), e.get("name"), e.get("description"), p.get("protocol_code"), p.get("name"))))
            if not all(w in hay for w in words):
                return False
        if wanted_sample and wanted_sample not in sample_codes.get(e["id"], set()):
            return False
        mine = devs.get(e["id"], [])
        if args.has_deviations is not None and bool(mine) != args.has_deviations:
            return False
        if about and not any(about in d for d in mine):
            return False
        if resolved:
            at = _instant(e)
            if at is None or not (start <= at < end):
                return False
        return True

    matched = [e for e in rows if keep(e)]
    oldest = datetime.min.replace(tzinfo=timezone.utc)
    matched.sort(key=lambda e: _instant(e) or oldest, reverse=True)

    def brief(e: dict[str, Any]) -> dict[str, Any]:
        at = _instant(e)
        return {
            "experiment_id": e["id"],
            "experiment_code": e.get("experiment_code"),
            "name": e.get("name"),
            "protocol_code": (protocols.get(e.get("protocol_id")) or {}).get("protocol_code"),
            "status": e.get("status"),
            "run_date": at.astimezone(zone).date().isoformat() if at else None,
            "deviation_count": len(devs.get(e["id"], [])),
        }

    # "Open X" opens only an unambiguous match; otherwise the results are the
    # candidates the agent asks about (FR-411). The browser does the opening.
    opened = None
    if args.open and len(matched) == 1:
        only = matched[0]
        opened = {"experiment_id": only["id"], "experiment_code": only.get("experiment_code"), "status": only.get("status")}

    return {
        "results": [brief(e) for e in matched[:CAP]],
        "count": len(matched),
        "truncated": len(matched) > CAP,
        "resolved": resolved,
        "opened": opened,
    }
