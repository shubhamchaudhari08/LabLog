/**
 * How a run's status is shown (specs/005 contracts/ui-components.md §4,
 * DESIGN.md D-3). Only RUNNING is green; the states the design did not draw
 * are neutral, and clay is never used for status.
 */

export type StatusTone = 'running' | 'done' | 'ready' | 'draft' | 'paused' | 'cancelled';
export type StatusDot = 'live' | 'solid' | 'outline' | 'bars' | null;

export interface StatusPillView {
  label: string;
  tone: StatusTone;
  dot: StatusDot;
}

const KNOWN: Record<string, { tone: StatusTone; dot: StatusDot }> = {
  RUNNING: { tone: 'running', dot: 'live' },
  COMPLETED: { tone: 'done', dot: 'solid' },
  READY: { tone: 'ready', dot: 'outline' },
  DRAFT: { tone: 'draft', dot: null },
  PAUSED: { tone: 'paused', dot: 'bars' },
  CANCELLED: { tone: 'cancelled', dot: null },
};

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function statusPill(status: string): StatusPillView {
  const key = (status ?? '').toUpperCase();
  const known = KNOWN[key];
  if (known) return { label: titleCase(key), ...known };
  return { label: key ? titleCase(key) : 'Unknown', tone: 'cancelled', dot: null };
}
