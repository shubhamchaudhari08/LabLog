"""POST /tools — the single mutation endpoint.

Every state change in LabLog passes through here. There is no second write path,
and that invariant is what makes the audit trail complete rather than
aspirational and the ownership check one line rather than ten
(Constitution Principle I, contracts/tools-api.md).

Steps 1–6 below are the trust boundary. They exist because the arguments came
from a language model.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ValidationError

from ..db import load_experiment
from ..deps import User, get_current_user, supabase_admin
from ..tools import handlers
from ..tools.models import MUTATING_TOOLS, TOOL_REGISTRY

router = APIRouter()


class ToolCall(BaseModel):
    tool: str
    args: dict[str, Any] = {}
    experiment_id: str
    session_id: str | None = None


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
            errors=exc.errors(include_url=False),
        )

    sb = supabase_admin()

    # 4. Load the experiment.
    experiment = load_experiment(sb, body.experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="EXPERIMENT_NOT_FOUND")

    # 5. Explicit ownership check — ONCE, here, before dispatch.
    #
    #    The service role key bypasses row-level security by design, so Postgres
    #    enforces nothing on this path. This line is the only control. It lives
    #    in the dispatcher rather than in each of the ten handlers, because
    #    there one omission is one vulnerability (research.md R-006).
    if experiment.get("owner_id") != user.id:
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    # 6. Mutating tools require a RUNNING experiment.
    if body.tool in MUTATING_TOOLS and experiment.get("status") != "RUNNING":
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

    # 8. The handler writes the change and its audit event together.
    return handler(
        sb=sb,
        experiment=experiment,
        user_id=user.id,
        args=args,
        session_id=body.session_id,
    )
