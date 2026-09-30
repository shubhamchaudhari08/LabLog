import { describe, expect, it } from 'vitest';
import { overviewFilter, type OverviewTile } from '@/lib/ui/overviewFilter';
import { computeHomeStats } from '@/lib/stats';

// Local times: "this week" is the viewer's week. 27 Sep 2026 is a Sunday, so
// the week began Monday 21 Sep 00:00.
const at = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h).toISOString();
const now = new Date(2026, 8, 27, 10);

const runs = [
  { id: '1', status: 'RUNNING', created_at: at(9, 26), deviations: [{ count: 0 }] },
  { id: '2', status: 'RUNNING', created_at: at(9, 25), deviations: [{ count: 0 }] },
  { id: '3', status: 'COMPLETED', created_at: at(9, 21, 0), deviations: [{ count: 1 }] },
  { id: '4', status: 'COMPLETED', created_at: at(9, 20, 23), deviations: [{ count: 0 }] }, // the Sunday before
  { id: '5', status: 'COMPLETED', created_at: at(9, 13) },
  { id: '6', status: 'COMPLETED', created_at: at(9, 9) },
  { id: '7', status: 'COMPLETED', created_at: at(9, 5) },
  { id: '8', status: 'COMPLETED', created_at: at(9, 1) },
];

describe('overviewFilter (data-model §3)', () => {
  const stats = computeHomeStats(runs, now);
  const cases: [OverviewTile, number][] = [
    ['week', stats.this_week],
    ['running', stats.running],
    ['completed', stats.completed],
    ['deviations', stats.with_deviations],
  ];

  it('has the fixture the task describes', () => {
    expect(stats).toEqual({ this_week: 3, running: 2, completed: 6, with_deviations: 1 });
  });

  it.each(cases)('%s lists exactly as many runs as its tile counts (%i)', (tile, count) => {
    expect(overviewFilter(runs, tile, now)).toHaveLength(count);
  });

  it('draws the week boundary at Monday 00:00', () => {
    expect(overviewFilter(runs, 'week', now).map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('returns every run with no tile selected', () => {
    expect(overviewFilter(runs, null, now)).toHaveLength(8);
  });
});
