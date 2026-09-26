/**
 * History filtering and sorting (specs/003-post-mvp-features FR-211).
 *
 * The date a run is filed under is when it started; an unstarted run falls
 * back to when it was created. (Seeded history is inserted "now" but started
 * days ago, so created_at alone would file every seeded run under today.)
 */

export interface HistoryRow {
  experiment_code: string;
  status: string;
  protocol_id: string | null;
  started_at: string | null;
  created_at?: string | null;
}

export interface HistoryFilter {
  status?: string; // 'ALL' or an experiment status
  protocolId?: string; // 'ALL' or a protocol id
  from?: string; // YYYY-MM-DD, local, inclusive
  to?: string; // YYYY-MM-DD, local, inclusive
}

export interface HistorySort {
  key: 'date' | 'code';
  dir: 'asc' | 'desc';
}

const TERMINAL = new Set(['COMPLETED', 'CANCELLED']);

/** Finished runs open as a read-only record; anything still live opens the bench. */
export function experimentHref(e: { id: string; status: string }): string {
  return TERMINAL.has(e.status) ? `/experiments/${e.id}` : `/dashboard/experiments/${e.id}`;
}

export function runDate(row: HistoryRow): string | null {
  return row.started_at ?? row.created_at ?? null;
}

function localDay(value: string, endOfDay: boolean): number {
  const [y, m, d] = value.split('-').map(Number);
  return endOfDay ? new Date(y, m - 1, d + 1).getTime() : new Date(y, m - 1, d).getTime();
}

export function filterAndSortExperiments<T extends HistoryRow>(rows: T[], filter: HistoryFilter, sort: HistorySort): T[] {
  const from = filter.from ? localDay(filter.from, false) : null;
  const to = filter.to ? localDay(filter.to, true) : null;

  const kept = rows.filter((row) => {
    if (filter.status && filter.status !== 'ALL' && row.status !== filter.status) return false;
    if (filter.protocolId && filter.protocolId !== 'ALL' && row.protocol_id !== filter.protocolId) return false;
    if (from !== null || to !== null) {
      const iso = runDate(row);
      if (!iso) return false;
      const t = new Date(iso).getTime();
      if (from !== null && t < from) return false;
      if (to !== null && t >= to) return false;
    }
    return true;
  });

  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...kept].sort((a, b) => {
    if (sort.key === 'code') return sign * a.experiment_code.localeCompare(b.experiment_code, undefined, { numeric: true });
    // Undated rows sort last in either direction.
    const da = runDate(a);
    const db = runDate(b);
    if (!da || !db) return da ? -1 : db ? 1 : 0;
    return sign * (new Date(da).getTime() - new Date(db).getTime());
  });
}
