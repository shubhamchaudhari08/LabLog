/**
 * A run's status as a pill (contracts/ui-components.md §4, DESIGN.md D-3).
 * Only RUNNING is green; the other states are neutral, and clay never marks
 * status. `live` adds a pulsing halo to the running dot.
 */
import { statusPill, type StatusTone } from '@/lib/ui/statusPill';

const LIGHT: Record<StatusTone, string> = {
  running: 'bg-status-running-bg text-status-running-text',
  done: 'bg-status-done-bg text-status-done-text',
  ready: 'border border-border-strong bg-surface-card text-ink',
  draft: 'border border-dashed border-border-strong bg-surface-card text-muted',
  paused: 'bg-surface-muted text-body',
  cancelled: 'bg-surface-muted text-muted',
};

const DOT_LIGHT: Record<StatusTone, string> = {
  running: 'bg-status-running-text',
  done: 'bg-status-done-dot',
  ready: 'border border-ink',
  draft: '',
  paused: '',
  cancelled: '',
};

export function StatusPill({
  status,
  onDark = false,
  live = false,
  className = '',
}: {
  status: string;
  onDark?: boolean;
  live?: boolean;
  className?: string;
}) {
  const view = statusPill(status);
  const running = view.tone === 'running';

  const tone = onDark
    ? running
      ? 'border border-status-running-border-dark bg-status-running-bg-dark text-status-running-on-dark'
      : 'bg-dark-muted-fill text-on-dark-body'
    : LIGHT[view.tone];
  const dotColor = onDark
    ? running
      ? 'bg-status-running-on-dark'
      : 'bg-on-dark-body'
    : DOT_LIGHT[view.tone];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-pill px-[10px] py-[4px] text-caption font-semibold ${tone} ${className}`}
    >
      {view.dot === 'bars' ? (
        <span aria-hidden className="flex h-[8px] items-stretch gap-[2px]">
          <span className="w-[2px] rounded-pill bg-current" />
          <span className="w-[2px] rounded-pill bg-current" />
        </span>
      ) : view.dot ? (
        <span aria-hidden className="relative flex h-[6px] w-[6px]">
          {live && running && (
            <span className={`absolute inset-0 animate-pulse-dot rounded-full ${dotColor}`} />
          )}
          <span className={`relative h-[6px] w-[6px] rounded-full ${dotColor}`} />
        </span>
      ) : null}
      {view.label}
    </span>
  );
}
