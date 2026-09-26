'use client';

/**
 * The voice session, lifted above the routes.
 *
 * It used to live inside the workspace page, so opening Protocols mid-run
 * silently tore down the microphone. Held here, in the app layout, a session
 * survives navigation: the header chip keeps showing it, and the workspace dock
 * picks it back up on return.
 *
 * A session belongs to one experiment. Another experiment can only take the
 * microphone once the current session has ended.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useVoiceAgent, type VoiceAgentState } from './useVoiceAgent';
import { applyOptimisticToolResult } from '@/lib/queries/useExperiment';
import type { VoiceStatusValue } from '@/lib/voiceClient/types';

export interface BoundExperiment {
  id: string;
  code: string;
}

interface VoiceSessionValue extends VoiceAgentState {
  bound: BoundExperiment | null;
  live: boolean;
  /** Point the microphone at an experiment. Ignored while a session is live elsewhere. */
  bind: (experiment: BoundExperiment) => void;
}

const VoiceContext = createContext<VoiceSessionValue | null>(null);

export const LIVE_STATES = new Set<VoiceStatusValue>([
  'connecting',
  'ready',
  'listening',
  'thinking',
  'speaking',
  'reconnecting',
]);

export function VoiceSessionProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const [bound, setBound] = useState<BoundExperiment | null>(null);
  const experimentId = bound?.id ?? '';

  // The optimistic patch: one frame after the tool returns, well before the
  // change stream catches up. This ordering is the hero moment — if the spoken
  // confirmation lands first, the effect is lost (research.md R-007).
  const onToolSuccess = useCallback(
    (tool: string, data: Record<string, unknown>) => {
      if (experimentId) applyOptimisticToolResult(client, experimentId, tool, data);
    },
    [client, experimentId],
  );

  const voice = useVoiceAgent({ experimentId, onToolSuccess });
  const live = LIVE_STATES.has(voice.status);

  const bind = useCallback(
    (experiment: BoundExperiment) => {
      if (live && bound && bound.id !== experiment.id) return;
      setBound((current) =>
        current?.id === experiment.id && current.code === experiment.code ? current : experiment,
      );
    },
    [live, bound],
  );

  const value = useMemo(() => ({ ...voice, bound, live, bind }), [voice, bound, live, bind]);

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoiceSession(): VoiceSessionValue {
  const value = useContext(VoiceContext);
  if (!value) throw new Error('useVoiceSession must be used inside VoiceSessionProvider');
  return value;
}

export const STATUS_COPY: Record<VoiceStatusValue, string> = {
  idle: 'Not connected',
  connecting: 'Connecting',
  ready: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  reconnecting: 'Reconnecting',
  error: 'Error',
};

export const STATUS_DOT: Record<VoiceStatusValue, string> = {
  idle: 'bg-muted-soft',
  connecting: 'bg-accent-amber',
  ready: 'bg-accent-teal',
  listening: 'bg-accent-teal',
  thinking: 'bg-accent-amber',
  speaking: 'bg-primary',
  reconnecting: 'bg-accent-amber',
  error: 'bg-error',
};
