'use client';

/**
 * The Experiment Workspace — the only screen in the MVP.
 *
 * Layout: voice on the left as a sticky column (it is the input device, so it
 * should never scroll away mid-sentence), records on the right where the eye
 * lands. The measurement table sits at the top of that column because it is the
 * hero — the thing the demo is selling.
 */

import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { SessionPill, TopNav } from '@/components/Chrome';
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

const LIVE_STATES = new Set(['listening', 'thinking', 'speaking', 'ready']);

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
    <>
      <TopNav
        status={
          <SessionPill
            label={LIVE_STATES.has(voice.status) ? 'Session live' : 'Session idle'}
            tone={
              LIVE_STATES.has(voice.status)
                ? 'live'
                : voice.status === 'reconnecting'
                  ? 'warn'
                  : 'idle'
            }
          />
        }
      />

      <main id="main" className="mx-auto max-w-[1240px] px-lg pb-section pt-xl">
        <ExperimentHeader
          code={experiment.data?.experiment_code ?? '—'}
          name={experiment.data?.name ?? 'Loading…'}
          status={experiment.data?.status ?? 'DRAFT'}
          protocolName={protocol?.name}
          protocolVersion={protocol?.version}
        />

        <div className="mt-xl grid gap-lg lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-xl">
          {/* The input device stays put while the record scrolls. */}
          <div className="space-y-lg lg:sticky lg:top-[88px] lg:self-start">
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
    </>
  );
}
