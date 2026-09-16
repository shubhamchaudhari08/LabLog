'use client';

/**
 * The Experiment Workspace — the only screen in the MVP.
 *
 * Layout follows plan.md: voice on the left (dark product chrome), protocol on
 * the right, measurements below, supporting panels beneath. The measurement
 * table sits where the eye lands because that is the hero.
 */

import { useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { VoiceAgent } from '@/components/voice/VoiceAgent';
import { useVoiceAgent } from '@/components/voice/useVoiceAgent';
import { MeasurementTable } from '@/components/experiment/MeasurementTable';
import {
  DeviationPanel,
  ExperimentHeader,
  ExperimentTimeline,
  ObservationPanel,
  ProtocolProgress,
  SamplePanel,
  type ProtocolStep,
} from '@/components/experiment/Panels';
import {
  applyOptimisticToolResult,
  useDeviations,
  useEvents,
  useExperiment,
  useMeasurements,
  useObservations,
  useRealtimeExperiment,
  useSamples,
} from '@/lib/queries/useExperiment';

export default function ExperimentWorkspace() {
  const params = useParams<{ id: string }>();
  const experimentId = params.id;
  const client = useQueryClient();

  useRealtimeExperiment(experimentId);

  const experiment = useExperiment(experimentId);
  const samples = useSamples(experimentId);
  const measurements = useMeasurements(experimentId);
  const observations = useObservations(experimentId);
  const deviations = useDeviations(experimentId);
  const events = useEvents(experimentId);

  // The optimistic patch: one frame after the tool returns, well before the
  // change stream catches up. This ordering is the hero moment — if the spoken
  // confirmation lands first, the effect is lost (research.md R-007).
  const onToolSuccess = useCallback(
    (tool: string, data: Record<string, unknown>) => {
      applyOptimisticToolResult(client, experimentId, tool, data);
    },
    [client, experimentId],
  );

  const voice = useVoiceAgent({ experimentId, onToolSuccess });

  const previousById = Object.fromEntries(
    (events.data ?? [])
      .filter((e) => e.event_type === 'MEASUREMENT_CORRECTED')
      .map((e) => [e.entity_id, Number(e.payload?.from)]),
  );

  const protocol = experiment.data?.protocols as
    | { name?: string; version?: string; steps?: ProtocolStep[] }
    | undefined;
  const steps = protocol?.steps ?? [];

  return (
    <main className="mx-auto max-w-[1180px] px-lg py-xl">
      <ExperimentHeader
        code={experiment.data?.experiment_code ?? '—'}
        name={experiment.data?.name ?? 'Loading…'}
        status={experiment.data?.status ?? 'DRAFT'}
        protocolName={protocol?.name}
        protocolVersion={protocol?.version}
      />
      <Link href="/reliability" className="mt-xs inline-block text-caption text-primary hover:text-primary-active">
        Reliability →
      </Link>

      <div className="mt-lg grid gap-lg lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-lg">
          <VoiceAgent
            status={voice.status}
            turns={voice.turns}
            partial={voice.partial}
            sessionId={voice.sessionId}
            error={voice.error}
            busy={voice.busy}
            muted={voice.muted}
            onConnect={() => void voice.connect()}
            onDisconnect={voice.disconnect}
            onToggleMute={voice.toggleMute}
          />
          <SamplePanel samples={samples.data ?? []} />
          <ProtocolProgress
            steps={steps}
            currentIndex={experiment.data?.current_step_index ?? 0}
          />
        </div>

        <div className="space-y-lg">
          <MeasurementTable
            measurements={measurements.data ?? []}
            previousById={previousById}
            loading={measurements.isLoading}
          />
          <div className="grid gap-lg md:grid-cols-2">
            <ObservationPanel observations={observations.data ?? []} />
            <DeviationPanel deviations={deviations.data ?? []} />
          </div>
          <ExperimentTimeline events={events.data ?? []} />
        </div>
      </div>
    </main>
  );
}
