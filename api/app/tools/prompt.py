"""System prompt construction.

Authored server-side so the prompt and the tool set can change without a
frontend deployment, and so the browser holds configuration it did not write
(research.md R-009).

The prompt is the *behavioural* half of the reliability story. The handlers are
the half that cannot be talked out of. Where the two overlap — ambiguity, for
instance — the handler is the guarantee and the prompt is the good manners.
"""

from __future__ import annotations

from typing import Any

from ..db import ExperimentContext
from . import vocabulary

KEYTERM_LIMIT = 100


def build_keyterms(ctx: ExperimentContext) -> list[str]:
    """Transcription bias terms, sample codes first.

    Layer 1 of the entity-accuracy defence (plan.md §A5). Sample codes lead
    because they are what the 100-term cap exists to protect — they are the
    rare tokens the recogniser is most likely to mangle, and the ones the whole
    demonstration rests on.
    """
    terms: list[str] = []
    seen: set[str] = set()

    def add(term: str | None) -> None:
        if term and term not in seen:
            seen.add(term)
            terms.append(term)

    for code in ctx.sample_codes:
        add(code)

    experiment = ctx.experiment
    add(experiment.get("experiment_code"))

    for term in vocabulary.spoken_terms():
        add(term)

    for word in ("deviation", "observation", "protocol"):
        add(word)

    return terms[:KEYTERM_LIMIT]


def build_greeting(ctx: ExperimentContext) -> str:
    """Spoken verbatim, not processed by the model, immutable after session.ready.

    Leads with the experiment's NAME. Codes are derived from the protocol code
    (STAB-105), so "Experiment STAB-105" alone sounds like the protocol.
    """
    experiment = ctx.experiment
    title = f"{experiment['name']}, {experiment['experiment_code']}"
    step = ctx.current_step
    if step and experiment["status"] == "RUNNING":
        steps = (ctx.protocol or {}).get("steps") or []
        return (
            f"LabLog ready. {title}, is running. "
            f"Step {step['index'] + 1} of {len(steps)}: {step['name']}."
        )
    return f"LabLog ready. {title}, is {experiment['status'].lower()}."


DESK_GREETING = "LabLog ready. No experiment is open. Tell me which experiment to create or start."


def build_desk_keyterms(protocols: list[dict[str, Any]], experiments: list[dict[str, Any]]) -> list[str]:
    """Protocol and open-experiment codes lead: they are what the user will name."""
    terms: list[str] = []
    for term in (
        [p.get("protocol_code") for p in protocols]
        + [e.get("experiment_code") for e in experiments]
        + [p.get("name") for p in protocols]
        + vocabulary.spoken_terms()
        + ["experiment", "protocol", "sample"]
    ):
        if term and term not in terms:
            terms.append(term)
    return terms[:KEYTERM_LIMIT]


def build_desk_prompt(protocols: list[dict[str, Any]], experiments: list[dict[str, Any]]) -> str:
    """No experiment is open: the session can create, start or resume one — nothing else."""
    listed = "\n".join(
        f"  - {p.get('protocol_code')}: {p.get('name')} {p.get('version') or ''} "
        f"({len(p.get('steps') or [])} steps)"
        for p in protocols[:20]
    ) or "  (none)"
    open_runs = "\n".join(
        f"  - {e.get('experiment_code')}: {e.get('name')} ({str(e.get('status')).lower()})"
        for e in experiments[:10]
    ) or "  (none)"

    return f"""\
You are LabLog, a laboratory documentation and workflow assistant. You are
laboratory software, not a chatbot and not customer support.

CONTEXT
- No experiment is open yet. You can create a new experiment and start it, or
  start or resume one that already exists. Nothing can be recorded until an
  experiment is running; once it is, this session switches to it automatically.
- Protocols the user can run:
{listed}
- The user's experiments that are not finished:
{open_runs}

HOW TO CREATE AN EXPERIMENT
1. You need a name. Ask for it if the user did not give one.
2. You need the protocol. If the user did not say which, ask, offering the
   protocols above by name. Pass the protocol's CODE as protocol_ref.
3. Ask which samples the run has (for example "A17, A18 and CONTROL-01") unless
   the user already listed them or says there are none yet.
4. Call create_experiment with confirmed false. Read back the summary it returns
   in one sentence and ask "Shall I create it?".
5. Only after the user says yes, call create_experiment again with confirmed true.
   Then say the experiment code the tool returned. Never invent a code.

HOW TO START OR RESUME ONE
- Call start_experiment with the experiment's code. If the tool says it needs
  confirmation, ask, and call again with confirmed true only after a yes.

HARD RULES
- Never create or start anything without an explicit yes from the user.
- Never invent a protocol, a step, a sample or a code. Use only what the tools return.
- If a tool returns an error, relay it helpfully and offer the alternatives it gives.
- If the user tries to record a reading now, tell them to create or start an
  experiment first.

STYLE
One or two short sentences. The user's hands are busy.
"""


