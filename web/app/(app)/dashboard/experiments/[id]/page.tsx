'use client';

/**
 * The Experiment Workspace.
 *
 * Three zones, divided by function. The centre is the record: samples first
 * (the question a scientist actually asks is "what do I have for A17?"), then
 * the chronological log and the audit trail. The right rail is the protocol,
 * with the current step lifted out, so "what's next" is answered by glancing
 * rather than asking. The voice dock sits at the foot of the record, where the
 * words being spoken and the values they produce are in one line of sight.
 */

import { useEffect } from 'react';
import { useParams } from 'next/navigation';

import { usePageCrumbs } from '@/components/shell/AppShell';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import { VoiceDock } from '@/components/voice/VoiceDock';
import { ProtocolSteps } from '@/components/protocol/ProtocolSteps';
import { SampleBoard } from '@/components/workspace/SampleBoard';
import { Ledger, toEntries } from '@/components/workspace/Ledger';
import { ExperimentTimeline } from '@/components/workspace/Timeline';
import { StatusBadge } from '@/components/workspace/StatusBadge';
import { IconProtocol } from '@/components/icons';
import {
  useDeviations,
  useEvents,
  useExperiment,
  useMeasurements,
  useObservations,
  useRealtimeExperiment,
  useSamples,
  type ProtocolStep,
} from '@/lib/queries/useExperiment';

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted-soft">{label}</dt>
      <dd className="tabular mt-[2px] truncate text-title-sm text-ink">{value}</dd>
    </div>
  );
}

function ProtocolRail({
  protocol,
  steps,
  currentIndex,
  completed,
  samples,
  measurements,
  observations,
}: {
  protocol?: { name?: string; version?: string; protocol_code?: string };
  steps: ProtocolStep[];
  currentIndex: number;
  completed: boolean;
  samples: Parameters<typeof ProtocolSteps>[0]['samples'];
  measurements: Parameters<typeof ProtocolSteps>[0]['measurements'];
  observations: Parameters<typeof ProtocolSteps>[0]['observations'];
}) {
  const done = completed ? steps.length : Math.min(currentIndex, steps.length);
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;

  return (
    <section aria-labelledby="protocol-heading" className="flex h-full flex-col">
      <header className="border-b border-hairline px-lg pb-md pt-lg">
        <p className="eyebrow flex items-center gap-xs">
          <IconProtocol className="h-4 w-4 text-primary" />
          Protocol in use
          {protocol?.protocol_code && (
            <span className="font-mono text-muted">{protocol.protocol_code}</span>
          )}
        </p>
        <h2 id="protocol-heading" className="mt-xs text-[26px] leading-tight">
          {protocol?.name ?? 'No protocol'}
          {protocol?.version && (
            <span className="ml-xs align-middle font-sans text-caption text-muted-soft">
              {protocol.version}
            </span>
          )}
        </h2>
        <div className="mt-md flex items-center gap-sm">
          <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-card">
            <div
              className="h-full rounded-pill bg-gradient-to-r from-accent-teal to-primary transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="tabular text-caption text-muted">
            {completed ? 'Complete' : `Step ${Math.min(currentIndex + 1, steps.length)} of ${steps.length}`}
          </span>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-md py-sm">
        <ProtocolSteps
          steps={steps}
          currentIndex={currentIndex}
          completed={completed}
          samples={samples}
          measurements={measurements}
          observations={observations}
        />
      </div>
    </section>
  );
}

