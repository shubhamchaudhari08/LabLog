"""What a protocol step requires, as typed models (specs/007 data-model §1–2).

A step is a JSONB element of `protocols.steps`. It may declare structured
`requirements` and a duration window; a legacy step declares only
`required_fields: ["sample_id", "temperature"]`. Both normalise to the same
models here, so the completeness engine reads one shape and the POST /protocols
route validates with the same classes (Constitution Principle IV).

A malformed requirement is an error, never skipped: a requirement that silently
disappears makes an incomplete run look complete.
"""

from __future__ import annotations

import math
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError, field_validator, model_validator

from . import vocabulary

Scope = Literal["all_samples", "experiment"]
SAMPLE_TYPE_PATTERN = r"^[a-z][a-z0-9_-]{0,31}$"


def canonical_type(name: str) -> str:
    """How two measurement type names are compared: vocabulary spelling, else case-folded."""
    listed = vocabulary.lookup(name)
    return listed.name if listed else " ".join(str(name).split()).casefold()


class _Req(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class MeasurementRequirement(_Req):
    type: Literal["measurement"] = "measurement"
    measurement_type: str = Field(min_length=1, max_length=40)
    scope: Scope = "all_samples"
    unit: str | None = Field(None, min_length=1, max_length=20)
    # An expectation is either one exact value or a range; a range may be open
    # at one end ("at least 2", "at most 8").
    min: float | None = None
    max: float | None = None
    exact: float | None = None

    @field_validator("measurement_type")
    @classmethod
    def _listed_spelling(cls, value: str) -> str:
        listed = vocabulary.lookup(value)
        return listed.name if listed else value.strip()

    @model_validator(mode="before")
    @classmethod
    def _unit_for_expectation(cls, data: Any) -> Any:
        """An expected value is meaningless without its unit, and nothing converts
        units (constitution non-goal), so one is required — except for a
        dimensionless type like pH, whose only unit is filled in."""
        if not isinstance(data, dict) or data.get("unit") or all(data.get(k) is None for k in ("min", "max", "exact")):
            return data
        listed = vocabulary.lookup(str(data.get("measurement_type") or ""))
        if listed and listed.dimensionless:
            return {**data, "unit": listed.default_unit}
        raise ValueError("Give a unit: an expected value or range is compared in that unit.")

    @model_validator(mode="after")
    def _expectation(self) -> "MeasurementRequirement":
        for bound in (self.min, self.max, self.exact):
            if bound is not None and not math.isfinite(bound):
                raise ValueError("Expected values must be finite numbers.")
        if self.exact is not None and (self.min is not None or self.max is not None):
            raise ValueError("Give an exact value or a range, not both.")
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("min must not exceed max.")
        return self

    @property
    def has_expectation(self) -> bool:
        return self.exact is not None or self.min is not None or self.max is not None

    def deviates(self, value: float) -> bool:
        """Outside the range, or different from the exact value. Numbers, not text: 7 == 7.00."""
        if self.exact is not None:
            return value != self.exact
        return (self.min is not None and value < self.min) or (self.max is not None and value > self.max)


class ObservationRequirement(_Req):
    type: Literal["observation"] = "observation"
    scope: Scope = "all_samples"


class StepExecutionRequirement(_Req):
    type: Literal["step_execution"] = "step_execution"
    must_start: bool = True
    must_complete: bool = True


class DeviationReviewRequirement(_Req):
    type: Literal["deviation_review"] = "deviation_review"


class SampleRequirement(_Req):
    """At least `count` active samples of `sample_type`. Never names sample codes."""

    type: Literal["samples"] = "samples"
    sample_type: str = Field(pattern=SAMPLE_TYPE_PATTERN)
    count: int = Field(ge=1, le=50)


Requirement = Annotated[
    Union[
        MeasurementRequirement,
        ObservationRequirement,
        StepExecutionRequirement,
        DeviationReviewRequirement,
        SampleRequirement,
    ],
    Field(discriminator="type"),
]
_REQUIREMENTS = TypeAdapter(list[Requirement])


class StepTiming(_Req):
    expected_duration_seconds: int | None = Field(None, ge=1, le=86_400)
    min_duration_seconds: int | None = Field(None, ge=0, le=86_400)
    max_duration_seconds: int | None = Field(None, ge=1, le=86_400)

    @model_validator(mode="after")
    def _ordered(self) -> "StepTiming":
        known = [v for v in (self.min_duration_seconds, self.expected_duration_seconds, self.max_duration_seconds) if v is not None]
        if known != sorted(known):
            raise ValueError("Durations must satisfy min <= expected <= max.")
        return self

    @property
    def has_window(self) -> bool:
        return self.min_duration_seconds is not None or self.max_duration_seconds is not None

    def status(self, elapsed_seconds: float) -> str:
        if not self.has_window:
            return "no_window"
        if self.min_duration_seconds is not None and elapsed_seconds < self.min_duration_seconds:
            return "too_short"
        if self.max_duration_seconds is not None and elapsed_seconds > self.max_duration_seconds:
            return "too_long"
        return "within_window"


class InvalidProtocol(ValueError):
    """A stored step whose requirements do not validate. Reported, never ignored."""

    def __init__(self, step: dict[str, Any], errors: list[dict[str, Any]]):
        self.step_index = step.get("index")
        self.step_name = step.get("name")
        self.errors = errors
        super().__init__(f"Step {self.step_index} has invalid requirements")


def _errors(exc: ValidationError) -> list[dict[str, Any]]:
    return exc.errors(include_url=False, include_context=False)


def step_timing(step: dict[str, Any]) -> StepTiming:
    try:
        return StepTiming(**{k: step.get(k) for k in StepTiming.model_fields})
    except ValidationError as exc:
        raise InvalidProtocol(step, _errors(exc)) from None


def step_requirements(step: dict[str, Any]) -> list[Requirement]:
    """Structured requirements, plus legacy `required_fields` not already covered by one."""
    try:
        structured = _REQUIREMENTS.validate_python(step.get("requirements") or [])
    except ValidationError as exc:
        raise InvalidProtocol(step, _errors(exc)) from None

    covered = {canonical_type(r.measurement_type) for r in structured if isinstance(r, MeasurementRequirement)}
    legacy: list[Requirement] = []
    for field in step.get("required_fields") or []:
        if not isinstance(field, str) or field == "sample_id" or not field.strip():
            continue
        if canonical_type(field) in covered:
            continue
        covered.add(canonical_type(field))
        legacy.append(MeasurementRequirement(measurement_type=field))
    return [*legacy, *structured]


def validate_step(step: dict[str, Any]) -> None:
    step_requirements(step)
    step_timing(step)


def is_timed(step: dict[str, Any] | None) -> bool:
    """A step whose start and completion are recorded: it has a window, or says it must.

    A declared duration alone only sets the step's timer; it does not oblige the
    user to start the step before completing it."""
    if not step:
        return False
    if step_timing(step).has_window:
        return True
    return any(isinstance(r, StepExecutionRequirement) for r in step_requirements(step))


def has_requirement(step: dict[str, Any] | None, kind: type) -> bool:
    return bool(step) and any(isinstance(r, kind) for r in step_requirements(step))


def measurement_requirement(step: dict[str, Any] | None, measurement_type: str) -> MeasurementRequirement | None:
    if not step:
        return None
    wanted = canonical_type(measurement_type)
    return next(
        (
            r
            for r in step_requirements(step)
            if isinstance(r, MeasurementRequirement) and canonical_type(r.measurement_type) == wanted
        ),
        None,
    )


def dump(requirements: list[Requirement]) -> list[dict[str, Any]]:
    return [r.model_dump(exclude_none=True) for r in requirements]
