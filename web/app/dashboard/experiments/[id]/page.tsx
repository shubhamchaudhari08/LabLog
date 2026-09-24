'use client';

/**
 * The Experiment Workspace — the only screen in the MVP.
 *
 * Split screen, floor to ceiling: the dark instrument column on the left is
 * what you speak to, the cream notebook on the right is what it writes. The
 * page is divided by function, which is also the architecture of the system —
 * speech on one side, validated record on the other.
 *
 * Within the notebook the order is deliberate: samples first (the question a
 * scientist actually asks is "what do I have for A17?"), then the chronological
 * record, then the audit trail.
 */

import { useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { InstrumentColumn } from '@/components/workspace/InstrumentColumn';
import { SampleBoard } from '@/components/workspace/SampleBoard';
import { Ledger, toEntries } from '@/components/workspace/Ledger';
import { useVoiceAgent } from '@/components/voice/useVoiceAgent';
import { ExperimentTimeline } from '@/components/workspace/Timeline';
import {
  applyOptimisticToolResult,
  useDeviations,
  useEvents,
  useExperiment,
  useMeasurements,
  useObservations,
  useRealtimeExperiment,
  useSamples,
  type ProtocolStep,
} from '@/lib/queries/useExperiment';

const STATUS_TONE: Record<string, string> = {
  RUNNING: 'border-success/30 bg-success/10 text-success',
  COMPLETED: 'border-hairline bg-surface-card text-muted',
  PAUSED: 'border-accent-amber/30 bg-accent-amber/10 text-warning',
  CANCELLED: 'border-error/25 bg-error/10 text-error',
};

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
  const status = experiment.data?.status ?? 'DRAFT';

  const entries = toEntries(measurements.data ?? [], observations.data ?? [], deviations.data ?? []);

  return (
    <div className="lg:pl-[clamp(340px,26vw,420px)]">
      <InstrumentColumn
        experimentCode={experiment.data?.experiment_code ?? '—'}
        status={voice.status}
        turns={voice.turns}
        partial={voice.partial}
        sessionId={voice.sessionId}
        error={voice.error}
        busy={voice.busy}
        muted={voice.muted}
        steps={steps}
        currentIndex={experiment.data?.current_step_index ?? 0}
        onConnect={() => void voice.connect()}
        onDisconnect={voice.disconnect}
        onToggleMute={voice.toggleMute}
      />

      <main id="main" className="mx-auto max-w-[1080px] px-lg pb-section pt-xl lg:px-xl lg:pt-xxl">
        <header className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <div className="flex items-center gap-sm">
              <span
                className={`rounded-sm border px-xs py-[3px] text-caption-upper uppercase ${
                  STATUS_TONE[status] ?? 'border-hairline bg-surface-card text-muted'
                }`}
              >
                {status.toLowerCase()}
              </span>
              <span className="text-caption text-muted-soft">
                {protocol?.name} {protocol?.version}
              </span>
            </div>
            <h1 className="mt-sm max-w-[18ch] text-display-lg">
              {experiment.data?.name ?? 'Loading…'}
            </h1>
          </div>

          <Link href="/reliability" className="nav-link mt-xs">
            Reliability →
          </Link>
        </header>

        {/* Samples first: the question asked most often, answered without reading. */}
        <section className="mt-xxl" aria-labelledby="samples-heading">
          <h2 id="samples-heading" className="panel-label border-b border-hairline pb-xs">
            Samples
          </h2>
          <div className="pt-md">
            <SampleBoard
              samples={samples.data ?? []}
              measurements={measurements.data ?? []}
              previousById={previousById}
              loading={samples.isLoading || measurements.isLoading}
            />
          </div>
        </section>

        <div className="mt-xxl grid gap-xxl lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] lg:gap-xl">
          <Ledger entries={entries} loading={measurements.isLoading} />
          <ExperimentTimeline events={events.data ?? []} />
        </div>
      </main>
    </div>
  );
}
