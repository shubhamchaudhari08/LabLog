"""Tool argument models — the single source of truth.

These Pydantic models generate both the JSON Schema the agent sees and the
validation the handler runs (Constitution Principle IV). Hand-maintained
parallel definitions drift, and the drift is invisible: the agent sends what the
schema promised, the handler rejects it, and it reads as a model failure.

NOTE: no model declares a timestamp field. That is not an omission — it is how
FR-006 is enforced structurally. A caller cannot supply a time because there is
nowhere to put one.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from . import vocabulary


class _Args(BaseModel):
    """Reject unknown keys rather than silently dropping them.

    A model that invents an argument is telling us something — usually that a
    description is ambiguous. Silently ignoring it hides that signal.
    """

    model_config = ConfigDict(extra="forbid")


class NoArgs(_Args):
    pass


class RecordMeasurementArgs(_Args):
    sample_code: str = Field(
        ...,
        description="Sample identifier within the active experiment.",
        json_schema_extra={"examples": ["A17", "A18", "CONTROL-01"]},
    )
    measurement_type: str = Field(
        ...,
        description=(
            f"What was measured: {', '.join(vocabulary.type_names())}, or another "
            "numeric type."
        ),
        json_schema_extra={"examples": vocabulary.type_names()[:5]},
    )
    # Deliberately NOT a closed enum. A closed enum would make the agent coerce
    # an unlisted type into a listed one — data corruption disguised as a
    # validation success (data-model.md §Measurement type vocabulary).
    value: float = Field(..., description="The numeric value. Must be finite.")
    unit: str | None = Field(
        None,
        description=(
            "Unit of measure. Omit only when the protocol step resolves it. "
            "If you are unsure, ask rather than guessing."
        ),
        json_schema_extra={"examples": ["C", "F", "g", "mL", "rpm", "pH"]},
    )
    raw_spoken_value: str | None = Field(
        None, description="Verbatim transcription of what the user said."
    )


class CorrectMeasurementArgs(_Args):
    sample_code: str = Field(
        ..., json_schema_extra={"examples": ["A17", "A18", "CONTROL-01"]}
    )
    measurement_type: str = Field(..., json_schema_extra={"examples": ["temperature", "pH"]})
    new_value: float = Field(..., description="The corrected numeric value. Must be finite.")
    reason: str = Field("Voice correction", description="Why the value is being corrected.")


class RecordObservationArgs(_Args):
    observation: str = Field(..., description="The qualitative observation, in the user's words.")
    sample_code: str | None = Field(
        None, description="Sample this concerns, if it concerns one in particular."
    )


class CreateDeviationArgs(_Args):
    description: str = Field(..., description="What diverged from the protocol.")
    reason: str | None = Field(None, description="Why it diverged, if the user said.")
    type: Literal["timing", "procedure", "other"] | None = None
    severity: Literal["low", "medium", "high"] = "medium"


class CompleteProtocolStepArgs(_Args):
    step_id: str | None = Field(
        None, description="Step to complete. Defaults to the current step."
    )


class WriteProtocolStepArgs(_Args):
    name: str | None = Field(
        None,
        description=(
            "The step exactly as the user dictated it. Omit ONLY when starting a "
            "new protocol before the user has said what the first step is, or "
            "when changing a step's required_fields and nothing else."
        ),
        json_schema_extra={"examples": ["Record initial temperature", "Incubate at 37 C"]},
    )
    step_index: int | None = Field(
        None,
        description=(
            "Zero-based index of an EXISTING step to change or remove. Omit to "
            "append a new step at the end. Step 1 spoken aloud is index 0."
        ),
        ge=0,
    )
    remove: bool = Field(
        False, description="Delete the step at step_index instead of changing it."
    )
    required_fields: list[str] | None = Field(
        None,
        description=(
            "Measurement types this step requires for every sample, if the user "
            "said so. Omit when they did not."
        ),
        json_schema_extra={"examples": [["temperature"], ["mass", "pH"]]},
    )
    new_protocol: bool = Field(
        False,
        description=(
            "True only when the user asked for a new protocol for this run, or to "
            "discard the one being written and start over. Opens an empty "
            "protocol and starts the experiment; the discarded one is kept."
        ),
    )
    protocol_name: str | None = Field(
        None, description="Name for the new protocol, if the user gave one."
    )


class GetSampleHistoryArgs(_Args):
    sample_code: str = Field(..., json_schema_extra={"examples": ["A17", "CONTROL-01"]})


class CompleteExperimentArgs(_Args):
    confirmed: bool = Field(
        ...,
        description=(
            "True only after the user has explicitly confirmed out loud. "
            "Never set this from inference."
        ),
    )


class CreateExperimentArgs(_Args):
    """Desk mode: create (and usually start) an experiment by voice. specs/003 contracts/tools-api-v2.md."""

    name: str = Field(..., min_length=1, max_length=200, description="The experiment name, as the user said it.")
    protocol_ref: str | None = Field(
        None,
        description=(
            "The protocol to run: its code from list_protocols (preferred), or its name. "
            "Omit only if the user wants to dictate a new protocol."
        ),
        json_schema_extra={"examples": ["STAB"]},
    )
    sample_codes: list[str] | None = Field(
        None,
        max_length=50,
        description="Sample identifiers the user listed, e.g. A17, A18, CONTROL-01.",
        json_schema_extra={"examples": [["A17", "A18", "CONTROL-01"]]},
    )
    description: str | None = Field(None, max_length=2000)
    start: bool = Field(
        True,
        description="Start it running as soon as it is created. False only if the user said not to start yet.",
    )
    confirmed: bool = Field(
        ...,
        description=(
            "False on the first call: the tool returns a summary to read back. True only after "
            "the user has explicitly agreed out loud."
        ),
    )


class StartExperimentArgs(_Args):
    experiment_ref: str = Field(
        ...,
        description="The experiment's code (e.g. STAB-105) or its exact name.",
        json_schema_extra={"examples": ["STAB-105"]},
    )
    confirmed: bool = Field(
        ..., description="True only after the user has explicitly confirmed out loud."
    )


# name -> (model, description that steers tool selection)
#
# The ceiling is per session configuration, not per registry (constitution
# amendment A-1): see PROFILES below. The bench set is eleven — write_protocol_step
# carries append/edit/remove/restart on one signature rather than spending four
# slots; if selection accuracy drops, fold get_sample_history into
# get_active_experiment.
TOOL_REGISTRY: dict[str, tuple[type[_Args], str]] = {
    "get_active_experiment": (
        NoArgs,
        "Return the current experiment context: code, status, protocol, current "
        "step and sample codes. Call once at the start of the session.",
    ),
    "record_measurement": (
        RecordMeasurementArgs,
        "Record ONE numeric measurement for a known sample. Do not call if the "
        "sample, the value, or (when it cannot be resolved from the protocol) "
        "the unit is missing — ask instead.",
    ),
    "correct_measurement": (
        CorrectMeasurementArgs,
        "Correct the most recent measurement for a sample. Never deletes; "
        "supersedes and preserves history. Use this whenever the user changes a "
        "value they already gave.",
    ),
    "record_observation": (
        RecordObservationArgs,
        "Record a non-numeric textual observation. Never store an observation as "
        "a measurement.",
    ),
    "create_deviation": (
        CreateDeviationArgs,
        "Log a divergence from the protocol, with a description and a reason if "
        "the user gave one.",
    ),
    "get_next_protocol_step": (
        NoArgs,
        "Return the next approved protocol step from stored state. This is the "
        "ONLY source for what comes next. Never invent steps.",
    ),
    "complete_protocol_step": (
        CompleteProtocolStepArgs,
        "Mark the current protocol step complete and advance to the next.",
    ),
    "write_protocol_step": (
        WriteProtocolStepArgs,
        "Write this experiment's protocol while the run is happening: append the "
        "step the user just dictated (no step_index), reword or re-scope an "
        "existing one (step_index), drop one (step_index + remove), or start the "
        'protocol over (new_protocol). "Create a new protocol and start this '
        'experiment" is new_protocol true. Never propose a step yourself.',
    ),
    "get_sample_history": (
        GetSampleHistoryArgs,
        "Return recorded measurements and observations for one sample.",
    ),
    "check_experiment_completeness": (
        NoArgs,
        "Return whether every protocol-required field has been recorded, and "
        "list what is missing. Call this before completing an experiment.",
    ),
    "complete_experiment": (
        CompleteExperimentArgs,
        "Mark the experiment COMPLETED. Only after the completeness check passes "
        "AND the user has explicitly confirmed.",
    ),
    # -- desk profile: no experiment open (specs/003, amendment A-1) ---------
    "list_protocols": (
        NoArgs,
        "List the protocols the user can run, with their codes. Use it when they ask "
        "what protocols exist or have not said which one to use.",
    ),
    "create_experiment": (
        CreateExperimentArgs,
        "Create a new experiment, and start it unless the user says not to. Ask for the "
        "protocol and the samples if they were not given. Call with confirmed false first, "
        "read the summary back, and call again with confirmed true only after an explicit yes.",
    ),
    "start_experiment": (
        StartExperimentArgs,
        "Start (or resume) an existing experiment by its code or name. Only after the user "
        "explicitly confirms out loud.",
    ),
}

# Which experiment a tool acts on, resolved by the dispatcher BEFORE dispatch
# (contracts/tools-api-v2.md):
#   experiment      — the session's bound experiment (experiment_id)
#   experiment_ref  — resolved from args.experiment_ref among the caller's own
#   user            — none; the handler filters every query by owner
TOOL_SCOPE: dict[str, str] = {
    **{name: "experiment" for name in TOOL_REGISTRY},
    "list_protocols": "user",
    "create_experiment": "user",
    "start_experiment": "experiment_ref",
}

# Session profiles: what one session configuration exposes (amendment A-1, ≤12).
#   desk  — no experiment open: create, start or resume one
#   bench — an experiment is bound: exactly the MVP set, unchanged
PROFILES: dict[str, tuple[str, ...]] = {
    "desk": ("list_protocols", "create_experiment", "start_experiment"),
    "bench": (
        "get_active_experiment",
        "record_measurement",
        "correct_measurement",
        "record_observation",
        "create_deviation",
        "get_next_protocol_step",
        "complete_protocol_step",
        "write_protocol_step",
        "get_sample_history",
        "check_experiment_completeness",
        "complete_experiment",
    ),
}

# Tools that change state. The dispatcher requires a RUNNING experiment for
# these and permits the rest regardless of status.
#
# write_protocol_step is deliberately absent: it is what *starts* a DRAFT
# experiment, so gating it on RUNNING would make it unreachable. It enforces its
# own, looser rule (not COMPLETED, not CANCELLED) in the handler.
MUTATING_TOOLS: frozenset[str] = frozenset(
    {
        "record_measurement",
        "correct_measurement",
        "record_observation",
        "create_deviation",
        "complete_protocol_step",
        "complete_experiment",
    }
)


# ---------------------------------------------------------------------------
# POST /protocols — a protocol written from the Protocols screen, not a tool.
#
# Unknown keys are IGNORED here, unlike _Args: a browser that sends back
# `index`, `id`, `owner_id` or `created_at` must not get to set them, and the
# server derives all four itself (specs/002 FR-105, contracts/protocols-api.md).
# ---------------------------------------------------------------------------


def _text(min_length: int, max_length: int):
    return Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)
    ]


class _Request(BaseModel):
    model_config = ConfigDict(extra="ignore")


class ReadingIn(_Request):
    type: _text(1, 40)
    unit: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None

    @field_validator("unit")
    @classmethod
    def _blank_is_none(cls, value: str | None) -> str | None:
        return value or None


class ProtocolStepIn(_Request):
    name: _text(1, 200)
    readings: list[ReadingIn] = Field(default_factory=list, max_length=20)


class CreateProtocolRequest(_Request):
    protocol_code: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            min_length=2,
            max_length=32,
            pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]*$",
        ),
    ]
    name: _text(1, 200)
    version: _text(1, 20) = "v1"
    # ponytail: 200 is an abuse guard on a JSONB column, not a product limit.
    steps: list[ProtocolStepIn] = Field(min_length=1, max_length=200)
