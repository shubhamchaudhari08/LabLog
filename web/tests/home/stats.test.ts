import { describe, expect, it } from 'vitest';
import { computeHomeStats, startOfWeek } from '@/lib/stats';

// Local times throughout: "this week" is the viewer's week.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe('startOfWeek', () => {
  it('is Monday 00:00 local, including from a Sunday night', () => {
    const sundayNight = new Date(2026, 8, 27, 23, 30); // Sun 27 Sep 2026
    const start = startOfWeek(sundayNight);
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([2026, 8, 21, 0]);
  });

  it('is the same day when now is Monday', () => {
    const start = startOfWeek(new Date(2026, 8, 21, 0, 5));
    expect(start.getDate()).toBe(21);
  });
});

describe('computeHomeStats', () => {
  const now = new Date(2026, 8, 27, 23, 30);

  it('counts this week, running, completed and runs with deviations', () => {
    const stats = computeHomeStats(
      [
        { status: 'RUNNING', created_at: at(2026, 9, 25), deviations: [{ count: 2 }] },
        { status: 'COMPLETED', created_at: at(2026, 9, 21, 0) },
        { status: 'COMPLETED', created_at: at(2026, 9, 20, 23), deviations: [{ count: 0 }] },
        { status: 'DRAFT', created_at: null, deviations: [{ count: 1 }] },
      ],
      now,
    );
    expect(stats).toEqual({ this_week: 2, running: 1, completed: 2, with_deviations: 2 });
  });

  it('is all zeros for no experiments', () => {
    expect(computeHomeStats([], now)).toEqual({ this_week: 0, running: 0, completed: 0, with_deviations: 0 });
  });
});
