"""POST /tools — the single mutation endpoint.

Every state change in LabLog passes through here. There is no second write path,
and that invariant is what makes the audit trail complete rather than
aspirational and the ownership check one line rather than ten
(Constitution Principle I, contracts/tools-api.md).

Steps 1–6 below are the trust boundary. They exist because the arguments came
from a language model.
"""

from __future__ import annotations

import inspect
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError

from ..db import load_experiment
from ..deps import User, get_current_user, supabase_admin
from ..resolve import resolve_experiment
from ..tools import handlers
from ..tools.models import MUTATING_TOOLS, TOOL_REGISTRY, TOOL_SCOPE

router = APIRouter()


class ToolCall(BaseModel):
    tool: str
    args: dict[str, Any] = {}
    # Optional since specs/003 (desk profile): a session with no experiment open
    # can still create or start one. Tools that act on the bound experiment still
    # require it (contracts/tools-api-v2.md).
    experiment_id: str | None = None
    session_id: str | None = None
    # The browser's IANA zone (specs/006 contract §1). It only groups dates in
    # search; it never stamps a row, and it is not in args, so the model cannot set it.
    tz: str | None = None
    # The user's last committed transcript, stored as a reading's raw_spoken_value.
    # Outside args for the same reason as tz: the model cannot set it, so it can
    # never be a value the user did not say (voice-agent-stuck-actions).
    utterance: str | None = Field(None, max_length=2000)


def _fail(error: str, message: str, **detail: Any) -> dict[str, Any]:
    """Tool-level failure.

    Returned with HTTP 200 deliberately: a tool failure is a normal
    conversational outcome, not a transport error. `SAMPLE_NOT_FOUND` means the
    agent should ask a question — the system working correctly. Reserving
    non-2xx for genuine auth and transport failures lets the client tell "the
    agent must handle this" from "the request never landed" without parsing
    bodies.
    """
    body = {"success": False, "error": error, "message": message}
    if detail:
        body["detail"] = detail
    return body


@router.post("/tools")
async def call_tool(body: ToolCall, user: User = Depends(get_current_user)) -> dict[str, Any]:
    # 1. JWT verified by the dependency; a failure raised 401 before we got here.

    # 2. Known tool?
    if body.tool not in TOOL_REGISTRY:
        return _fail("UNKNOWN_TOOL", f"No tool named {body.tool}.")

    model, _description = TOOL_REGISTRY[body.tool]

    # 3. Structural validation. Proves the model produced well-formed arguments —
    #    NOT that it produced true ones. Semantic validation is the handler's job.
    try:
        args = model(**body.args)
    except ValidationError as exc:
        return _fail(
            "INVALID_ARGS",
            "The tool call was missing or misusing a required field.",
            errors=exc.errors(include_url=False, include_context=False),
        )

    sb = supabase_admin()
    scope = TOOL_SCOPE.get(body.tool, "experiment")

    # 4. Find the experiment the tool acts on, by scope.
    experiment: dict[str, Any] | None = None
    if scope == "experiment":
        if not body.experiment_id:
            return _fail("EXPERIMENT_REQUIRED", "No experiment is open. Create or start one first.")
        experiment = load_experiment(sb, body.experiment_id)
        if experiment is None:
            raise HTTPException(status_code=404, detail="EXPERIMENT_NOT_FOUND")
    elif scope == "experiment_ref":
        # 4a. Resolved among the caller's OWN experiments only, so another user's
        #     code reads as not found rather than confirming it exists.
        found = resolve_experiment(sb, user.id, args.experiment_ref)
        if "error" in found:
            return _fail(found["error"], found["message"], **found["detail"])
        experiment = found["experiment"]
    # scope == "user": no experiment; the handler filters every query by owner.

    # 5. Explicit ownership check — ONCE, here, before dispatch.
    #
    #    The service role key bypasses row-level security by design, so Postgres
    #    enforces nothing on this path. This line is the only control. It lives
    #    in the dispatcher rather than in each handler, because there one
    #    omission is one vulnerability (research.md R-006).
    if experiment is not None and experiment.get("owner_id") != user.id:
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    # 6. Mutating tools require a RUNNING experiment.
    if body.tool in MUTATING_TOOLS and experiment and experiment.get("status") != "RUNNING":
        return _fail(
            "EXPERIMENT_NOT_RUNNING",
            f"Experiment {experiment['experiment_code']} is "
            f"{str(experiment.get('status', 'unknown')).lower()}, so it cannot accept records.",
            status=experiment.get("status"),
        )

    # 7. Dispatch.
    handler = getattr(handlers, body.tool, None)
    if handler is None:  # registered but not yet implemented
        return _fail("UNKNOWN_TOOL", f"Tool {body.tool} is registered but not implemented.")

    # 8. The handler writes the change, then its audit event.
    #    ponytail: two PostgREST calls, not one transaction — a crash between them
    #    leaves a row without its event (the quickstart §1.4 query catches it).
    #    Move writes into a Postgres function called via .rpc() if that matters.
    accepts = inspect.signature(handler).parameters
    extra = {name: getattr(body, name) for name in ("tz", "utterance") if name in accepts}
    return handler(
        sb=sb,
        experiment=experiment,
        user_id=user.id,
        args=args,
        session_id=body.session_id,
        **extra,
    )
