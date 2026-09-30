import { describe, expect, it } from 'vitest';

import type { MeasurementType } from '@/lib/api';
import {
  emptyForm,
  emptyReading,
  emptyStep,
  fromStored,
  keptSummary,
  serverErrors,
  toDraft,
  validate,
  type FormState,
  type ReadingDraft,
  type StepDraft,
} from '@/lib/protocolForm';
import type { ProtocolStep } from '@/lib/queries/useExperiment';

const TYPES: MeasurementType[] = [
  { name: 'temperature', units: ['C', 'F'], default_unit: 'C', spoken_units: [], dimensionless: false },
  { name: 'pH', units: ['pH'], default_unit: 'pH', spoken_units: [], dimensionless: true },
];

const protocol = (steps: ProtocolStep[]) => ({ protocol_code: 'STAB', name: 'Stability', version: 'v1.0', steps });

// The seeded "Sample Stability Evaluation v1.0" steps that exercise every feature
// (mirrors api/tests/conftest.py STABILITY_STEPS).
const REGISTER: ProtocolStep = {
  index: 0,
  id: 'REGISTER_SAMPLES',
  name: 'Register samples',
  required_fields: [],
  requirements: [
    { type: 'samples', sample_type: 'test', count: 2 },
    { type: 'samples', sample_type: 'control', count: 1 },
  ],
};
const INITIAL_TEMP: ProtocolStep = {
  index: 1,
  id: 'INITIAL_TEMP',
  name: 'Record initial temperature',
  required_fields: ['sample_id', 'temperature'],
  default_unit: { temperature: 'C' },
  requirements: [{ type: 'measurement', measurement_type: 'temperature', scope: 'all_samples', unit: 'C', min: 2, max: 8 }],
};
const HOLD: ProtocolStep = {
  index: 5,
  id: 'STABILITY_HOLD',
  name: 'Stability hold',
  required_fields: [],
  expected_duration_seconds: 900,
  min_duration_seconds: 840,
  max_duration_seconds: 1020,
  requirements: [{ type: 'step_execution', must_start: true, must_complete: true }],
};
const APPEARANCE: ProtocolStep = {
  index: 3,
  id: 'INITIAL_APPEARANCE',
  name: 'Record initial appearance',
  required_fields: [],
  requirements: [{ type: 'observation', scope: 'all_samples' }],
};
const REVIEW: ProtocolStep = {
  index: 9,
  id: 'REVIEW_DEVIATIONS',
  name: 'Review deviations',
  required_fields: [],
  requirements: [{ type: 'deviation_review' }],
};

function form(step: Partial<StepDraft>, readings: Partial<ReadingDraft>[] = []): FormState {
  return {
    ...emptyForm(),
    protocol_code: 'P-1',
    name: 'P',
    steps: [{ ...emptyStep(), name: 'Step', ...step, readings: readings.map((r) => ({ ...emptyReading(), ...r })) }],
  };
}

describe('fromStored', () => {
  it('shows a reading range, toggles and sample rules', () => {
    const [register, temp, appearance, review] = fromStored(protocol([REGISTER, INITIAL_TEMP, APPEARANCE, REVIEW])).steps;
    expect(register.sampleRules.map((r) => [r.sample_type, r.count])).toEqual([
      ['test', '2'],
      ['control', '1'],
    ]);
    expect(temp.readings[0]).toMatchObject({ type: 'temperature', unit: 'C', expect: 'range', min: '2', max: '8', exact: '' });
    expect(appearance.observationPerSample).toBe(true);
    expect(review.deviationReview).toBe(true);
    for (const step of [register, temp, appearance, review]) expect(step.kept).toEqual({ requirements: [] });
  });

  it('shows an exact value and a one-sided range', () => {
    const [step] = fromStored(
      protocol([
        {
          index: 0,
          id: 'step_1',
          name: 'Check',
          required_fields: ['sample_id', 'pH', 'temperature'],
          requirements: [
            { type: 'measurement', measurement_type: 'pH', scope: 'all_samples', unit: 'pH', exact: 7 },
            { type: 'measurement', measurement_type: 'temperature', scope: 'all_samples', unit: 'C', max: 8 },
          ],
        },
      ]),
    ).steps;
    expect(step.readings.map((r) => [r.type, r.expect, r.exact, r.min, r.max])).toEqual([
      ['pH', 'exact', '7', '', ''],
      ['temperature', 'range', '', '', '8'],
    ]);
  });

  it('keeps what the form cannot show, and says so', () => {
    const [hold] = fromStored(protocol([HOLD])).steps;
    expect(hold.kept).toEqual({
      requirements: [{ type: 'step_execution', must_start: true, must_complete: true }],
      expected_duration_seconds: 900,
      min_duration_seconds: 840,
      max_duration_seconds: 1020,
    });
    expect(keptSummary(hold.kept)).toBe('Kept as set elsewhere: timed 15 min (allowed 14 min–17 min); must be started and completed.');
  });

  it('keeps a sample rule for a type the form does not offer', () => {
    const [step] = fromStored(
      protocol([{ ...REGISTER, requirements: [{ type: 'samples', sample_type: 'blank', count: 1 }] }]),
    ).steps;
    expect(step.sampleRules).toEqual([]);
    expect(step.kept.requirements).toEqual([{ type: 'samples', sample_type: 'blank', count: 1 }]);
  });

  it('reads a legacy step exactly as before', () => {
    const [step] = fromStored(
      protocol([{ index: 0, id: 'step_1', name: 'Temp', required_fields: ['sample_id', 'temperature'], default_unit: { temperature: 'C' } }]),
    ).steps;
    expect(step.readings[0]).toMatchObject({ type: 'temperature', unit: 'C', expect: 'any' });
    expect(toDraft({ ...emptyForm(), steps: [step] }).steps[0]).toEqual({ name: 'Temp', readings: [{ type: 'temperature', unit: 'C' }] });
  });
});

