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

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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
            "What was measured: temperature, mass, volume, pH, concentration, "
            "duration, rpm, voltage, current, pressure, humidity, or another "
            "numeric type."
        ),
        json_schema_extra={"examples": ["temperature", "mass", "volume", "pH", "rpm"]},
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


# name -> (model, description that steers tool selection)
#
# Ten tools exactly. The documented ceiling for selection accuracy is ten, so a
# new tool must displace an existing one (research.md R-010).
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
}

# Tools that change state. The dispatcher requires a RUNNING experiment for
# these and permits the rest regardless of status.
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
