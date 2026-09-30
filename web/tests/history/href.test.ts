import { describe, expect, it } from 'vitest';
import { openAction } from '@/lib/history';

// specs/006 US3: what the app does with search_experiments' `opened`.
describe('openAction', () => {
  const opened = (status: string) => ({ experiment_id: 'x', experiment_code: 'STAB-9', status });

  it('hands a running run over to recording', () => {
    expect(openAction(opened('RUNNING'))).toEqual({ switchTo: { id: 'x', code: 'STAB-9' } });
  });

  it('opens a finished run read-only', () => {
    expect(openAction(opened('COMPLETED'))).toEqual({ navigate: '/experiments/x' });
    expect(openAction(opened('CANCELLED'))).toEqual({ navigate: '/experiments/x' });
  });

  it('opens an unstarted run in its workspace', () => {
    for (const status of ['DRAFT', 'READY', 'PAUSED']) {
      expect(openAction(opened(status))).toEqual({ navigate: '/dashboard/experiments/x' });
    }
  });

  it('does nothing without exactly one match', () => {
    expect(openAction(null)).toBeNull();
    expect(openAction(undefined)).toBeNull();
    expect(openAction({ experiment_id: 5 })).toBeNull();
  });
});
