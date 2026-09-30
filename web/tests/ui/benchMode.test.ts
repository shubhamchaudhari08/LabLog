import { describe, expect, it } from 'vitest';
import { isBenchPath } from '@/lib/ui/benchMode';

describe('isBenchPath (contracts/ui-routes.md §1)', () => {
  it.each(['/dashboard/experiments/abc/bench', '/dashboard/experiments/abc/bench/'])(
    'matches %s',
    (p) => {
      expect(isBenchPath(p)).toBe(true);
    },
  );

  it.each([
    '/dashboard/experiments/abc',
    '/experiments/abc/bench',
    '/dashboard/experiments/bench',
    '/dashboard/experiments/abc/bench/extra',
  ])('does not match %s', (p) => {
    expect(isBenchPath(p)).toBe(false);
  });
});
