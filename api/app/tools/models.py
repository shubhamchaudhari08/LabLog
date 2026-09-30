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

import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, field_validator, model_validator

from . import vocabulary
from .requirements import MeasurementRequirement, Requirement, canonical_type


class _Args(BaseModel):
    """Reject unknown keys rather than silently dropping them.

    A model that invents an argument is telling us something — usually that a
    description is ambiguous. Silently ignoring it hides that signal.
    """

    model_config = ConfigDict(extra="forbid")


class NoArgs(_Args):
    pass


# "for step 4": which earlier step a late record belongs to, as spoken (1-based).
# Only a step already reached; the record keeps the server's time and its event
# says it was late (.specify/bugs/observations-not-counted).
_STEP_NUMBER_DESCRIPTION = (
    "Only when the user says the record is for an earlier step (step 4 is 4), to fill in "
    "what that step is missing. Omit to record at the current step."
)


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
            "The unit exactly as the user said it; the tool stores the protocol's spelling. "
            "Omit only when the user said no unit. If you are unsure, ask rather than guessing."
        ),
        # Spoken forms first: a value the user did not say (C for "Celsius")
        # makes the voice agent drop the call (specs/007 R-716).
        json_schema_extra={"examples": ["Celsius", "degrees Celsius", "degrees", "grams", "mL", "rpm", "pH"]},
    )
    # No raw_spoken_value here: asking the model to transcribe the user invited
    # text the user did not say, and the voice agent drops such a call. The
    # transcript rides in the /tools envelope instead (`utterance`), like `tz`
    # (.specify/bugs/voice-agent-stuck-actions).
    step_number: int | None = Field(None, ge=1, description=_STEP_NUMBER_DESCRIPTION)


class CorrectMeasurementArgs(_Args):
    sample_code: str = Field(
        ..., json_schema_extra={"examples": ["A17", "A18", "CONTROL-01"]}
    )
    measurement_type: str = Field(..., json_schema_extra={"examples": ["temperature", "pH"]})
    new_value: float = Field(..., description="The corrected numeric value. Must be finite.")
    reason: str = Field(
        "Voice correction",
        description="Why the value is being corrected, in the user's words. Omit unless the user said why.",
    )


class RecordObservationArgs(_Args):
    observation: str = Field(..., description="The qualitative observation, in the user's words.")
    sample_code: str | None = Field(
        None,
        description="The one sample this concerns. Omit for a note about the whole run, or with all_samples.",
    )
    # "All samples are clear" was stored as one run-level note, which satisfies no
    # sample's "observation for every sample" (.specify/bugs/observations-not-counted).
    all_samples: bool = Field(
        False,
        description=(
            "True when the user says the observation applies to every sample, e.g. "
            '"all samples are clear". Records it once per sample.'
        ),
    )
    step_number: int | None = Field(None, ge=1, description=_STEP_NUMBER_DESCRIPTION)


class CreateDeviationArgs(_Args):
    description: str = Field(..., description="What diverged from the protocol, in the user's words.")
    reason: str | None = Field(None, description="Why it diverged, if the user said.")
    type: Literal["timing", "procedure", "other"] | None = Field(
        None, description="Only if the user named the kind of deviation. Omit otherwise."
    )
    severity: Literal["low", "medium", "high"] = Field(
        "medium", description="Only if the user said how severe it is. Omit otherwise."
    )


