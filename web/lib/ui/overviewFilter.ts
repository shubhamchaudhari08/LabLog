/**
 * Overview's stat tiles filter Recent runs (specs/005 data-model §3). Each
 * filter uses the same rule as the count on its tile, so the list always has
 * exactly as many rows as the tile says.
 */
import { startOfWeek } from '@/lib/stats';

export type OverviewTile = 'week' | 'running' | 'completed' | 'deviations';

interface Row {
  status: string;
  created_at?: string | null;
  deviations?: { count: number }[];
}

export function overviewFilter<T extends Row>(
  runs: T[],
  tile: OverviewTile | null,
  now: Date = new Date(),
): T[] {
  switch (tile) {
    case 'week': {
      const weekStart = startOfWeek(now).getTime();
      return runs.filter((r) => r.created_at && new Date(r.created_at).getTime() >= weekStart);
    }
    case 'running':
      return runs.filter((r) => r.status === 'RUNNING');
    case 'completed':
      return runs.filter((r) => r.status === 'COMPLETED');
    case 'deviations':
      return runs.filter((r) => (r.deviations?.[0]?.count ?? 0) > 0);
    default:
      return runs;
  }
}
