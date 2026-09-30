'use client';

/**
 * Bench mode (specs/005 US2; DESIGN.md Bench Frame, D-12): full-screen and
 * dark, for working with busy hands. The step rail on the left, the microphone
 * in the middle, and on the right everything this session has written to the
 * record. Exit bench returns to the light workspace; the session and any step
 * timer carry on, because their providers sit above this route.
 */
import { useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { usePageCrumbs } from '@/components/shell/AppShell';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import { useStepTimers } from '@/components/timer/StepTimerProvider';
import { BenchHeader } from '@/components/bench/BenchHeader';
import { StepRail } from '@/components/bench/StepRail';
import { BenchCenter } from '@/components/bench/BenchCenter';
import { CaptureLog } from '@/components/bench/CaptureLog';
import { ButtonLink } from '@/components/ui/Button';
import {
  useDeviations,
  useEvents,
  useExperiment,
  useRealtimeExperiment,
  type ProtocolStep,
} from '@/lib/queries/useExperiment';
import { useMeasurementTypes } from '@/lib/queries/useMeasurementTypes';
import { captureEntries, type EventRow } from '@/lib/ui/captureEntries';
import { runProgress } from '@/lib/ui/runProgress';

const CLOSED = new Set(['COMPLETED', 'CANCELLED']);

export default function BenchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const voice = useVoiceSession();
  const timers = useStepTimers();
  const types = useMeasurementTypes();

  useRealtimeExperiment(id);
  const experiment = useExperiment(id);
  const deviations = useDeviations(id);
  const events = useEvents(id);

  const data = experiment.data;
  const code = data?.experiment_code as string | undefined;
  const status = (data?.status as string | undefined) ?? '';
  const closed = CLOSED.has(status);

  usePageCrumbs([
    { label: 'Experiments', href: '/experiments' },
    { label: code ?? '…' },
    { label: 'Bench' },
  ]);

  // A run that was already finished when this page opened has nothing to
  // record into: show its record instead, and never bind the microphone to it
  // (contracts/ui-routes.md §3–§4). A run finished from here stays, with Open
  // record in the log's footer, so the first status seen is what decides.
  const firstStatus = useRef<string | null>(null);
  if (firstStatus.current === null && experiment.isSuccess && status) firstStatus.current = status;
  const openedClosed = firstStatus.current !== null && CLOSED.has(firstStatus.current);
  useEffect(() => {
    if (openedClosed) router.replace(`/experiments/${id}`);
  }, [openedClosed, id, router]);

  const { bind, unbind } = voice;
  useEffect(() => {
    if (code && status && !closed) bind({ id, code });
    return () => unbind(id);
  }, [bind, unbind, id, code, status, closed]);

  if (experiment.isError) {
    return (
      <div className="dark-surface grid min-h-dvh place-items-center px-md text-center">
        <div>
          <h1 className="font-display text-display-md text-on-dark">Experiment unavailable</h1>
          <p className="mt-sm text-body-lg text-on-dark-body">
            It may have been removed by a reseed, or this account does not own it.
          </p>
          <ButtonLink href="/experiments" variant="secondary-dark" className="mt-lg">
            Back to experiments
          </ButtonLink>
        </div>
      </div>
    );
  }

  const protocol = data?.protocols as
    { name?: string; version?: string; steps?: ProtocolStep[] } | undefined;
  const steps = protocol?.steps ?? [];
  const progress = runProgress({
    status,
    current_step_index: (data?.current_step_index as number | undefined) ?? 0,
    protocols: protocol ?? null,
  });
  const currentIndex = Math.min(
    Math.max((data?.current_step_index as number | undefined) ?? 0, 0),
    Math.max(steps.length - 1, 0),
  );

  const deviationsById = Object.fromEntries(
    ((deviations.data ?? []) as { id: string; protocol_step_index: number | null }[]).map((d) => [
      d.id,
      d,
    ]),
  );
  const sessionHere = voice.bound?.id === id ? voice.sessionId : null;
  const entries = captureEntries(
    (events.data ?? []) as EventRow[],
    sessionHere,
    voice.sessionStartedAt,
    timers.offsetMs,
    voice.quotes,
    deviationsById,
    types.typeName,
  );

  return (
    <div className="dark-surface fixed inset-0 z-overlay grid grid-rows-[76px_minmax(0,1fr)] bg-dark-bench">
      <BenchHeader
        experimentId={id}
        code={code ?? '…'}
        name={(data?.name as string | undefined) ?? ''}
        protocol={protocol?.name ? `${protocol.name} ${protocol.version ?? ''}`.trim() : null}
        sessionStartedAt={sessionHere ? voice.sessionStartedAt : null}
        captured={entries.length}
      />

      {experiment.isLoading ? (
        <div className="grid gap-md p-lg xl:grid-cols-[280px_1fr_380px]" aria-hidden>
          <div className="h-64 rounded-card bg-dark-panel" />
          <div className="h-96 rounded-card bg-dark-panel" />
          <div className="h-80 rounded-card bg-dark-panel" />
        </div>
      ) : (
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-y-auto xl:grid-cols-[280px_minmax(0,1fr)_380px] xl:grid-rows-1 xl:overflow-hidden">
          <StepRail steps={steps} segments={progress.segments} />
          <div className="min-h-0 xl:overflow-y-auto">
            <BenchCenter
              experimentId={id}
              code={code ?? ''}
              status={status}
              steps={steps}
              currentIndex={currentIndex}
              hasProtocol={Boolean(data?.protocol_id)}
              timersHere={status === 'RUNNING' && timers.watched?.id === id}
            />
          </div>
          <CaptureLog entries={entries} experimentId={id} completed={status === 'COMPLETED'} />
        </div>
      )}
    </div>
  );
}
