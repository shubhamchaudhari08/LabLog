"""The measurement vocabulary — declared once (Constitution Principle IV).

Everything else is derived from MEASUREMENT_TYPES: the speech-recognition
keyterms, the units suggested when the agent has to ask "what unit?", the
`measurement_type` field description the agent reads, and the read-only list the
web app shows under Settings → Measurements.

The list is OPEN. A reading of an unlisted type is still recorded; it just gets
no suggestions and no recognition bias. A closed enum would make the agent coerce
an unlisted type into a listed one — data corruption disguised as a validation
success (data-model.md §Measurement type vocabulary).

Units are stored as given; nothing here converts between them (conversion is out
of scope, spec.md §Out of scope).

Adding a type is a code change on purpose: it changes what the agent is told and
what speech recognition listens for, and that belongs in review, not in a form.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MeasurementType:
    name: str
    #: Units as stored. The first is the one offered first when a unit is missing.
    units: tuple[str, ...]
    #: How the units are said aloud, for speech-recognition bias.
    spoken_units: tuple[str, ...] = ()
    #: No unit is meaningful (pH), so a missing unit is filled in rather than asked for.
    dimensionless: bool = False

    @property
    def default_unit(self) -> str:
        return self.units[0]


MEASUREMENT_TYPES: tuple[MeasurementType, ...] = (
    MeasurementType("temperature", ("C", "F"), ("Celsius", "Fahrenheit")),
    MeasurementType("mass", ("g", "mg", "kg"), ("grams", "milligrams")),
    MeasurementType("volume", ("mL", "L"), ("milliliters", "liters")),
    MeasurementType("pH", ("pH",), dimensionless=True),
    MeasurementType("concentration", ("mM", "M", "mg/mL")),
    MeasurementType("duration", ("minutes", "seconds"), ("minutes", "seconds")),
    MeasurementType("rpm", ("rpm",), ("RPM",)),
    MeasurementType("voltage", ("V", "mV"), ("volts",)),
    MeasurementType("current", ("A", "mA")),
    MeasurementType("pressure", ("kPa", "bar")),
    MeasurementType("humidity", ("%",)),
)

_BY_NAME = {t.name.casefold(): t for t in MEASUREMENT_TYPES}


def lookup(name: str | None) -> MeasurementType | None:
    """The listed type with this name, ignoring case and padding; None if unlisted."""
    return _BY_NAME.get((name or "").strip().casefold())


def suggested_units(name: str | None) -> list[str]:
    entry = lookup(name)
    return list(entry.units) if entry else []


def type_names() -> list[str]:
    return [t.name for t in MEASUREMENT_TYPES]


def spoken_terms() -> list[str]:
    """Keyterms: every type name, then every spoken unit, without repeats."""
    terms: list[str] = []
    for term in type_names() + [u for t in MEASUREMENT_TYPES for u in t.spoken_units]:
        if term not in terms:
            terms.append(term)
    return terms


def as_dicts() -> list[dict[str, object]]:
    """The public, read-only form served to the web app."""
    return [
        {
            "name": t.name,
            "units": list(t.units),
            "default_unit": t.default_unit,
            "spoken_units": list(t.spoken_units),
            "dimensionless": t.dimensionless,
        }
        for t in MEASUREMENT_TYPES
    ]
