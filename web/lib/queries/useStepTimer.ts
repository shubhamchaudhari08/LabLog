'use client';

/**
 * Step-timer state, read from the server (specs/004-step-timers research R-307).
 *
 * The browser never derives a timer itself: it asks `step_timer status` through
 * POST /tools, the same single path voice uses, and refetches when the change
 * stream says a TIMER_* event landed or the experiment row changed. The server
 * also returns the current step's detected duration, so there is no second
 * duration parser in TypeScript (Constitution Principle IV).
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { callTool } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { clockOffset } from '@/components/timer/clock';

/** contracts/tools-step-timer.md §1 */
export interface StepTimer {
  timer_id: string;
  state: 'running' | 'completed' | 'cancelled';
  duration_seconds: number;
  duration_spoken: string;
  started_at: string;
  ends_at: string;
  remaining_seconds: number;
  remaining_spoken: string;
  step_index: number | null;
  step_name: string | null;
  protocol_seconds: number | null;
  differs_from_protocol: boolean;
  completion_instructions: string;
}

export interface StepTimerStatus {
  timer: StepTimer | null;
  current_step_index?: number;
  current_step_timer_seconds?: number | null;
  current_step_timer_reason?: 'single' | 'none' | 'range' | 'multiple';
  /** "10 minutes": the server formats durations, the web never does. */
  current_step_timer_spoken?: string | null;
  server_now?: string;
  /** Device→server clock offset, measured on this response. */
  offsetMs: number;
  /**
   * Set when the server refused, e.g. EXPERIMENT_NOT_RUNNING. There is no timer
   * on an experiment that is not RUNNING (FR-307), so this reads as "no timer".
   */
  error?: string;
}

export const stepTimerKey = (experimentId: string) => ['step-timer', experimentId] as const;

export async function fetchStepTimer(experimentId: string): Promise<StepTimerStatus> {
  const sentAt = Date.now();
  const outcome = await callTool({
    tool: 'step_timer',
    args: { action: 'status' },
    experiment_id: experimentId,
    session_id: null,
  });
  const receivedAt = Date.now();
  if (!outcome.success) return { timer: null, offsetMs: 0, error: outcome.error };
  const data = outcome.data as unknown as Omit<StepTimerStatus, 'offsetMs'>;
  return {
    ...data,
    offsetMs: data.server_now ? clockOffset(data.server_now, sentAt, receivedAt) : 0,
  };
}

/**
 * Refetch on the events that can change a timer: a TIMER_* insert, any change
 * to the experiment row (status, current step), and the tab becoming visible
 * again (re-anchors the clock offset after a long background stretch).
 */
export function useStepTimerRealtime(experimentIds: string[]): void {
  const client = useQueryClient();
  const key = experimentIds.join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    const channels = ids.map((id) => {
      const refetch = () => void client.invalidateQueries({ queryKey: stepTimerKey(id) });
      return supabase
        .channel(`step-timer:${id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'events', filter: `experiment_id=eq.${id}` },
          (change) => {
            const type = String((change.new as { event_type?: string })?.event_type ?? '');
            if (type.startsWith('TIMER_')) refetch();
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'experiments', filter: `id=eq.${id}` },
          refetch,
        )
        .subscribe();
    });

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      for (const id of ids) void client.invalidateQueries({ queryKey: stepTimerKey(id) });
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  }, [client, key]);
}
