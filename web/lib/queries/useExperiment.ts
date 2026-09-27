'use client';

/**
 * Reads and live reconciliation for the workspace.
 *
 * Two paths write into this cache, deliberately (research.md R-007):
 *   1. the optimistic patch from a successful tool result — one frame, which is
 *      the moment the product is selling;
 *   2. the database's own change stream — the canonical path, which is what
 *      makes "it is really stored" true rather than theatrical.
 *
 * On conflict the database wins. Rows are matched by SERVER ID, not by content:
 * content matching would mis-pair two measurements of the same type and value
 * taken seconds apart, which is an ordinary occurrence in a lab.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const OPTIMISTIC_TIMEOUT_MS = 10_000;

export interface MeasurementRow {
  id: string;
  sample_id: string | null;
  measurement_type: string;
  value: number;
  unit: string | null;
  raw_spoken_value: string | null;
  correction_reason: string | null;
  protocol_step_index?: number | null;
  recorded_at: string;
  samples?: { sample_code: string } | null;
  /** Client-only: awaiting confirmation from the change stream. */
  _optimistic?: boolean;
  /** Client-only: the superseded value, known from the tool result before events refetch. */
  previous_value?: number;
}

export interface ProtocolStep {
  index: number;
  id: string;
  name: string;
  required_fields?: string[];
  default_unit?: Record<string, string>;
}

export const keys = {
  experiment: (id: string) => ['experiment', id] as const,
  samples: (id: string) => ['samples', id] as const,
  measurements: (id: string) => ['measurements', id] as const,
  observations: (id: string) => ['observations', id] as const,
  deviations: (id: string) => ['deviations', id] as const,
  events: (id: string) => ['events', id] as const,
};

export interface ExperimentSummary {
  id: string;
  experiment_code: string;
  name: string;
  status: string;
  current_step_index: number;
  protocol_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at?: string | null;
  protocols?: { protocol_code?: string; name?: string; version?: string; steps?: ProtocolStep[] } | null;
  /** PostgREST returns embedded aggregates as a one-element array. */
  measurements?: { count: number }[];
  deviations?: { count: number }[];
}

export interface ProtocolSummary {
  id: string;
  protocol_code: string;
  name: string;
  version: string | null;
  steps: ProtocolStep[];
  /** null for a shared library protocol: nobody's to edit or delete. */
  owner_id?: string | null;
  experiments?: { count: number }[];
}

/** Index of every experiment the signed-in user owns. RUNNING first. */
export function useExperimentList() {
  return useQuery<ExperimentSummary[]>({
    queryKey: ['experiments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('experiments')
        // The embedded count saves a query per row for the measurement tally.
        .select('*, protocols(protocol_code, name, version, steps), measurements(count), deviations(count)')
        .order('started_at', { ascending: false, nullsFirst: false });
      if (error) throw error;

      const rows = (data ?? []) as ExperimentSummary[];
      return rows.sort((a, b) => Number(b.status === 'RUNNING') - Number(a.status === 'RUNNING'));
    },
  });
}

/**
 * Home tallies that are not per-experiment: current (non-superseded) readings,
 * and events that carry a voice session id. Head-only counts under RLS
 * (specs/003-post-mvp-features research R-211).
 */
export function useHomeCounts() {
  return useQuery({
    queryKey: ['home-counts'],
    queryFn: async () => {
      const [measurements, voiceEvents] = await Promise.all([
        supabase.from('measurements').select('id', { count: 'exact', head: true }).is('superseded_by', null),
        supabase.from('events').select('id', { count: 'exact', head: true }).not('voice_session_id', 'is', null),
      ]);
      if (measurements.error) throw measurements.error;
      if (voiceEvents.error) throw voiceEvents.error;
      return { measurements: measurements.count ?? 0, voiceEvents: voiceEvents.count ?? 0 };
    },
  });
}

/** Protocols readable by this user: their own, plus shared library protocols. */
export function useProtocolList() {
  return useQuery<ProtocolSummary[]>({
    queryKey: ['protocols'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('protocols')
        .select('*, experiments(count)')
        .order('protocol_code');
      if (error) throw error;
      return (data ?? []) as ProtocolSummary[];
    },
  });
}

