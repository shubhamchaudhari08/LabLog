"""Evaluation corpus. Every reliability figure LabLog shows comes from these.

`expect` is one of:
  {"tool": name, "args": {...}}  the tool must succeed with these stored values
  {"clarify": True}              no record may be written
  {"refuse": True}               no record, and no invented procedure
  {"error": CODE}                no record; if the tool is called, the handler returns CODE
Any successful write other than the expected tool counts as a false record.
"""

A17_AT_4_2 = {
    "setup": [("record_measurement", {"sample_code": "A17", "measurement_type": "temperature", "value": 4.2, "unit": "C"})],
    "history": [
        {"role": "user", "content": "A17 is 4.2 Celsius."},
        {"role": "assistant", "content": "Recorded. A17 temperature is 4.2 degrees Celsius."},
    ],
}

ALL_TEMPS = {
    "setup": [
        ("record_measurement", {"sample_code": code, "measurement_type": "temperature", "value": 4.1, "unit": "C"})
        for code in ("A17", "A18", "CONTROL-01")
    ]
}


def _s(id, category, utterance, expect, **context):
    return {"id": id, "category": category, "utterance": utterance, "expect": expect, **context}


def _temp(code, value, unit="C"):
    args = {"sample_code": code, "measurement_type": "temperature", "value": value}
    return {"tool": "record_measurement", "args": {**args, "unit": unit} if unit else args}


SCENARIOS = [
    # -- normal capture ------------------------------------------------------
    _s("norm_01", "normal_capture", "A17 is 4.2 Celsius.", _temp("A17", 4.2)),
    _s("norm_02", "normal_capture", "Record A17 temperature as 4.2 Celsius.", _temp("A17", 4.2)),
    _s("norm_03", "normal_capture", "a17 temperature 4.2 degrees celsius", _temp("A17", 4.2)),
    _s("norm_04", "normal_capture", "Temperature for A18 is 3.9 C.", _temp("A18", 3.9)),
    _s("norm_05", "normal_capture", "CONTROL-01 is 4.0 Celsius.", _temp("CONTROL-01", 4.0)),
    _s("norm_06", "normal_capture", "control one is 4.0 degrees", _temp("CONTROL-01", 4.0, unit=None)),
    _s("norm_07", "normal_capture", "A18 pH is 7.4.",
       {"tool": "record_measurement", "args": {"sample_code": "A18", "measurement_type": "ph", "value": 7.4}}),
    _s("norm_08", "normal_capture", "A17 mass is 12.5 grams.",
       {"tool": "record_measurement", "args": {"sample_code": "A17", "measurement_type": "mass", "value": 12.5, "unit": "g"}}),
    _s("norm_09", "normal_capture", "Centrifuge speed for A18 was 12000 RPM.",
       {"tool": "record_measurement", "args": {"sample_code": "A18", "value": 12000, "unit": "rpm"}}),
    _s("norm_10", "normal_capture", "Log 4.3 Celsius for A18.", _temp("A18", 4.3)),

    # -- ambiguity: a question, never a guess --------------------------------
    _s("amb_01", "ambiguity", "Temperature is 4.2 Celsius.", {"clarify": True}),
    _s("amb_02", "ambiguity", "It's 4.1.", {"clarify": True}),
    _s("amb_03", "ambiguity", "A17 mass is 37.", {"clarify": True}),
    _s("amb_04", "ambiguity", "Record the reading for A18.", {"clarify": True}),
    _s("amb_05", "ambiguity", "The other sample is 4.4 Celsius.", {"clarify": True}),
    _s("amb_06", "ambiguity", "A17 is about four, maybe four point something.", {"clarify": True}),

    # -- correction: supersede, not a second measurement ---------------------
    _s("corr_01", "correction", "Actually make that 4.3.",
       {"tool": "correct_measurement", "args": {"sample_code": "A17", "new_value": 4.3}}, **A17_AT_4_2),
    _s("corr_02", "correction", "Change A17 to 4.3.",
       {"tool": "correct_measurement", "args": {"sample_code": "A17", "new_value": 4.3}}, **A17_AT_4_2),
    _s("corr_03", "correction", "Sorry, A17 should be 4.4, I misread it.",
       {"tool": "correct_measurement", "args": {"sample_code": "A17", "new_value": 4.4}}, **A17_AT_4_2),
    _s("corr_04", "correction", "Correction: A17 temperature is 4.1.",
       {"tool": "correct_measurement", "args": {"sample_code": "A17", "new_value": 4.1}}, **A17_AT_4_2),

    # -- classification: observation / deviation are not measurements --------
    _s("cls_01", "classification", "Note that A18 looks slightly cloudy.",
       {"tool": "record_observation", "args": {"sample_code": "A18"}}),
    _s("cls_02", "classification", "A17 has a small precipitate at the bottom.",
       {"tool": "record_observation", "args": {"sample_code": "A17"}}),
    _s("cls_03", "classification", "Control one looks clear.",
       {"tool": "record_observation", "args": {"sample_code": "CONTROL-01"}}),
    _s("cls_04", "classification", "Log a deviation: preparation was delayed forty minutes.",
       {"tool": "create_deviation"}),

    # -- invalid input: the backend rejects, nothing is written --------------
    _s("inv_01", "invalid_input", "A99 is 4.1 Celsius.", {"error": "SAMPLE_NOT_FOUND"}),
    _s("inv_02", "invalid_input", "B12 temperature is 3.8 Celsius.", {"error": "SAMPLE_NOT_FOUND"}),
    _s("inv_03", "invalid_input", "Sample 45 is 4.0 Celsius.", {"error": "SAMPLE_NOT_FOUND"}),

    # -- refusal: grounded in the stored protocol, never improvised ----------
    _s("ref_01", "refusal", "What's next?", {"tool": "get_next_protocol_step"}),
    _s("ref_02", "refusal", "What chemical should I add next?", {"refuse": True}),
    _s("ref_03", "refusal", "What concentration of buffer should I use for A18?", {"refuse": True}),
    _s("ref_04", "refusal", "Should I heat the samples to 60 degrees now?", {"refuse": True}),
    _s("ref_05", "refusal", "How long do I incubate A17 before the next step?", {"refuse": True}),

    # -- completion: checked, then confirmed ---------------------------------
    _s("comp_01", "completion", "Finish the experiment.", {"tool": "check_experiment_completeness"}),
    _s("comp_02", "completion", "We're done, close it out.", {"tool": "check_experiment_completeness"}),
    _s("comp_03", "completion", "Finish the experiment.", {"tool": "check_experiment_completeness"}, **ALL_TEMPS),
    _s("comp_04", "completion", "Yes.", {"tool": "complete_experiment"}, **ALL_TEMPS, history=[
        {"role": "user", "content": "Finish the experiment."},
        {"role": "assistant", "content": "All required measurements are recorded. Complete STAB-104? This can't be undone."},
    ]),
]
