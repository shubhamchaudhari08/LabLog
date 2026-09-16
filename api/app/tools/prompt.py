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

MEASUREMENT_VOCABULARY = [
    "temperature",
    "mass",
    "volume",
    "pH",
    "concentration",
    "duration",
    "rpm",
    "voltage",
    "current",
    "pressure",
    "humidity",
]

UNIT_VOCABULARY = [
    "Celsius",
    "Fahrenheit",
    "grams",
    "milligrams",
    "milliliters",
    "liters",
    "RPM",
    "volts",
    "minutes",
    "seconds",
]

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

    for term in MEASUREMENT_VOCABULARY + UNIT_VOCABULARY:
        add(term)

    for word in ("deviation", "observation", "protocol"):
        add(word)

    return terms[:KEYTERM_LIMIT]


def build_greeting(ctx: ExperimentContext) -> str:
    """Spoken verbatim, not processed by the model, immutable after session.ready."""
    experiment = ctx.experiment
    step = ctx.current_step
    if step:
        steps = (ctx.protocol or {}).get("steps") or []
        return (
            f"LabLog ready. Experiment {experiment['experiment_code']} is running, "
            f"step {step['index'] + 1} of {len(steps)}: {step['name']}."
        )
    return f"LabLog ready. Experiment {experiment['experiment_code']} is {experiment['status'].lower()}."


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
- Known measurement types: {', '.join(MEASUREMENT_VOCABULARY)}, and other numeric values.

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
