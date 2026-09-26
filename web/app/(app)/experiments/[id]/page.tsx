'use client';

/**
 * An experiment as a record (specs/003-post-mvp-features FR-212, research R-210).
 *
 * The same panels as the workspace, arranged to be read rather than worked at:
 * no microphone, no live subscription, and no voice session is bound here, so
 * opening a finished run can never point the microphone at it. Anything still
 * live links through to the bench instead.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { usePageCrumbs } from '@/components/shell/AppShell';
import { ProtocolSteps } from '@/components/protocol/ProtocolSteps';
import { SampleBoard } from '@/components/workspace/SampleBoard';
import { Ledger, toEntries } from '@/components/workspace/Ledger';
import { ExperimentTimeline } from '@/components/workspace/Timeline';
import { StatusBadge } from '@/components/workspace/StatusBadge';
import { IconArrow } from '@/components/icons';
import {
  useDeviations,
  useEvents,
  useExperiment,
  useMeasurements,
  useObservations,
  useSamples,
  type ProtocolStep,
} from '@/lib/queries/useExperiment';

const LIVE = new Set(['DRAFT', 'READY', 'RUNNING', 'PAUSED']);

function stamp(iso?: string | null) {
  return iso
    ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
}

function duration(from?: string | null, to?: string | null) {
  if (!from || !to) return '—';
  const minutes = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted-soft">{label}</dt>
      <dd className="tabular mt-[2px] truncate text-title-sm text-ink">{value}</dd>
    </div>
  );
}

export default function ExperimentRecord() {
  const params = useParams<{ id: string }>();
  const experimentId = params.id;

  const experiment = useExperiment(experimentId);
  const samples = useSamples(experimentId);
  const measurements = useMeasurements(experimentId);
  const observations = useObservations(experimentId);
  const deviations = useDeviations(experimentId);
  const events = useEvents(experimentId);

  const code = experiment.data?.experiment_code as string | undefined;
  usePageCrumbs([{ label: 'Experiments', href: '/experiments' }, { label: code ?? '…' }]);

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

  const data = experiment.data;
  const protocol = data?.protocols as
    | { name?: string; version?: string; protocol_code?: string; steps?: ProtocolStep[] }
    | undefined;
  const steps = protocol?.steps ?? [];
  const status: string = data?.status ?? 'DRAFT';
  const completed = status === 'COMPLETED';

  const previousById = Object.fromEntries(
    (events.data ?? [])
      .filter((e) => e.event_type === 'MEASUREMENT_CORRECTED')
      .map((e) => [e.entity_id, Number(e.payload?.from)]),
  );
  const corrections = Object.keys(previousById).length;
  const entries = toEntries(measurements.data ?? [], observations.data ?? [], deviations.data ?? []);

  return (
    <main id="main" className="page">
      <header className="animate-rise">
        <div className="flex flex-wrap items-center gap-sm">
          <StatusBadge status={status} />
          <span className="font-mono text-caption text-muted">{code}</span>
          <span className="badge">Read-only record</span>
        </div>
        {experiment.isLoading ? (
          <div className="skeleton mt-sm h-12 w-2/3" />
        ) : (
          <h1 className="page-title mt-sm max-w-[26ch]">{data?.name}</h1>
        )}
        {data?.description && <p className="mt-xs max-w-[64ch] text-body-md text-muted">{data.description}</p>}

        <dl className="mt-lg grid max-w-[880px] grid-cols-2 gap-md sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Protocol"
            value={protocol?.protocol_code ? `${protocol.protocol_code} ${protocol.version ?? ''}`.trim() : 'None'}
          />
          <Stat label="Started" value={stamp(data?.started_at)} />
          <Stat label={completed ? 'Completed' : 'Ended'} value={stamp(data?.completed_at)} />
          <Stat label="Duration" value={duration(data?.started_at, data?.completed_at)} />
          <Stat label="Readings" value={measurements.data?.length ?? '—'} />
          <Stat
            label="Deviations"
            value={
              <span className={deviations.data?.length ? 'text-warning' : undefined}>{deviations.data?.length ?? '—'}</span>
            }
          />
        </dl>
        {corrections > 0 && (
          <p className="mt-sm text-caption text-muted">
            {corrections} {corrections === 1 ? 'value was' : 'values were'} corrected. Earlier values stay in the audit trail.
          </p>
        )}

        {LIVE.has(status) && (
          <Link href={`/dashboard/experiments/${experimentId}`} className="btn-primary mt-md inline-flex">
            Open at the bench
            <IconArrow className="h-4 w-4" />
          </Link>
        )}
      </header>

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

      <section className="card mt-xxl overflow-hidden" aria-labelledby="protocol-heading">
        <header className="border-b border-hairline px-lg py-md">
          <h2 id="protocol-heading" className="text-title-md text-ink">
            {protocol?.name ?? 'No protocol'}
            {protocol?.version && <span className="ml-xs text-caption text-muted-soft">{protocol.version}</span>}
          </h2>
        </header>
        <div className="px-md py-sm">
          {experiment.isLoading ? (
            <div className="skeleton h-24 rounded-lg" />
          ) : steps.length ? (
            <ProtocolSteps
              steps={steps}
              currentIndex={data?.current_step_index ?? 0}
              completed={completed}
              samples={samples.data ?? []}
              measurements={measurements.data ?? []}
              observations={observations.data ?? []}
              readOnly
            />
          ) : (
            <p className="px-sm py-md text-body-sm text-muted">This run had no protocol attached.</p>
          )}
        </div>
      </section>
    </main>
  );
}