class CompleteProtocolStepArgs(_Args):
    # Always the current step. A `step_id` argument was never read, and the model
    # filled it with codes the user did not say (voice-agent-stuck-actions).
    # specs/004 FR-320. Named without "time": no argument may look like a
    # caller-supplied timestamp (test_no_tool_accepts_a_timestamp).
    confirmed_early: bool = Field(
        False,
        description=(
            "True only after the user, told a timer for this step is still running, "
            "said to complete the step anyway."
        ),
    )
    # Owner decision 2026-09-30: a step with required readings missing asks first
    # (STEP_INCOMPLETE), like a running timer does. Skipping never satisfies it.
    confirmed_incomplete: bool = Field(
        False,
        description=(
            "True only after the user, told which readings this step is missing, "
            "said to complete the step anyway."
        ),
    )
    # specs/007 R-706: the review rides on this tool because bench is at the
    # twelve-tool cap. Away from the review step it records the review only.
    deviations_reviewed: bool = Field(
        False,
        description=(
            "True when the user says the deviations have been reviewed. Records the "
            "review; it completes a step only when the current step is the review step."
        ),
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
    # The number as spoken ("step 2" is 2). A zero-based index made the model
    # pass a number the user never said (voice-agent-stuck-actions).
    step_number: int | None = Field(
        None,
        description=(
            "The number of an EXISTING step to change or remove, as the user said "
            "it (step 2 is 2). Omit to append a new step at the end."
        ),
        ge=1,
    )
    remove: bool = Field(
        False, description="Delete the step at step_number instead of changing it."
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


class StepTimerArgs(_Args):
    """A countdown on the experiment's current step (specs/004-step-timers contracts/tools-step-timer.md).

    A duration, never a time: the server sets the start and end (Principle I).
    Zero and negative values pass this model on purpose. The handler rejects
    them as DURATION_OUT_OF_RANGE, which tells the agent the allowed range.
    """

    action: Literal["start", "cancel", "status"]
    duration_value: float | None = Field(
        None,
        description="How long, as the user said it. Omit when the user gave no duration.",
        json_schema_extra={"examples": [10, 1.5, 90]},
    )
    duration_unit: Literal["seconds", "minutes", "hours"] | None = Field(
        None, json_schema_extra={"examples": ["minutes", "hours", "seconds"]}
    )
    replace: bool = Field(False, description="True only after the user agreed to replace the running timer.")

    @model_validator(mode="after")
    def _duration_is_whole(self) -> "StepTimerArgs":
        if (self.duration_value is None) != (self.duration_unit is None):
            raise ValueError("Give duration_value and duration_unit together, or neither.")
        if self.duration_value is not None and not math.isfinite(self.duration_value):
            raise ValueError("duration_value must be a finite number.")
        return self


class GetSampleHistoryArgs(_Args):
    sample_code: str = Field(..., json_schema_extra={"examples": ["A17", "CONTROL-01"]})
    # specs/006 R-401: the previous-run comparison rides here, because bench is
    # at the twelve-tool cap. Both fields are optional, so today's calls are unchanged.
    compare_previous: bool = Field(
        False, description="True when the user asks to compare with the previous run."
    )
    measurement_type: str | None = Field(
        None,
        description="With compare_previous: which measurement, e.g. temperature. Omit to use the sample's latest.",
        json_schema_extra={"examples": ["temperature", "pH"]},
    )


Period = Literal["today", "yesterday", "this_week", "last_week", "this_month"]


class SearchExperimentsArgs(_Args):
    """Desk mode: typed filters only; the model never writes a query or a date (specs/006 R-404).

    `period`, not `date_range`: no argument may look like a caller-supplied time
    (test_no_tool_accepts_a_timestamp). The server resolves it in the browser's zone.
    """

    text: str | None = Field(
        None,
        max_length=100,
        description="Words from the experiment's name, code or protocol, e.g. PCR, enzyme stability, STAB-104.",
    )
    period: Period | None = None
    status: Literal["DRAFT", "READY", "RUNNING", "PAUSED", "COMPLETED", "CANCELLED"] | None = None
    sample_code: str | None = Field(
        None, max_length=32, description="A sample the experiment contains, e.g. A17."
    )
    has_deviations: bool | None = Field(
        None, description="True for experiments with any deviation logged."
    )
    deviation_about: str | None = Field(
        None, max_length=60, description="What the deviation concerned, e.g. temperature, timing."
    )
    open: bool = Field(False, description="True only when the user asked to open an experiment.")


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
            "The protocol to run, in the user's own words: its name or its code, as said. "
            "The tool matches it. Omit only if the user wants to dictate a new protocol."
        ),
        json_schema_extra={"examples": ["sample stability", "STAB"]},
    )
    # Every string here must be words the user said. The voice agent silently
    # drops a call carrying a value the user did not say - a protocol code
    # inferred from its name, or a composed "A17:test" - and a holding agent then
    # ignores the user until the tool times out (specs/007 R-716). So sample
    # types are lists of spoken codes, not tokens or nested objects.
    sample_codes: list[str] | None = Field(
        None,
        max_length=50,
        description="Samples the user listed without saying a type, e.g. A17, A18.",
        json_schema_extra={"examples": [["A17", "A18"]]},
    )
    test_samples: list[str] | None = Field(
        None,
        max_length=50,
        description="Samples the user called test samples, e.g. A17, A18.",
        json_schema_extra={"examples": [["A17", "A18"]]},
    )
    control_samples: list[str] | None = Field(
        None,
        max_length=50,
        description="Samples the user called controls, e.g. CONTROL-01.",
        json_schema_extra={"examples": [["CONTROL-01"]]},
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
# amendment A-1): see PROFILES below. The bench set is twelve, the cap, since
# specs/004 added step_timer (research R-301) — write_protocol_step carries
# append/edit/remove/restart on one signature rather than spending four slots.
# 003 Phase D (previous-run comparison) is folded into
# get_sample_history(compare_previous) rather than spending a thirteenth slot
# (specs/006 R-401).
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
        "Mark the current protocol step complete and advance to the next. Also records "
        "that deviations were reviewed (deviations_reviewed).",
    ),
    "write_protocol_step": (
        WriteProtocolStepArgs,
        "Write this experiment's protocol while the run is happening: append the "
        "step the user just dictated (no step_number), reword or re-scope an "
        "existing one (step_number), drop one (step_number + remove), or start the "
        'protocol over (new_protocol). "Create a new protocol and start this '
        'experiment" is new_protocol true. Never propose a step yourself.',
    ),
    "get_sample_history": (
        GetSampleHistoryArgs,
        "Return recorded measurements and observations for one sample. Set compare_previous "
        "true when the user asks how a value compares with the previous run or last time: "
        "the result then includes the comparison, and you speak ONLY its numbers. Never "
        "calculate a difference yourself.",
    ),
    "check_experiment_completeness": (
        NoArgs,
        "Return whether every protocol requirement is met, step by step and sample by "
        "sample, and list exactly what is missing. Call this before completing an experiment.",
    ),
    "complete_experiment": (
        CompleteExperimentArgs,
        "Mark the experiment COMPLETED. Only after the completeness check passes "
        "AND the user has explicitly confirmed.",
    ),
    "step_timer": (
        StepTimerArgs,
        'Start, cancel, or check the countdown timer for this experiment. action "start" when the '
        "user asks for a timer or says yes to your offer. Pass the duration only if the user said "
        "one, otherwise omit it and the protocol step's duration is used. action \"cancel\" to stop "
        'it. action "status" for "how long is left". Never guess a duration.',
    ),
    # -- desk profile: no experiment open (specs/003, amendment A-1) ---------
    "list_protocols": (
        NoArgs,
        "List the protocols the user can run, with their codes. Use it when they ask "
        "what protocols exist or have not said which one to use.",
    ),
    "search_experiments": (
        SearchExperimentsArgs,
        "Find the user's experiments by words in the name or protocol, a period, status, a "
        "sample code, or deviations. Pass the period as one of the listed words; never work "
        "out dates. Set open true when the user asks to open one.",
    ),
    "create_experiment": (
        CreateExperimentArgs,
        "Create a new experiment, and start it unless the user says not to. Ask for the "
        "protocol and the samples if they were not given. Samples the user calls test go in "
        "test_samples, controls in control_samples, the rest in sample_codes. Call with confirmed false first, "
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
    "search_experiments": "user",
    "create_experiment": "user",
    "start_experiment": "experiment_ref",
}