export function useExperiment(experimentId: string) {
  return useQuery({
    queryKey: keys.experiment(experimentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('experiments')
        .select('*, protocols(*)')
        .eq('id', experimentId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useSamples(experimentId: string) {
  return useQuery({
    queryKey: keys.samples(experimentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('samples')
        .select('*')
        .eq('experiment_id', experimentId)
        .order('sample_code');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMeasurements(experimentId: string) {
  return useQuery<MeasurementRow[]>({
    queryKey: keys.measurements(experimentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('measurements')
        .select('*, samples(sample_code)')
        // Without this filter every correction renders as a duplicate row —
        // the most likely visible bug in the workspace, and one that looks
        // like a backend fault.
        .is('superseded_by', null)
        .eq('experiment_id', experimentId)
        .order('recorded_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as MeasurementRow[];
    },
  });
}

export function useObservations(experimentId: string) {
  return useQuery({
    queryKey: keys.observations(experimentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('observations')
        .select('*, samples(sample_code)')
        .eq('experiment_id', experimentId)
        .order('recorded_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDeviations(experimentId: string) {
  return useQuery({
    queryKey: keys.deviations(experimentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deviations')
        .select('*')
        .eq('experiment_id', experimentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEvents(experimentId: string) {
  return useQuery({
    queryKey: keys.events(experimentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('experiment_id', experimentId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Patch the cache from a tool result, before the change stream catches up.
 *
 * The row carries the server id the backend returned, so the subscription can
 * replace it exactly rather than guessing.
 */
export function applyOptimisticToolResult(
  client: QueryClient,
  experimentId: string,
  tool: string,
  data: Record<string, unknown>,
): void {
  if (tool === 'record_measurement') {
    // The handler records against the experiment's current step; mirror that so
    // the protocol rail ticks the reading off before the change stream arrives.
    const stepIndex =
      client.getQueryData<{ current_step_index?: number }>(keys.experiment(experimentId))
        ?.current_step_index ?? null;
    client.setQueryData<MeasurementRow[]>(keys.measurements(experimentId), (prev = []) => [
      {
        id: String(data.measurement_id),
        sample_id: null,
        measurement_type: String(data.measurement_type),
        value: Number(data.value),
        unit: (data.unit as string) ?? null,
        raw_spoken_value: null,
        correction_reason: null,
        protocol_step_index: stepIndex,
        recorded_at: (data.recorded_at as string) ?? new Date().toISOString(),
        samples: { sample_code: String(data.sample_code) },
        _optimistic: true,
      },
      ...prev,
    ]);
    return;
  }

  if (tool === 'correct_measurement') {
    client.setQueryData<MeasurementRow[]>(keys.measurements(experimentId), (prev = []) => {
      const sampleCode = String(data.sample_code);
      const type = String(data.measurement_type);
      const isTarget = (m: MeasurementRow) =>
        m.samples?.sample_code === sampleCode && m.measurement_type === type;
      const replaced = prev.find(isTarget);
      const without = prev.filter((m) => !isTarget(m));
      return [
        {
          id: String(data.measurement_id),
          sample_id: null,
          measurement_type: type,
          value: Number(data.new_value),
          unit: (data.unit as string) ?? null,
          raw_spoken_value: null,
          correction_reason: 'Voice correction',
          // A correction supersedes a reading in place, so it keeps its step.
          protocol_step_index: replaced?.protocol_step_index ?? null,
          recorded_at: new Date().toISOString(),
          samples: { sample_code: sampleCode },
          _optimistic: true,
          previous_value: Number(data.previous_value),
        },
        ...without,
      ];
    });
    return;
  }

  // Everything else is cheap enough to simply refetch.
  const affected: Record<string, readonly unknown[]> = {
    record_observation: keys.observations(experimentId),
    create_deviation: keys.deviations(experimentId),
    complete_protocol_step: keys.experiment(experimentId),
    // Steps live on `protocols`, which has no subscription - the experiment
    // query's join is what brings the change in, so it must be invalidated.
    write_protocol_step: keys.experiment(experimentId),
    complete_experiment: keys.experiment(experimentId),
  };
  const key = affected[tool];
  if (key) void client.invalidateQueries({ queryKey: key });
  void client.invalidateQueries({ queryKey: keys.events(experimentId) });
}

/**
 * Subscribe to the canonical change stream.
 *
 * The server-side `filter` is not optional: without it the client receives
 * changes for every experiment the policy allows and discards them locally,
 * which works right up until the seeded history is added.
 */
export function useRealtimeExperiment(experimentId: string): void {
  const client = useQueryClient();

  useEffect(() => {
    const tables = [
      ['measurements', keys.measurements(experimentId)],
      ['observations', keys.observations(experimentId)],
      ['deviations', keys.deviations(experimentId)],
      ['events', keys.events(experimentId)],
      ['experiments', keys.experiment(experimentId)],
    ] as const;

    const channel = supabase.channel(`experiment:${experimentId}`);

    for (const [table, key] of tables) {
      const filter =
        table === 'experiments' ? `id=eq.${experimentId}` : `experiment_id=eq.${experimentId}`;
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        () => void client.invalidateQueries({ queryKey: key }),
      );
    }

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, experimentId]);
}