describe('edit round trip', () => {
  it('sends back every requirement and window of the stability protocol', () => {
    const steps = [REGISTER, INITIAL_TEMP, APPEARANCE, HOLD, REVIEW];
    const draft = toDraft(fromStored(protocol(steps)));

    const byName = Object.fromEntries(draft.steps.map((s) => [s.name, s]));
    expect(byName['Register samples'].requirements).toEqual(REGISTER.requirements);
    expect(byName['Record initial temperature'].readings).toEqual([{ type: 'temperature', unit: 'C', min: 2, max: 8 }]);
    expect(byName['Record initial appearance'].requirements).toEqual([{ type: 'observation', scope: 'all_samples' }]);
    expect(byName['Stability hold']).toMatchObject({
      requirements: HOLD.requirements,
      expected_duration_seconds: 900,
      min_duration_seconds: 840,
      max_duration_seconds: 1020,
    });
    expect(byName['Review deviations'].requirements).toEqual([{ type: 'deviation_review' }]);
  });
});

describe('toDraft', () => {
  it('sends only the numbers of the chosen expectation', () => {
    const f = form({}, [
      { type: 'temperature', unit: 'C', expect: 'exact', exact: '4', min: '1', max: '9' },
      { type: 'pH', expect: 'range', min: '6.5', max: '' },
      { type: 'mass', unit: 'g', expect: 'any', exact: '3' },
    ]);
    expect(toDraft(f).steps[0].readings).toEqual([
      { type: 'temperature', unit: 'C', exact: 4 },
      { type: 'pH', min: 6.5 },
      { type: 'mass', unit: 'g' },
    ]);
  });

  it('adds no requirements key to a step without any', () => {
    expect(toDraft(form({})).steps[0]).toEqual({ name: 'Step', readings: [] });
  });
});

describe('validate', () => {
  const errorsFor = (f: FormState) => Object.values(validate(f, TYPES));

  it('needs a unit once a reading has an expected value, except pH', () => {
    expect(errorsFor(form({}, [{ type: 'temperature', expect: 'range', min: '2' }]))).toContain(
      'Choose a unit: the expected value is compared in it.',
    );
    expect(errorsFor(form({}, [{ type: 'pH', expect: 'exact', exact: '7' }]))).toEqual([]);
    expect(errorsFor(form({}, [{ type: 'temperature', expect: 'any' }]))).toEqual([]);
  });

  it.each([
    [{ expect: 'exact', exact: '' }, 'Enter the exact value as a number.'],
    [{ expect: 'exact', exact: 'seven' }, 'Enter the exact value as a number.'],
    [{ expect: 'range', min: '', max: '' }, 'Enter a minimum, a maximum, or both.'],
    [{ expect: 'range', min: 'x' }, 'Minimum and maximum must be numbers.'],
    [{ expect: 'range', min: '8', max: '2' }, 'The minimum is above the maximum.'],
  ] as const)('rejects %j', (reading, message) => {
    expect(errorsFor(form({}, [{ type: 'temperature', unit: 'C', ...reading }]))).toContain(message);
  });

  it('accepts either end of a range alone', () => {
    expect(errorsFor(form({}, [{ type: 'temperature', unit: 'C', expect: 'range', max: '8' }]))).toEqual([]);
  });

  it('checks sample rules', () => {
    const rules = [
      { key: 'a', sample_type: 'test' as const, count: '0' },
      { key: 'b', sample_type: 'test' as const, count: '2' },
    ];
    expect(validate(form({ sampleRules: rules }), TYPES)).toMatchObject({
      'a.count': 'A whole number from 1 to 50.',
      'b.type': 'test is already listed at this step.',
    });
  });
});

describe('serverErrors', () => {
  it('puts a reading-level rejection on the expected value, and a step-level one on the step', () => {
    const f = form({}, [{ type: 'temperature', expect: 'range', min: '2' }]);
    const [reading] = f.steps[0].readings;
    const errors = serverErrors(f, 'INVALID_ARGS', 'invalid', {
      errors: [
        { loc: ['steps', 0, 'readings', 0], msg: 'Value error, Give a unit: an expected value or range is compared in that unit.' },
        { loc: ['steps', 0], msg: 'Value error, temperature is listed twice with different expected values.' },
      ],
    });
    expect(errors[`${reading.key}.expect`]).toBe('Give a unit: an expected value or range is compared in that unit.');
    expect(errors[`${f.steps[0].key}.step`]).toBe('temperature is listed twice with different expected values.');
  });
});

describe('validate, blank reading rows', () => {
  it('refuses a reading with a unit or expected value but no type, instead of dropping it', () => {
    expect(Object.values(validate(form({}, [{ type: '', unit: 'C', expect: 'range', min: '2', max: '8' }]), TYPES))).toEqual([
      'Say what is measured, or remove this reading.',
    ]);
  });
  it('still drops an untouched blank row', () => {
    const f = form({}, [{ type: '' }]);
    expect(validate(f, TYPES)).toEqual({});
    expect(toDraft(f).steps[0].readings).toEqual([]);
  });
});
