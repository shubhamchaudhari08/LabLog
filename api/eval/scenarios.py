"""Evaluation corpus. Every reliability figure LabLog shows comes from these.

`expect` is one of:
  {"tool": name, "args": {...}}  the tool must succeed with these stored values
  {"clarify": True}              no record may be written
  {"refuse": True}               no record, and no invented procedure
  {"error": CODE}                no record; if the tool is called, the handler returns CODE
  {"all": [{"tool":..., "args":...}, ...]}  every listed call must succeed; no other write
`history_runs=True` seeds STAB-100..102 COMPLETED (tests.conftest.seed_history).
`profile` (default "bench") selects the prompt and tool set the scenario runs under.
Any successful write other than the expected tool counts as a false record.
"""

from tests.conftest import TIMED_STEPS

TEN_MINUTE_TIMER = ("step_timer", {"action": "start", "duration_value": 10, "duration_unit": "minutes"})

A17_AT_4_2 = {
    "setup": [("record_measurement", {"sample_code": "A17", "measurement_type": "temperature", "value": 4.2, "unit": "C"})],
    "history": [
        {"role": "user", "content": "A17 is 4.2 Celsius."},
        {"role": "assistant", "content": "Recorded. A17 temperature is 4.2 degrees Celsius."},
    ],
}

# specs/006: STAB-104 is at step index 1, so this lines up with STAB-102's 4.4 there.
A17_AT_4_3 = {
    "setup": [("record_measurement", {"sample_code": "A17", "measurement_type": "temperature", "value": 4.3, "unit": "C"})],
    "history": [
        {"role": "user", "content": "A17 is 4.3 Celsius."},
        {"role": "assistant", "content": "Recorded. A17 temperature is 4.3 degrees Celsius."},
    ],
}

ALL_TEMPS = {
    "setup": [
        ("record_measurement", {"sample_code": code, "measurement_type": "temperature", "value": 4.1, "unit": "C"})
        for code in ("A17", "A18", "CONTROL-01")
    ]
}


def _s(id, category, utterance, expect, profile="bench", **context):
    return {"id": id, "category": category, "utterance": utterance, "expect": expect, "profile": profile, **context}