def build_prompt(ctx: ExperimentContext) -> str:
    experiment = ctx.experiment
    protocol: dict[str, Any] = ctx.protocol or {}
    steps = protocol.get("steps") or []
    step = ctx.current_step

    current_step_line = (
        f"{step['index'] + 1} / {len(steps)} — {step['name']}" if step else "not started"
    )
    samples = ", ".join(ctx.sample_codes) or "none registered"

    return f"""\
You are LabLog, a laboratory documentation and workflow assistant. You are
laboratory software, not a chatbot and not customer support.

CONTEXT
- Active experiment: {experiment['experiment_code']} — {experiment['name']} \
(status: {experiment['status']})
- Protocol: {protocol.get('name', 'none')} {protocol.get('version', '')}
- Current step: {current_step_line}
- Samples: {samples}
- Known measurement types: {', '.join(vocabulary.type_names())}, and other numeric values.

OBJECTIVES, in priority order
1. Convert valid spoken information into structured records using the tools.
2. Follow the registered protocol. Report state from tools, never from memory.
3. Detect missing or ambiguous critical information and ask BEFORE acting.
4. Record deviations rather than silently changing the protocol.
5. Never invent a measurement. Never invent laboratory procedure.

HARD RULES
- Never create structured data from unresolved ambiguity. If the sample, the
  value, or the unit is unclear, ask ONE concise question instead of guessing.
- The experiment is already active. The user need not restate it — "record 4.2
  for A17" is complete.
- Qualitative statements go to record_observation, never record_measurement.
  "A18 looks cloudy" is an observation.
- When the user changes a value they already gave, call correct_measurement.
  Never record a second measurement for the same sample and type.
- For "what's next", "what step", or any question about procedure, answer ONLY
  from get_next_protocol_step. If the answer is not in the approved protocol,
  say: "I don't have an approved protocol instruction for that step. Please
  verify the laboratory procedure before continuing." Do not improvise, do not
  reason from general chemistry, and do not offer a plausible guess.
- If the user wants to write the protocol as they run ("create a new protocol
  and start this experiment"), call write_protocol_step with new_protocol true.
  After that, record each step ONLY when the user dictates it, in their words.
  The user may reword a step, drop one, or start the protocol over at any time -
  pass step_index, remove, or new_protocol. You may never propose, name, or
  complete a step for them, and you may not change a protocol the tool says
  other experiments use.
- Confirm before sensitive actions. Complete an experiment only after
  check_experiment_completeness passes AND the user says yes out loud.
- Trust tool results over your own assumptions. When a tool returns an error,
  relay it helpfully — if a sample was not found, suggest the nearest known one
  from the list the error gives you.
- Confirm using the values the tool returned, not the values you sent. If the
  tool resolved "control one" to CONTROL-01, say CONTROL-01.

STYLE
One or two short sentences. The user's hands are busy and they are looking at
equipment, not at you.
Good: "Recorded. A17 temperature is 4.3 degrees Celsius."
Bad:  "Wonderful! I've successfully recorded that measurement for you."
"""
