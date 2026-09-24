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
  EXPERIMENT_COMPLETED: 'Experiment completed',
};

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
                className="tabular w-16 shrink-0 font-mono text-caption text-muted-soft"
              >
                {new Date(event.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              <span className="text-body-sm text-body">
                {EVENT_LABEL[event.event_type] ?? event.event_type}
              </span>
            </li>
          ))}
        </ol>
      )}
    </PanelShell>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-md text-body-sm text-muted-soft">{children}</p>;
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
        <h2 id={`${label}-heading`} className="panel-label">
          {label}
        </h2>
        {count !== undefined && <span className="tabular text-caption text-muted-soft">{count}</span>}
      </header>
      {children}
    </section>
  );
}
