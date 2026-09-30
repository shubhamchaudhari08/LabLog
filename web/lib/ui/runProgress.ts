/**
 * Where a run is in its protocol (specs/005 data-model §4). One derivation
 * feeds the Overview ring and step bar, the Recent-runs progress dots, the
 * Experiments drawer and the bench step rail, so they can never disagree.
 */

export type Segment = 'done' | 'current' | 'upcoming';

export interface RunProgress {
  total: number;
  done: number;
  currentLabel: string;
  segments: Segment[];
}

export interface RunProgressInput {
  status: string;
  current_step_index: number;
  protocols?: { steps?: unknown[] | null } | null;
}

export function runProgress(run: RunProgressInput): RunProgress {
  const total = run.protocols?.steps?.length ?? 0;
  if (total === 0) return { total: 0, done: 0, currentLabel: 'No protocol', segments: [] };

  if (run.status === 'COMPLETED') {
    return { total, done: total, currentLabel: 'Complete', segments: Array(total).fill('done') };
  }

  const current = Math.min(Math.max(run.current_step_index ?? 0, 0), total - 1);
  return {
    total,
    done: current,
    currentLabel: `${current + 1} of ${total} steps`,
    segments: Array.from({ length: total }, (_, i): Segment =>
      i < current ? 'done' : i === current ? 'current' : 'upcoming',
    ),
  };
}