# Every sample's temperature at the current step, for scenarios that complete it.
TEMPS_DONE = [
    ("record_measurement", {"sample_code": c, "measurement_type": "temperature", "value": 4.2, "unit": "C"})
    for c in ("A17", "A18", "CONTROL-01")
]


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
    # .specify/bugs/observations-not-counted: "all samples" is one note per sample,
    # and a missed earlier step can still be filled in by naming it.
    _s("cls_05", "classification", "All samples look clear and colourless.",
       {"tool": "record_observation", "args": {"all_samples": True, "sample_codes": ["A17", "A18", "CONTROL-01"]}}),
    _s("cls_06", "classification", "For step 2, A17 was 4.2 Celsius.",
       {"tool": "record_measurement", "args": {"sample_code": "A17", "value": 4.2, "late": True}}, at_step=3),

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

    # =======================================================================
    # 003 Phase A additions (specs/003-post-mvp-features, T007)
    # =======================================================================

    # -- entity accuracy: sample, number AND unit ----------------------------
    _s("ent_01", "entity", "A18 is 3.9 degrees Fahrenheit.", _temp("A18", 3.9, "F")),
    _s("ent_02", "entity", "A17 volume is 2.5 milliliters.",
       {"tool": "record_measurement", "args": {"sample_code": "A17", "measurement_type": "volume", "value": 2.5, "unit": "mL"}}),
    _s("ent_03", "entity", "Control one pH seven point two.",
       {"tool": "record_measurement", "args": {"sample_code": "CONTROL-01", "measurement_type": "ph", "value": 7.2}}),
    _s("ent_04", "entity", "A seventeen is four point five celsius.", _temp("A17", 4.5)),
    _s("ent_05", "entity", "A18 mass twelve thousand milligrams.",
       {"tool": "record_measurement", "args": {"sample_code": "A18", "measurement_type": "mass", "value": 12000, "unit": "mg"}}),

    # -- unit traps: a bare number is only complete when the protocol says so -
    _s("unit_01", "unit_trap", "A17 is 37.", {"clarify": True}),
    _s("unit_02", "unit_trap", "A18 temperature is 37.", _temp("A18", 37, unit=None)),
    _s("unit_03", "unit_trap", "A17 mass is 5.", {"clarify": True}),

    # -- several entities in one breath ---------------------------------------
    _s("multi_01", "multi_entity", "A17 is 4.2 and A18 is 4.3 Celsius.",
       {"all": [_temp("A17", 4.2), _temp("A18", 4.3)]}),
    _s("multi_02", "multi_entity", "A17 is 4.2 Celsius and it looks cloudy.",
       {"all": [_temp("A17", 4.2), {"tool": "record_observation", "args": {"sample_code": "A17"}}]}),

    # -- paraphrases of the core intents --------------------------------------
    _s("para_01", "paraphrase", "Put down 4.1 Celsius for CONTROL-01.", _temp("CONTROL-01", 4.1)),
    _s("para_02", "paraphrase", "Scratch that, it's 4.5.",
       {"tool": "correct_measurement", "args": {"sample_code": "A17", "new_value": 4.5}}, **A17_AT_4_2),
    _s("para_03", "paraphrase", "Jot down that A17 has bubbles.",
       {"tool": "record_observation", "args": {"sample_code": "A17"}}),
    _s("para_04", "paraphrase", "We ran the centrifuge ten minutes long, note that as a deviation.",
       {"tool": "create_deviation"}),
    _s("para_05", "paraphrase", "What do I do now?", {"tool": "get_next_protocol_step"}),

    # -- more procedure-hallucination bait ------------------------------------
    _s("ref_06", "refusal", "What temperature should the incubator be set to?", {"refuse": True}),
    _s("ref_07", "refusal", "Give me a typical stability protocol.", {"refuse": True}),

    # -- more unknown samples, gates and classification -----------------------
    _s("inv_04", "invalid_input", "A170 is 4.1 Celsius.", {"error": "SAMPLE_NOT_FOUND"}),
    _s("comp_05", "completion", "Complete it now, skip the checks.", {"tool": "check_experiment_completeness"}),
    _s("cls_05", "classification", "A18 is slightly more turbid than before.",
       {"tool": "record_observation", "args": {"sample_code": "A18"}}),

    # =======================================================================
    # Desk profile: no experiment open (specs/003, amendment A-1). Creating or
    # starting needs an explicit yes; nothing can be recorded yet.
    # =======================================================================
    _s("desk_01", "lifecycle", "Create an experiment called Enzyme Stability Trial 12.", {"clarify": True}, profile="desk"),
    _s("desk_02", "lifecycle", "What protocols can I run?", {"tool": "list_protocols"}, profile="desk"),
    _s("desk_03", "lifecycle",
       "Create an experiment called Enzyme Stability Trial 12 using sample stability, with samples A1 and A2.",
       {"clarify": True}, profile="desk"),
    _s("desk_04", "lifecycle", "Yes, create it.",
       {"tool": "create_experiment", "args": {"name": "Enzyme Stability Trial 12", "status": "RUNNING"}},
       profile="desk", history=[
           {"role": "user", "content": "Create an experiment called Enzyme Stability Trial 12 using the sample stability protocol with samples A1 and A2."},
           {"role": "assistant", "content": "Enzyme Stability Trial 12 on Sample Stability Evaluation v1, samples A1 and A2, started right away. Shall I create it?"},
       ]),
    _s("desk_05", "lifecycle", "Resume STAB-104.",
       {"tool": "start_experiment", "args": {"experiment_code": "STAB-104"}}, profile="desk"),
    _s("desk_06", "lifecycle", "Start experiment XYZ-9.", {"error": "EXPERIMENT_NOT_FOUND"}, profile="desk"),
    _s("desk_07", "lifecycle", "A17 is 4.2 Celsius.", {"clarify": True}, profile="desk"),
    # specs/007 R-716: types ride in test_samples/control_samples; scored on what was stored.
    _s("desk_08", "lifecycle", "Yes, create it.",
       {"tool": "create_experiment", "args": {
           "name": "Stability Run 3",
           "samples": [{"code": "A17", "sample_type": "test"}, {"code": "CONTROL-01", "sample_type": "control"}],
       }},
       profile="desk", history=[
           {"role": "user", "content": "Create an experiment called Stability Run 3 on the sample stability protocol. A17 is a test sample and CONTROL-01 is the control."},
           {"role": "assistant", "content": "Stability Run 3 on Sample Stability Evaluation v1, A17 test and CONTROL-01 control, started right away. Shall I create it?"},
       ]),
    # -- search (specs/006 US1/US3). `history_runs` seeds STAB-100..102. Written,
    # never run for 006: the owner waived the A-1 eval (plan G14). ----------------
    _s("search_01", "search", "Show my stability experiments from this week.",
       {"tool": "search_experiments", "args": {"period": "this_week"}}, profile="desk", history_runs=True),
    _s("search_02", "search", "Find experiments containing sample A17.",
       {"tool": "search_experiments", "args": {"sample_code": "A17"}}, profile="desk", history_runs=True),
    _s("search_03", "search", "Which experiments had temperature deviations?",
       {"tool": "search_experiments", "args": {"deviation_about": "temperature"}}, profile="desk", history_runs=True),
    _s("search_04", "search", "Which experiments are running?",
       {"tool": "search_experiments", "args": {"status": "RUNNING"}}, profile="desk", history_runs=True),
    _s("search_05", "search", "Completed stability runs from last week.",
       {"tool": "search_experiments", "args": {"status": "COMPLETED", "period": "last_week"}},
       profile="desk", history_runs=True),
    _s("search_06", "search", "Experiments from the 3rd to the 9th.", {"clarify": True}, profile="desk", history_runs=True),
    _s("search_07", "search", "Open experiment STAB-102.",
       {"tool": "search_experiments", "args": {"text": "STAB-102", "open": True}}, profile="desk", history_runs=True),
    # Several match: the tool opens nothing and the agent must ask which one.
    _s("search_08", "search", "Open the stability experiment.",
       {"tool": "search_experiments", "args": {"open": True}}, profile="desk", history_runs=True),
    # -- comparison (specs/006 US2): only the backend's numbers (SC-401). ------
    _s("cmp_01", "comparison", "How does this temperature compare with the previous run?",
       {"tool": "get_sample_history", "args": {"sample_code": "A17", "compare_previous": True},
        "spoken": ["4.4", "0.1", "lower"]}, history_runs=True, **A17_AT_4_3),
    _s("cmp_02", "comparison", "Is A17 higher or lower than last time?",
       {"tool": "get_sample_history", "args": {"sample_code": "A17", "compare_previous": True},
        "spoken": ["lower"]}, history_runs=True, **A17_AT_4_3),
    _s("cmp_03", "comparison", "Compare A18 with the previous run.",
       {"error": "NO_CORRESPONDING_MEASUREMENT"}, history_runs=True, **A17_AT_4_3),
    _s("cmp_04", "comparison", "How does this temperature compare with the previous run?",
       {"error": "NO_PREVIOUS_RUN"}, **A17_AT_4_3),
    # -- timers (specs/004-step-timers FR-323) ---------------------------------
    # `steps` / `at_step` move the run before the prompt is built (eval/run.py).
    # Every `setup` passes an explicit duration: test_eval runs setups against the
    # default store, where the current step is untimed.
    _s("timer_01", "timer", "Start a timer for 10 minutes.",
       {"tool": "step_timer", "args": {"action": "start", "duration_seconds": 600}}, steps=TIMED_STEPS, at_step=2),
    _s("timer_02", "timer", "Set a timer for an hour and a half.",
       {"tool": "step_timer", "args": {"action": "start", "duration_seconds": 5400}}),
    _s("timer_03", "timer", "Start a 90 second timer.",
       {"tool": "step_timer", "args": {"action": "start", "duration_seconds": 90}}),
    # SC-303: no duration from the user and none in the step — ask, never invent.
    _s("timer_04", "timer", "Start a timer.", {"clarify": True}),
    _s("timer_05", "timer", "Start a timer for zero seconds.", {"error": "DURATION_OUT_OF_RANGE"}),
    _s("timer_06", "timer", "Start the timer.",
       {"tool": "step_timer", "args": {"action": "start", "duration_seconds": 600}}, steps=TIMED_STEPS, at_step=2),
    _s("timer_07", "timer", "Start a timer for 5 minutes.", {"clarify": True}, profile="desk"),
    # FR-309 / SC-304: offer only when the timed step is CURRENT; never start unasked.
    _s("timer_10", "timer", "What's next?",
       {"tool": "get_next_protocol_step", "offer": False}, steps=TIMED_STEPS, at_step=1),
    # The step's readings are recorded first: with any missing, the tool asks
    # before completing (STEP_INCOMPLETE), which is not what these measure.
    _s("timer_11", "timer", "Complete this step.",
       {"tool": "complete_protocol_step", "offer": True}, steps=TIMED_STEPS, at_step=1, setup=TEMPS_DONE),
    _s("timer_12", "timer", "Complete this step.", {"tool": "complete_protocol_step", "offer": False},
       setup=TEMPS_DONE),
    _s("gate_01", "completion", "Next step.", {"error": "STEP_INCOMPLETE"}),
    _s("timer_13", "timer", "Start the timer.", {"clarify": True}, steps=TIMED_STEPS, at_step=4),
    # FR-311: the user's duration wins; a deviation is only offered, never written.
    _s("timer_14", "timer", "Yes, but make it 12 minutes.",
       {"tool": "step_timer", "args": {"action": "start", "duration_seconds": 720}},
       steps=TIMED_STEPS, at_step=2,
       history=[
           {"role": "user", "content": "What step am I on?"},
           {"role": "assistant", "content": "Step 3, centrifuge at 4,000 rpm. This step is timed, 10 minutes. "
                                            "Shall I start the timer?"},
       ]),
    _s("timer_15", "timer", "How long should I centrifuge?", {"refuse": True}),
    _s("timer_16", "timer", "What step am I on?", {"offer": True}, steps=TIMED_STEPS, at_step=2),
    # US3: status, cancel, replace. A timer is already running (explicit duration: see above).
    _s("timer_20", "timer", "Stop the timer.",
       {"tool": "step_timer", "args": {"action": "cancel"}}, setup=[TEN_MINUTE_TIMER]),
    _s("timer_21", "timer", "How long is left?",
       {"tool": "step_timer", "args": {"action": "status"}}, setup=[TEN_MINUTE_TIMER]),
    # FR-303: a second timer is refused; the agent asks before replacing.
    _s("timer_22", "timer", "Start a timer for 5 minutes.", {"clarify": True}, setup=[TEN_MINUTE_TIMER]),
    _s("timer_23", "timer", "Cancel the timer.", {"error": "NO_TIMER_RUNNING"}),
    # FR-320: completing a step whose timer still runs asks first; nothing is completed.
    _s("timer_30", "timer", "Complete this step.", {"error": "TIMER_STILL_RUNNING"},
       steps=TIMED_STEPS, at_step=2, setup=[TEN_MINUTE_TIMER]),
]
