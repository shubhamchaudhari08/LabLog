'use client';

/**
 * The append-only audit trail, rendered as a quiet column beside the record.
 *
 * Every row here corresponds to an `events` row, which is the proof that no
 * write bypassed the validated path.
 */

const EVENT_LABEL: Record<string, string> = {
  MEASUREMENT_CREATED: 'Measurement recorded',
  MEASUREMENT_CORRECTED: 'Measurement corrected',
  OBSERVATION_CREATED: 'Observation added',
  DEVIATION_CREATED: 'Deviation logged',
  PROTOCOL_STEP_ADDED: 'Step added',
  PROTOCOL_STEP_UPDATED: 'Step revised',
  PROTOCOL_STEP_REMOVED: 'Step removed',
  PROTOCOL_STEP_COMPLETED: 'Step completed',
  PROTOCOL_STEP_STARTED: 'Step started',
  DEVIATIONS_REVIEWED: 'Deviations reviewed',
  EXPERIMENT_COMPLETED: 'Experiment completed',
  TIMER_STARTED: 'Timer started',
  TIMER_CANCELLED: 'Timer cancelled',
};

/** The second line for a timer entry: what was timed, as the server stored it. */
function timerDetail(event: { event_type: string; payload?: Record<string, unknown> }): string | null {
  const p = event.payload ?? {};
  if (event.event_type === 'TIMER_STARTED') {
    return [p.duration_spoken, p.step_name].filter(Boolean).join(' · ') || null;
  }
  if (event.event_type === 'TIMER_CANCELLED') {
    return p.reason === 'replaced' ? 'replaced by a new timer' : ((p.step_name as string) ?? null);
  }
  return null;
}

export function ExperimentTimeline({
  events,
}: {
  events: { id: string; event_type: string; created_at: string; payload?: Record<string, unknown> }[];
}) {
  return (
    <PanelShell label="Activity" count={events.length}>
      {events.length === 0 ? (
        <Empty>Nothing has happened yet.</Empty>
      ) : (
        <ol className="px-lg py-md">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-baseline gap-sm border-b border-hairline-soft py-xs last:border-0"
            >
              <time
                dateTime={event.created_at}
                className="tabular w-16 shrink-0 font-mono text-caption text-muted"
              >
                {new Date(event.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              <span className="text-body-md text-body">
                {EVENT_LABEL[event.event_type] ?? event.event_type}
                {timerDetail(event) && (
                  <span className="block text-caption text-muted">{timerDetail(event)}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </PanelShell>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-md text-body-md text-muted">{children}</p>;
}

function PanelShell({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${label}-heading`}>
      <header className="flex items-baseline justify-between border-b border-hairline pb-xs">
        <h2 id={`${label}-heading`} className="eyebrow">
          {label}
        </h2>
        {count !== undefined && <span className="tabular text-caption text-muted">{count}</span>}
      </header>
      {children}
    </section>
  );
}
