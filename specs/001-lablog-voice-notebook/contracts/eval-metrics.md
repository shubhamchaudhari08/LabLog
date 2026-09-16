# Contract — `metrics.json`

**Status**: FROZEN · **Owner**: Stream G · **Consumed by**: Stream H

The only source of any reliability figure shown to a viewer (FR-031, SC-011). If a number is on the dashboard it came from this file, and this file came from a script anyone can run.

---

## Shape

```jsonc
{
  "generated_at": "2026-09-22T18:30:00Z",
  "scenario_count": 42,
  "model": "<the model the voice agent routes to>",
  "git_sha": "abc1234",
  "metrics": {
    "tool_selection_accuracy":      { "value": 0.976, "passed": 41, "total": 42 },
    "argument_accuracy":            { "value": 0.952, "passed": 40, "total": 42 },
    "sample_id_accuracy":           { "value": 0.968, "passed": 30, "total": 31 },
    "value_extraction_accuracy":    { "value": 1.000, "passed": 31, "total": 31 },
    "ambiguity_clarification_rate": { "value": 1.000, "passed": 8,  "total": 8  },
    "false_record_creation_rate":   { "value": 0.000, "passed": 42, "total": 42, "lower_is_better": true },
    "procedure_hallucination_rate": { "value": 0.000, "passed": 5,  "total": 5,  "lower_is_better": true },
    "backend_rejection_correctness":{ "value": 1.000, "passed": 6,  "total": 6  },
    "task_completion_rate":         { "value": 0.929, "passed": 39, "total": 42 }
  },
  "by_category": {
    "normal_capture": { "total": 15, "passed": 15 },
    "ambiguity":      { "total": 8,  "passed": 8  },
    "correction":     { "total": 5,  "passed": 5  },
    "classification": { "total": 4,  "passed": 4  },
    "invalid_input":  { "total": 6,  "passed": 6  },
    "refusal":        { "total": 5,  "passed": 5  },
    "completion":     { "total": 3,  "passed": 2  }
  },
  "failures": [
    { "scenario_id": "comp_002", "category": "completion",
      "utterance": "we're done here",
      "expected": "check_experiment_completeness", "actual": "complete_experiment",
      "note": "Skipped the completeness check; backend correctly rejected with INCOMPLETE." }
  ]
}
```

---

## Metric definitions

Precise, because a metric whose definition is vague is a metric that cannot be defended when questioned.

| Metric | Denominator | Passes when |
|---|---|---|
| `tool_selection_accuracy` | all scenarios | the expected tool is called, or the expected non-call (`clarify` / `refuse`) occurs |
| `argument_accuracy` | scenarios expecting a tool call | **every** expected argument matches (unit-normalised, case-insensitive) |
| `sample_id_accuracy` | scenarios naming a sample | the resolved `sample_code` is correct |
| `value_extraction_accuracy` | scenarios with a numeric value | the value matches exactly |
| `ambiguity_clarification_rate` | scenarios with a missing critical field | the model asks instead of calling a write tool |
| `false_record_creation_rate` | all scenarios | **no** record was created that should not have been. Lower is better; target 0 |
| `procedure_hallucination_rate` | scenarios requesting unsupported procedure | the model refuses. Lower is better; **target 0, non-negotiable** |
| `backend_rejection_correctness` | scenarios with invalid input | the real handler returns the expected error code |
| `task_completion_rate` | all scenarios | the full expectation is satisfied end to end |

`argument_accuracy` is deliberately all-or-nothing per scenario. Partial credit would let a run that gets the sample right and the value wrong report as mostly correct — and a measurement with the wrong number attached to the right sample is not partially useful, it is wrong.

Two metrics are reported as rates where zero is the target. They are listed separately and flagged `lower_is_better` so the dashboard cannot render them as bars alongside accuracies where high is good — an easy and embarrassing inversion.

---

## Stream H's obligations

- Render `scenario_count` adjacent to every figure. `97.6%` alone is not a claim; `97.6% across 42 scenarios` is.
- Render `generated_at` and `git_sha` — provenance makes the numbers auditable.
- Render the `failures` list. **Showing failures is what makes the passes believable**; a dashboard that reports only successes reads as marketing, and a reviewer who finds a hidden failure discounts everything else.
- Honour `lower_is_better`.
- If `metrics.json` is absent or stale, say so plainly. **Never** render a placeholder figure that could be mistaken for a measurement.

## Changelog

| Date | Change |
|---|---|
| 2026-09-15 | Initial freeze. |
