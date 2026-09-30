import { describe, expect, it } from 'vitest';

import type { ProtocolStep } from '@/lib/queries/useExperiment';
import { expectationFor, requirementLines, sampleCompositionText, unitForReading } from '@/lib/stepRequirements';

const step = (extra: Partial<ProtocolStep>): ProtocolStep => ({ index: 0, id: 'step_1', name: 'Step', required_fields: [], ...extra });

const temperature = (expectation: Record<string, number>): ProtocolStep =>
  step({
    required_fields: ['sample_id', 'temperature'],
    default_unit: { temperature: 'C' },
    requirements: [{ type: 'measurement', measurement_type: 'temperature', scope: 'all_samples', unit: 'C', ...expectation }],
  });

describe('expectationFor', () => {
  it.each([
    [{ min: 2, max: 8 }, '2 to 8'],
    [{ min: 2 }, 'at least 2'],
    [{ max: 8 }, 'at most 8'],
    [{ exact: 4.2 }, 'exactly 4.2'],
  ])('%j reads as %s', (expectation, text) => {
    expect(expectationFor(temperature(expectation), 'temperature')).toBe(text);
  });

  it('is null for a legacy reading with no expectation', () => {
    const legacy = step({ required_fields: ['sample_id', 'temperature'], default_unit: { temperature: 'C' } });
    expect(expectationFor(legacy, 'temperature')).toBeNull();
    expect(unitForReading(legacy, 'temperature')).toBe('C');
  });

  it("uses the requirement's unit (pH has no default_unit)", () => {
    const ph = step({
      required_fields: ['sample_id', 'pH'],
      requirements: [{ type: 'measurement', measurement_type: 'pH', scope: 'all_samples', unit: 'pH', min: 6.5, max: 7.5 }],
    });
    expect(unitForReading(ph, 'pH')).toBe('pH');
    expect(expectationFor(ph, 'ph')).toBe('6.5 to 7.5');
  });
});

describe('requirementLines', () => {
  it('lists every non-reading requirement of the stability protocol', () => {
    expect(
      requirementLines(
        step({
          requirements: [
            { type: 'samples', sample_type: 'test', count: 2 },
            { type: 'samples', sample_type: 'control', count: 1 },
          ],
        }),
      ),
    ).toEqual(['At least 2 test and 1 control samples']);
    expect(requirementLines(step({ requirements: [{ type: 'observation', scope: 'all_samples' }] }))).toEqual([
      'An observation for every sample',
    ]);
    expect(requirementLines(step({ requirements: [{ type: 'deviation_review' }] }))).toEqual(['Deviation review sign-off']);
    expect(
      requirementLines(
        step({
          expected_duration_seconds: 900,
          min_duration_seconds: 840,
          max_duration_seconds: 1020,
          requirements: [{ type: 'step_execution', must_start: true, must_complete: true }],
        }),
      ),
    ).toEqual(['Timed 15 min (allowed 14 min–17 min)', 'Must be started and completed']);
  });

  it('does not repeat a reading that is already listed, but shows one that is not', () => {
    expect(requirementLines(temperature({ min: 2, max: 8 }))).toEqual([]);
    expect(
      requirementLines(step({ requirements: [{ type: 'measurement', measurement_type: 'mass', unit: 'g', max: 5 }] })),
    ).toEqual(['mass (g, at most 5) for every sample']);
  });

  it('is empty for a legacy step', () => {
    expect(requirementLines(step({ required_fields: ['sample_id', 'temperature'] }))).toEqual([]);
  });

  it('says "sample" for a single sample of one type', () => {
    expect(requirementLines(step({ requirements: [{ type: 'samples', sample_type: 'control', count: 1 }] }))).toEqual([
      'At least 1 control sample',
    ]);
  });
});

describe('sampleCompositionText', () => {
  const step = (over: Partial<ProtocolStep>): ProtocolStep => ({ index: 0, name: 's', required_fields: [], ...over }) as ProtocolStep;

  it('takes the largest count per type across steps, not the sum', () => {
    const steps = [
      step({ requirements: [{ type: 'samples', sample_type: 'test', count: 2 }, { type: 'samples', sample_type: 'control', count: 1 }] }),
      step({ requirements: [{ type: 'samples', sample_type: 'Control', count: 1 }] }),
    ];
    expect(sampleCompositionText(steps)).toBe('This protocol needs at least 2 test samples and 1 control sample.');
  });

  it('asks for at least one sample when a reading is for every sample', () => {
    expect(sampleCompositionText([step({ required_fields: ['sample_id', 'temperature'] })])).toBe(
      'This protocol records readings for every sample, so list at least one.',
    );
    expect(sampleCompositionText([step({ requirements: [{ type: 'observation', scope: 'all_samples' }] })])).not.toBeNull();
  });

  it('says nothing when the protocol needs no samples', () => {
    expect(sampleCompositionText([step({ requirements: [{ type: 'measurement', measurement_type: 'pH', scope: 'experiment' }] })])).toBeNull();
    expect(sampleCompositionText([])).toBeNull();
  });
});
