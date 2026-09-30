import { describe, expect, it } from 'vitest';
import { runProgress } from '@/lib/ui/runProgress';

const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Step ${i + 1}` }));

describe('runProgress (data-model §4)', () => {
  it('reports "No protocol" for a run without steps', () => {
    expect(runProgress({ status: 'RUNNING', current_step_index: 0, protocols: null })).toEqual({
      total: 0,
      done: 0,
      currentLabel: 'No protocol',
      segments: [],
    });
    expect(
      runProgress({ status: 'DRAFT', current_step_index: 0, protocols: { steps: [] } })
        .currentLabel,
    ).toBe('No protocol');
  });

  it('marks every segment done for a COMPLETED run', () => {
    const p = runProgress({
      status: 'COMPLETED',
      current_step_index: 2,
      protocols: { steps: steps(4) },
    });
    expect(p).toEqual({
      total: 4,
      done: 4,
      currentLabel: 'Complete',
      segments: ['done', 'done', 'done', 'done'],
    });
  });

  it('puts a RUNNING run at index 0 of 6 on its first step', () => {
    const p = runProgress({
      status: 'RUNNING',
      current_step_index: 0,
      protocols: { steps: steps(6) },
    });
    expect(p.currentLabel).toBe('1 of 6 steps');
    expect(p.done).toBe(0);
    expect(p.segments).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
  });

  it('shows earlier steps as done', () => {
    const p = runProgress({
      status: 'RUNNING',
      current_step_index: 2,
      protocols: { steps: steps(4) },
    });
    expect(p.segments).toEqual(['done', 'done', 'current', 'upcoming']);
    expect(p.currentLabel).toBe('3 of 4 steps');
  });

  it('clamps an index past the end', () => {
    const p = runProgress({
      status: 'RUNNING',
      current_step_index: 9,
      protocols: { steps: steps(3) },
    });
    expect(p.done).toBe(2);
    expect(p.currentLabel).toBe('3 of 3 steps');
    expect(p.segments).toEqual(['done', 'done', 'current']);
  });

  it('clamps a negative index', () => {
    const p = runProgress({
      status: 'RUNNING',
      current_step_index: -1,
      protocols: { steps: steps(2) },
    });
    expect(p.segments).toEqual(['current', 'upcoming']);
  });
});
