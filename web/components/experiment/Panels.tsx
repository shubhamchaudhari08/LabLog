'use client';

/**
 * The supporting workspace panels.
 *
 * Grouped in one file because they share a visual grammar and one owner
 * (Stream F); splitting them would be five files of imports for eighty lines of
 * markup.
 *
 * DESIGN.md mapping: cream canvas panels with hairline borders, serif display
 * for the experiment name, coral reserved for the live/primary state, amber for
 * deviations (a warm warning that does not read as an error — a deviation is a
 * normal part of lab work that must be *recorded*, not a fault).
 */

import type { ReactNode } from 'react';

const STATUS_TONE: Record<string, string> = {
  RUNNING: 'border-success/30 bg-success/10 text-success',
  COMPLETED: 'border-hairline bg-surface-card text-muted',
  PAUSED: 'border-accent-amber/30 bg-accent-amber/10 text-warning',
  CANCELLED: 'border-error/25 bg-error/10 text-error',
};

export function ExperimentHeader({
  code,
  name,
  status,
  protocolName,
  protocolVersion,
  userEmail,
}: {
  code: string;
  name: string;
  status: string;
  protocolName?: string;
  protocolVersion?: string;
  userEmail?: string | null;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-md">
      <div>
        <div className="flex items-center gap-sm">
          <span className="font-mono text-caption uppercase tracking-[1.5px] text-muted">
            {code}
          </span>
          <span
            className={`rounded-sm border px-xs py-[3px] text-caption-upper uppercase ${
              STATUS_TONE[status] ?? 'border-hairline bg-surface-card text-muted'
            }`}
          >
            {status.toLowerCase()}
          </span>
        </div>
        <h1 className="mt-xs max-w-[22ch] text-display-md">{name}</h1>
        {protocolName && (
          <p className="mt-xs text-body-sm text-muted">
            {protocolName} <span className="text-muted-soft">{protocolVersion}</span>
          </p>
        )}
      </div>
      {userEmail && <p className="text-body-sm text-muted-soft">{userEmail}</p>}
    </header>
  );
}

export interface ProtocolStep {
  index: number;
  id: string;
  name: string;
  required_fields?: string[];
}

export function ProtocolProgress({
  steps,
  currentIndex,
}: {
  steps: ProtocolStep[];
  currentIndex: number;
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2 className="panel-label">Protocol</h2>
        <span className="text-caption text-muted-soft tabular">
          {Math.min(currentIndex + 1, steps.length)} / {steps.length}
        </span>
      </header>
      <ol className="px-lg py-md">
        {steps.map((step) => {
          const done = step.index < currentIndex;
          const current = step.index === currentIndex;
          return (
            <li key={step.id} className="relative flex items-start gap-sm py-[6px] pl-lg">
              <span
                aria-hidden
                className={`absolute left-[7px] top-[24px] h-[calc(100%-14px)] w-px ${
                  done ? 'bg-success/35' : 'bg-hairline'
                }`}
              />
              <span
                aria-hidden
                className={`absolute left-0 top-[7px] grid h-[15px] w-[15px] place-items-center rounded-pill border text-[9px] leading-none ${
                  done
                    ? 'border-success/40 bg-success/15 text-success'
                    : current
                      ? 'border-primary bg-primary text-on-primary'
                      : 'border-hairline bg-canvas text-muted-soft'
                }`}
              >
                {done ? '✓' : ''}
              </span>
              <span
                className={
                  current
                    ? 'text-title-sm text-ink'
                    : done
                      ? 'text-body-sm text-muted'
                      : 'text-body-sm text-muted-soft'
                }
              >
                {step.name}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function SamplePanel({
  samples,
}: {
  samples: { id: string; sample_code: string; sample_type?: string }[];
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2 className="panel-label">Samples</h2>
      </header>
      <ul className="flex flex-wrap gap-xs px-lg py-md">
        {samples.map((sample) => (
          <li
            key={sample.id}
            className={`rounded-sm border px-sm py-xxs font-mono text-body-sm transition-colors ${
              sample.sample_type === 'control'
                ? 'border-hairline bg-surface-card text-muted'
                : 'border-hairline bg-canvas text-ink hover:border-primary/40'
            }`}
          >
            {sample.sample_code}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ObservationPanel({
  observations,
}: {
  observations: {
    id: string;
    observation: string;
    recorded_at: string;
    samples?: { sample_code: string } | null;
  }[];
}) {
  return (
    <PanelShell label="Observations" count={observations.length}>
      {observations.length === 0 ? (
        <Empty>No observations yet.</Empty>
      ) : (
        <ul className="space-y-sm px-lg py-md">
          {observations.map((observation) => (
            <li key={observation.id} className="animate-rise border-l-2 border-hairline pl-sm">
              {observation.samples?.sample_code && (
                <span className="mr-xs font-mono text-caption text-muted">
                  {observation.samples.sample_code}
                </span>
              )}
              <span className="text-body-sm text-body">{observation.observation}</span>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

export function DeviationPanel({
  deviations,
}: {
  deviations: {
    id: string;
    description: string;
    reason?: string | null;
    severity?: string;
    type?: string | null;
  }[];
}) {
  return (
    <PanelShell label="Deviations" count={deviations.length}>
      {deviations.length === 0 ? (
        <Empty>No deviations logged.</Empty>
      ) : (
        <ul className="space-y-sm px-lg py-md">
          {deviations.map((deviation) => (
            <li
              key={deviation.id}
              // Amber, not red: a deviation is a normal part of lab work that
              // must be recorded, not a fault to be alarmed about.
              className="animate-rise rounded-sm border-l-2 border-accent-amber bg-accent-amber/[0.07] px-sm py-xs"
            >
              <p className="text-body-sm text-ink">{deviation.description}</p>
              {deviation.reason && (
                <p className="mt-xxs text-caption text-muted">{deviation.reason}</p>
              )}
              {deviation.type && <span className="badge mt-xs">{deviation.type}</span>}
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

const EVENT_LABEL: Record<string, string> = {
  MEASUREMENT_CREATED: 'Measurement recorded',
  MEASUREMENT_CORRECTED: 'Measurement corrected',
  OBSERVATION_CREATED: 'Observation added',
  DEVIATION_CREATED: 'Deviation logged',
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

function PanelShell({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2 className="panel-label">{label}</h2>
        {count !== undefined && <span className="tabular text-caption text-muted-soft">{count}</span>}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-lg py-lg text-body-sm text-muted-soft">{children}</p>;
}

/** Matches the shape of a loaded panel, so the layout does not jump. */
export function PanelSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-xs px-lg py-md" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${88 - i * 22}%` }} />
      ))}
    </div>
  );
}