# Session profiles: what one session configuration exposes (amendment A-1, ≤12).
#   desk  — no experiment open: find, create, start or resume one
#   bench — an experiment is bound: exactly the MVP set, unchanged
PROFILES: dict[str, tuple[str, ...]] = {
    "desk": ("list_protocols", "search_experiments", "create_experiment", "start_experiment"),
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
        "step_timer",  # specs/004 — the twelfth, the cap
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
        "step_timer",  # timers exist only on RUNNING runs (specs/004 FR-307)
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
    # specs/007: what the reading should be — one exact value, or a range open at
    # either end. A recorded value that misses it is saved and logged as a deviation.
    exact: float | None = None
    min: float | None = None
    max: float | None = None

    @field_validator("unit")
    @classmethod
    def _blank_is_none(cls, value: str | None) -> str | None:
        return value or None

    @model_validator(mode="after")
    def _expectation_is_valid(self) -> "ReadingIn":
        self.requirement()  # the same rules the completeness engine applies
        return self

    def requirement(self) -> MeasurementRequirement | None:
        """The structured requirement this reading stores, or None when it expects nothing."""
        if self.exact is None and self.min is None and self.max is None:
            return None
        try:
            return MeasurementRequirement(
                measurement_type=self.type, unit=self.unit, exact=self.exact, min=self.min, max=self.max
            )
        except ValidationError as exc:
            raise ValueError(exc.errors()[0]["msg"].removeprefix("Value error, ")) from None


class ProtocolStepIn(_Request):
    name: _text(1, 200)
    readings: list[ReadingIn] = Field(default_factory=list, max_length=20)
    # specs/007: structured requirements and a duration window, validated by the
    # same models the completeness engine reads (requirements.py).
    requirements: list[Requirement] = Field(default_factory=list, max_length=20)
    expected_duration_seconds: int | None = Field(None, ge=1, le=86_400)
    min_duration_seconds: int | None = Field(None, ge=0, le=86_400)
    max_duration_seconds: int | None = Field(None, ge=1, le=86_400)

    @model_validator(mode="after")
    def _window_ordered(self) -> "ProtocolStepIn":
        known = [
            v
            for v in (self.min_duration_seconds, self.expected_duration_seconds, self.max_duration_seconds)
            if v is not None
        ]
        if known != sorted(known):
            raise ValueError("Durations must satisfy min <= expected <= max.")
        return self

    @model_validator(mode="after")
    def _one_expectation_per_type(self) -> "ProtocolStepIn":
        """A reading type carries at most one expectation per step, so there is
        never a question of which range a value is judged against."""
        seen: dict[str, MeasurementRequirement | None] = {}
        for reading in self.readings:
            key = canonical_type(reading.type)
            expected = reading.requirement()
            if key in seen and seen[key] != expected and (seen[key] or expected):
                raise ValueError(f"{reading.type} is listed twice with different expected values.")
            seen.setdefault(key, expected)
        for requirement in self.requirements:
            if isinstance(requirement, MeasurementRequirement) and seen.get(canonical_type(requirement.measurement_type)):
                raise ValueError(
                    f"{requirement.measurement_type} has an expected value on its reading and in requirements; give it once."
                )
        return self


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
