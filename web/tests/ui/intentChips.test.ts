import { describe, expect, it } from 'vitest';
import { intentChips, MUTATING_TOOLS } from '@/lib/ui/intentChips';
import { fixture } from './fixtures';

type Outcome = { success: boolean; data?: Record<string, unknown> };
const outcomes = fixture<Record<string, Outcome>>('tool-outcomes');
const bound = { code: 'STAB-105' };
const pairs = (
  tool: string,
  data: Record<string, unknown>,
  ctx?: Parameters<typeof intentChips>[3],
) => intentChips(tool, data, bound, ctx).map((c) => [c.label, c.value]);

describe('intentChips (contracts/ui-voice-surfaces.md §2)', () => {
  it('record_measurement → Log reading, stored value, sample, run', () => {
    expect(pairs('record_measurement', outcomes.record_measurement.data!)).toEqual([
      ['Intent', 'Log reading'],
      ['Temperature', '37.2 °C'],
      ['Sample', 'A'],
      ['Run', 'STAB-105'],
    ]);
  });

  it('uses the vocabulary display name when one is given', () => {
    const typeName = (raw: string) => (raw === 'temperature' ? 'Temp.' : raw);
    expect(pairs('record_measurement', outcomes.record_measurement.data!, { typeName })[1]).toEqual(
      ['Temp.', '37.2 °C'],
    );
  });

  it('correct_measurement → previous → new', () => {
    expect(pairs('correct_measurement', outcomes.correct_measurement.data!)).toEqual([
      ['Intent', 'Correct reading'],
      ['Temperature', '37.2 → 37.4 °C'],
      ['Sample', 'A'],
      ['Run', 'STAB-105'],
    ]);
  });

  it('record_observation', () => {
    expect(pairs('record_observation', outcomes.record_observation.data!)).toEqual([
      ['Intent', 'Add note'],
      ['Sample', 'B'],
      ['Run', 'STAB-105'],
    ]);
  });

  it('record_observation for all samples lists the stored codes', () => {
    // .specify/bugs/observations-not-counted: one note per sample, codes as stored.
    const data = { all_samples: true, observation_ids: ['o1', 'o2'], sample_codes: ['A17', 'CONTROL-01'] };
    expect(pairs('record_observation', data)).toEqual([
      ['Intent', 'Add note'],
      ['Sample', 'A17, CONTROL-01'],
      ['Run', 'STAB-105'],
    ]);
  });

  it('create_deviation', () => {
    expect(pairs('create_deviation', outcomes.create_deviation.data!)).toEqual([
      ['Intent', 'Flag deviation'],
      ['Severity', 'medium'],
      ['Run', 'STAB-105'],
    ]);
  });

  it('complete_protocol_step with and without step context', () => {
    expect(
      pairs('complete_protocol_step', outcomes.complete_protocol_step.data!, {
        stepIndex: 0,
        totalSteps: 6,
      }),
    ).toEqual([
      ['Intent', 'Advance step'],
      ['Done', 'Register samples'],
      ['Now', 'Step 2 of 6'],
    ]);
    expect(pairs('complete_protocol_step', outcomes.complete_protocol_step.data!)).toEqual([
      ['Intent', 'Advance step'],
      ['Done', 'Register samples'],
    ]);
  });

  it('step_timer start', () => {
    expect(pairs('step_timer', outcomes.step_timer_start.data!)).toEqual([
      ['Intent', 'Start timer'],
      ['Duration', '10 minutes'],
      ['Step', 'Incubate'],
    ]);
  });

  it('complete_experiment', () => {
    expect(pairs('complete_experiment', outcomes.complete_experiment.data!)).toEqual([
      ['Intent', 'Finish run'],
      ['Run', 'STAB-105'],
      ['Status', 'Completed'],
    ]);
  });

  it('gives no chips for a read-only tool', () => {
    expect(
      intentChips('get_next_protocol_step', outcomes.get_next_protocol_step.data!, bound),
    ).toEqual([]);
    expect(MUTATING_TOOLS.has('get_next_protocol_step')).toBe(false);
  });

  it('gives only the humanised intent for an unknown tool', () => {
    expect(pairs('recalibrate_probe', { anything: 1 })).toEqual([['Intent', 'Recalibrate probe']]);
  });

  it('omits a chip whose field is missing rather than inventing a value', () => {
    expect(pairs('record_measurement', { measurement_type: 'temperature' })).toEqual([
      ['Intent', 'Log reading'],
      ['Run', 'STAB-105'],
    ]);
    expect(
      intentChips('record_measurement', { value: 1, unit: 'g' }, null).map((c) => c.label),
    ).toEqual(['Intent']);
  });

  it('never returns more than 4 chips', () => {
    for (const [name, outcome] of Object.entries(outcomes)) {
      if (!outcome.success || !outcome.data) continue;
      const tool = name === 'step_timer_start' ? 'step_timer' : name;
      expect(
        intentChips(tool, outcome.data, bound, { stepIndex: 0, totalSteps: 6 }).length,
      ).toBeLessThanOrEqual(4);
    }
  });
});
