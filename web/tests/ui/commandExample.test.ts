import { describe, expect, it } from 'vitest';
import { commandExample } from '@/lib/ui/commandExample';

describe('commandExample (contracts/ui-voice-surfaces.md §8)', () => {
  const ctx = { firstProtocolCode: 'PCR-01', runningCode: 'STAB-105' };

  it('suggests a reading on a workspace', () => {
    expect(commandExample('/dashboard/experiments/abc', ctx)).toBe('log pH 7.4 for sample B');
  });

  it('suggests starting a run on Experiments', () => {
    expect(commandExample('/experiments', ctx)).toBe('start a new run of PCR-01');
  });

  it('suggests resuming the running experiment elsewhere', () => {
    expect(commandExample('/dashboard', ctx)).toBe('resume STAB-105');
    expect(commandExample('/protocols', ctx)).toBe('resume STAB-105');
  });

  it('falls back to a question when nothing is running', () => {
    expect(commandExample('/dashboard', { firstProtocolCode: 'PCR-01', runningCode: null })).toBe(
      'what protocols can I run?',
    );
  });

  it('falls back on Experiments without a protocol', () => {
    expect(commandExample('/experiments', { firstProtocolCode: null, runningCode: null })).toBe(
      'what protocols can I run?',
    );
  });
});
