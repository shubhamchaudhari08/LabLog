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

import { useEffect, useRef } from 'react';
import { usePathname, useParams, useRouter, useSearchParams } from 'next/navigation';

import { usePageCrumbs } from '@/components/shell/AppShell';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import { ProtocolSteps } from '@/components/protocol/ProtocolSteps';
import { useStepTimers } from '@/components/timer/StepTimerProvider';
import { StepTimerSlot } from '@/components/timer/TimerChip';
import { SampleBoard } from '@/components/workspace/SampleBoard';
import { Ledger, toEntries } from '@/components/workspace/Ledger';
import { ExperimentTimeline } from '@/components/workspace/Timeline';
import { StatusBadge } from '@/components/workspace/StatusBadge';
import { StartBar } from '@/components/workspace/StartBar';
import { ButtonLink } from '@/components/ui/Button';
import { IconMic, IconProtocol } from '@/components/icons';
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
import { runProgress } from '@/lib/ui/runProgress';

function Stat({ label, value, numeral = false }: { label: string; value: React.ReactNode; numeral?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-body">{label}</dt>
      <dd
        className={`tabular mt-[2px] truncate text-ink ${numeral ? 'font-display text-numeral-sm' : 'pt-[6px] text-title-sm'}`}
      >
        {value}
      </dd>
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
  timerSlot,
}: {
  protocol?: { name?: string; version?: string; protocol_code?: string };
  steps: ProtocolStep[];
  currentIndex: number;
  completed: boolean;
  samples: Parameters<typeof ProtocolSteps>[0]['samples'];
  measurements: Parameters<typeof ProtocolSteps>[0]['measurements'];
  observations: Parameters<typeof ProtocolSteps>[0]['observations'];
  timerSlot?: Parameters<typeof ProtocolSteps>[0]['timerSlot'];
}) {
  const progress = runProgress({
    status: completed ? 'COMPLETED' : 'RUNNING',
    current_step_index: currentIndex,
    protocols: { steps },
  });

  return (
    <section aria-labelledby="protocol-heading" className="flex h-full flex-col">
      <header className="border-b border-hairline px-lg pb-md pt-lg">
        <p className="eyebrow flex items-center gap-xs">
          <IconProtocol className="h-4 w-4 text-primary" />
          Protocol in use
          {protocol?.protocol_code && <span className="font-mono normal-case tracking-normal">{protocol.protocol_code}</span>}
        </p>
        <h2 id="protocol-heading" className="mt-xs line-clamp-2 text-display-sm leading-tight" title={protocol?.name}>
          {protocol?.name ?? 'No protocol'}
          {protocol?.version && (
            <span className="ml-xs align-middle font-sans text-caption text-muted">{protocol.version}</span>
          )}
        </h2>
        {progress.segments.length > 0 && (
          <div className="mt-md flex items-center gap-sm">
            <div className="flex flex-1 gap-[4px]">
              {progress.segments.map((segment, i) => (
                <span
                  key={i}
                  className={`h-[5px] flex-1 rounded-pill ${
                    segment === 'done' ? 'bg-status-done-dot' : segment === 'current' ? 'bg-primary' : 'bg-surface-muted-strong'
                  }`}
                />
              ))}
            </div>
            <span className="tabular whitespace-nowrap text-caption text-body">
              {completed ? 'Complete' : progress.currentLabel.replace(' steps', '')}
            </span>
          </div>
        )}
      </header>
      <div className="flex-1 overflow-y-auto px-md py-sm">
        <ProtocolSteps
          steps={steps}
          currentIndex={currentIndex}
          completed={completed}
          samples={samples}
          measurements={measurements}
          observations={observations}
          timerSlot={timerSlot}
        />
      </div>
    </section>
  );
}

