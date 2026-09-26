/**
 * Home stats (specs/003-post-mvp-features FR-210, research R-211).
 *
 * Computed from rows the browser already reads under RLS. A Postgres view
 * would run with its owner's rights and bypass RLS unless created
 * security_invoker, which buys nothing at this scale.
 */

export interface StatRow {
  status: string;
  created_at?: string | null;
  deviations?: { count: number }[];
}

export interface HomeStats {
  this_week: number;
  running: number;
  completed: number;
  with_deviations: number;
}

/** Local Monday 00:00 of the week containing `now`. */
export function startOfWeek(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - sinceMonday);
  return start;
}

export function computeHomeStats(rows: StatRow[], now: Date = new Date()): HomeStats {
  const weekStart = startOfWeek(now).getTime();
  return {
    this_week: rows.filter((r) => r.created_at && new Date(r.created_at).getTime() >= weekStart).length,
    running: rows.filter((r) => r.status === 'RUNNING').length,
    completed: rows.filter((r) => r.status === 'COMPLETED').length,
    with_deviations: rows.filter((r) => (r.deviations?.[0]?.count ?? 0) > 0).length,
  };
}
