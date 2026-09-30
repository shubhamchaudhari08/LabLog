import { describe, expect, it } from 'vitest';
import { statusPill } from '@/lib/ui/statusPill';

describe('statusPill (contracts/ui-components.md §4)', () => {
  it.each([
    ['RUNNING', 'Running', 'running', 'live'],
    ['COMPLETED', 'Completed', 'done', 'solid'],
    ['READY', 'Ready', 'ready', 'outline'],
    ['DRAFT', 'Draft', 'draft', null],
    ['PAUSED', 'Paused', 'paused', 'bars'],
    ['CANCELLED', 'Cancelled', 'cancelled', null],
  ])('%s → %s / %s / %s', (status, label, tone, dot) => {
    expect(statusPill(status)).toEqual({ label, tone, dot });
  });

  it('is case-insensitive', () => {
    expect(statusPill('running').tone).toBe('running');
  });

  it('falls back to the cancelled tone with the raw label for an unknown status, without throwing', () => {
    expect(statusPill('ARCHIVED')).toEqual({ label: 'Archived', tone: 'cancelled', dot: null });
    expect(statusPill('')).toEqual({ label: 'Unknown', tone: 'cancelled', dot: null });
  });
});