export default function ExperimentWorkspace() {
  const params = useParams<{ id: string }>();
  const experimentId = params.id;
  const voice = useVoiceSession();
  const timers = useStepTimers();

  useRealtimeExperiment(experimentId);

  const experiment = useExperiment(experimentId);
  const samples = useSamples(experimentId);
  const measurements = useMeasurements(experimentId);
  const observations = useObservations(experimentId);
  const deviations = useDeviations(experimentId);
  const events = useEvents(experimentId);

  const code = experiment.data?.experiment_code as string | undefined;
  const loadedStatus = experiment.data?.status as string | undefined;
  const closed = loadedStatus === 'COMPLETED' || loadedStatus === 'CANCELLED';
  const { bind, unbind } = voice;
  // A finished run is never bound: the microphone would have nothing to record into.
  useEffect(() => {
    if (code && loadedStatus && !closed) bind({ id: experimentId, code });
    return () => unbind(experimentId);
  }, [bind, unbind, experimentId, code, loadedStatus, closed]);

  // "Ask about this run by voice" (Experiments drawer) arrives with ?voice=1.
  // Start once this run is bound, so the session is its session (specs/005 U1).
  const router = useRouter();
  const pathname = usePathname();
  const askedForVoice = useSearchParams().get('voice') === '1';
  const voiceStarted = useRef(false);
  useEffect(() => {
    if (!askedForVoice || voiceStarted.current || closed) return;
    if (voice.bound?.id !== experimentId || voice.live) return;
    voiceStarted.current = true;
    voice.startVoice();
    router.replace(pathname, { scroll: false });
  }, [askedForVoice, closed, voice, experimentId, router, pathname]);

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
      timerSlot={
        // Timers exist only on a RUNNING run, and only for the experiment the
        // timer provider is watching (a live session bound elsewhere keeps its own).
        status === 'RUNNING' && timers.watched?.id === experimentId
          ? (index) => <StepTimerSlot stepIndex={index} currentIndex={currentIndex} />
          : undefined
      }
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
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_380px]">
      <main id="main" className="min-w-0 px-md pb-dock pt-lg sm:px-xl lg:px-page-x lg:pt-page-top">
        <header>
          <div className="flex flex-wrap items-center gap-sm">
            <StatusBadge status={status} live />
            <span className="font-mono text-caption text-muted">{code}</span>
            {status === 'RUNNING' && (
              <ButtonLink href={`/dashboard/experiments/${experimentId}/bench`} className="ml-auto">
                <IconMic className="h-[18px] w-[18px]" />
                Open bench mode
              </ButtonLink>
            )}
          </div>
          {experiment.isLoading ? (
            <div className="skeleton mt-sm h-12 w-2/3" />
          ) : (
            <h1 className="page-title mt-sm line-clamp-2 max-w-[22ch] animate-rise" title={experiment.data?.name}>
              {experiment.data?.name}
            </h1>
          )}
          <dl className="mt-lg grid max-w-[720px] grid-cols-2 gap-md sm:grid-cols-4">
            <Stat label="Started" value={started} />
            <Stat label="Samples" value={samples.data?.length ?? '—'} numeral />
            <Stat label="Readings" value={measurements.data?.length ?? '—'} numeral />
            <Stat
              label="Deviations"
              numeral
              value={
                <span className={deviations.data?.length ? 'text-deviation-text' : undefined}>
                  {deviations.data?.length ?? '—'}
                </span>
              }
            />
          </dl>
          {experiment.data && (
            <StartBar experimentId={experimentId} status={status} hasProtocol={Boolean(experiment.data.protocol_id)} />
          )}
        </header>

        {/* below xl the protocol rail joins the flow, just under the header */}
        <div className="mt-lg overflow-hidden rounded-card border border-hairline bg-surface-rail xl:hidden">{rail}</div>

        <section className="mt-xl" aria-labelledby="samples-heading">
          <div className="flex items-baseline justify-between border-b border-hairline pb-xs">
            <h2 id="samples-heading" className="eyebrow">
              Samples
            </h2>
            <span className="text-caption text-muted">latest reading per sample</span>
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

      </main>

      {/* the rail: sticky under the header, scrolls on its own */}
      <aside
        aria-label="Protocol"
        className="sticky top-[68px] hidden h-[calc(100dvh-68px)] border-l border-hairline bg-surface-rail xl:block"
      >
        {rail}
      </aside>
    </div>
  );
}