export default function ExperimentWorkspace() {
  const params = useParams<{ id: string }>();
  const experimentId = params.id;
  const voice = useVoiceSession();

  useRealtimeExperiment(experimentId);

  const experiment = useExperiment(experimentId);
  const samples = useSamples(experimentId);
  const measurements = useMeasurements(experimentId);
  const observations = useObservations(experimentId);
  const deviations = useDeviations(experimentId);
  const events = useEvents(experimentId);

  const code = experiment.data?.experiment_code as string | undefined;
  const { bind } = voice;
  useEffect(() => {
    if (code) bind({ id: experimentId, code });
  }, [bind, experimentId, code]);

  usePageCrumbs([
    { label: 'Experiments', href: '/experiments' },
    { label: code ?? '…' },
  ]);

  const previousById = Object.fromEntries(
    (events.data ?? [])
      .filter((e) => e.event_type === 'MEASUREMENT_CORRECTED')
      .map((e) => [e.entity_id, Number(e.payload?.from)]),
  );

  const protocol = experiment.data?.protocols as
    | { name?: string; version?: string; protocol_code?: string; steps?: ProtocolStep[] }
    | undefined;
  const steps = protocol?.steps ?? [];
  const status: string = experiment.data?.status ?? 'DRAFT';
  const currentIndex: number = experiment.data?.current_step_index ?? 0;
  const completed = status === 'COMPLETED';

  const entries = toEntries(measurements.data ?? [], observations.data ?? [], deviations.data ?? []);
  const started = experiment.data?.started_at
    ? new Date(experiment.data.started_at).toLocaleString([], {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not started';

  // Held back until the experiment loads, so the rail starts on the real step
  // instead of animating from a placeholder index of 0.
  const rail = experiment.isLoading ? (
    <div className="space-y-sm p-lg" aria-hidden>
      <div className="skeleton h-4 w-32" />
      <div className="skeleton h-7 w-3/4" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-12 rounded-lg" />
      ))}
    </div>
  ) : (
    <ProtocolRail
      protocol={protocol}
      steps={steps}
      currentIndex={currentIndex}
      completed={completed}
      samples={samples.data ?? []}
      measurements={measurements.data ?? []}
      observations={observations.data ?? []}
    />
  );

  if (experiment.isError) {
    return (
      <main id="main" className="page">
        <h1 className="page-title">Experiment unavailable</h1>
        <p className="mt-sm max-w-[52ch] text-body-md text-muted">
          It may have been removed by a reseed, or this account does not own it.
        </p>
      </main>
    );
  }

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_400px]">
      <main id="main" className="min-w-0 px-md pb-lg pt-lg sm:px-lg lg:px-xl lg:pt-xl">
        {/* header */}
        <header className="bloom -mx-md -mt-lg px-md pb-lg pt-lg sm:-mx-lg sm:px-lg lg:-mx-xl lg:-mt-xl lg:px-xl lg:pt-xl">
          <div className="flex flex-wrap items-center gap-sm">
            <StatusBadge status={status} />
            <span className="font-mono text-caption text-muted">{code}</span>
          </div>
          {experiment.isLoading ? (
            <div className="skeleton mt-sm h-12 w-2/3" />
          ) : (
            <h1 className="page-title mt-sm max-w-[22ch] animate-rise">{experiment.data?.name}</h1>
          )}
          <dl className="mt-lg grid max-w-[720px] grid-cols-2 gap-md sm:grid-cols-4">
            <Stat label="Started" value={started} />
            <Stat label="Samples" value={samples.data?.length ?? '—'} />
            <Stat label="Readings" value={measurements.data?.length ?? '—'} />
            <Stat
              label="Deviations"
              value={
                <span className={deviations.data?.length ? 'text-warning' : undefined}>
                  {deviations.data?.length ?? '—'}
                </span>
              }
            />
          </dl>
        </header>

        {/* below xl the protocol rail joins the flow, just under the header */}
        <div className="card mt-lg overflow-hidden xl:hidden">{rail}</div>

        <section className="mt-xl" aria-labelledby="samples-heading">
          <div className="flex items-baseline justify-between border-b border-hairline pb-xs">
            <h2 id="samples-heading" className="panel-label">
              Samples
            </h2>
            <span className="text-caption text-muted-soft">latest reading per sample</span>
          </div>
          <div className="pt-md">
            <SampleBoard
              samples={samples.data ?? []}
              measurements={measurements.data ?? []}
              previousById={previousById}
              loading={samples.isLoading || measurements.isLoading}
            />
          </div>
        </section>

        <div className="mt-xxl grid gap-xxl lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)] lg:gap-xl">
          <Ledger entries={entries} loading={measurements.isLoading} />
          <ExperimentTimeline events={events.data ?? []} />
        </div>

        <VoiceDock experimentId={experimentId} experimentCode={code ?? '—'} />
      </main>

      {/* the rail: sticky under the header, scrolls on its own */}
      <aside
        aria-label="Protocol"
        className="sticky top-16 hidden h-[calc(100dvh-4rem)] border-l border-hairline bg-surface-soft/60 [--rail-bg:#f7f3ec] xl:block"
      >
        {rail}
      </aside>
    </div>
  );
}
