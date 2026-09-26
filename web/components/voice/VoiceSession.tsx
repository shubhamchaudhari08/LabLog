'use client';

/**
 * The voice session, lifted above the routes.
 *
 * It used to live inside the workspace page, so opening Protocols mid-run
 * silently tore down the microphone. Held here, in the app layout, a session
 * survives navigation: the header chip keeps showing it, and the workspace dock
 * picks it back up on return.
 *
 * Two kinds of session (specs/003-post-mvp-features, constitution amendment A-1):
 *   - bench: bound to one experiment; records into it.
 *   - desk:  no experiment open; can only create, start or resume one. Started
 *            from any screen. When a tool creates or starts an experiment, the
 *            session lets the agent finish its sentence, then switches to that
 *            experiment and opens its workspace.
 *
 * A bench session belongs to one experiment. Another experiment can only take
 * the microphone once the current session has ended.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  /** desk: no experiment open. bench: bound to `bound`. */
  mode: 'desk' | 'bench';
  /** Point the microphone at an experiment. Ignored while any session is live. */
  bind: (experiment: BoundExperiment) => void;
  /** Forget the bound experiment when leaving its page, unless a session is live on it. */
  unbind: (experimentId: string) => void;
  /** From any screen: the bound experiment's session if there is one, else a desk session. */
  startVoice: () => void;
  /** End whatever is live and open a session on this experiment. */
  switchTo: (experiment: BoundExperiment) => void;
  /** Set while a desk session is handing over to an experiment it just created or started. */
  switching: BoundExperiment | null;
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

/** Tools after which a desk session hands over to the experiment they touched. */
const HANDOVER_TOOLS = new Set(['create_experiment', 'start_experiment']);
/** If the agent never finishes speaking (or never starts), hand over anyway. */
const HANDOVER_TIMEOUT_MS = 10_000;

export function VoiceSessionProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const router = useRouter();
  const [bound, setBound] = useState<BoundExperiment | null>(null);
  const [pendingConnect, setPendingConnect] = useState(false);
  const [handover, setHandover] = useState<BoundExperiment | null>(null);
  const heardReply = useRef(false);
  const boundRef = useRef(bound);
  boundRef.current = bound;
  const experimentId = bound?.id ?? '';

  // The optimistic patch: one frame after the tool returns, well before the
  // change stream catches up. This ordering is the hero moment — if the spoken
  // confirmation lands first, the effect is lost (research.md R-007).
  const onToolSuccess = useCallback(
    (tool: string, data: Record<string, unknown>) => {
      if (experimentId) applyOptimisticToolResult(client, experimentId, tool, data);
      if (!boundRef.current && HANDOVER_TOOLS.has(tool) && typeof data.experiment_id === 'string') {
        // The tool.result goes out first (the agent must hear it); the switch
        // waits for the agent to finish saying what happened.
        heardReply.current = false;
        setHandover({ id: data.experiment_id, code: String(data.experiment_code ?? '') });
        void client.invalidateQueries({ queryKey: ['experiments'] });
      }
    },
    [client, experimentId],
  );

  const voice = useVoiceAgent({ experimentId, onToolSuccess });
  const live = LIVE_STATES.has(voice.status);
  const liveRef = useRef(live);
  liveRef.current = live;

  // Connect once the agent hook has re-rendered with the new experiment id;
  // connecting in the same tick would use the previous one.
  const { connect, disconnect } = voice;
  useEffect(() => {
    if (!pendingConnect) return;
    setPendingConnect(false);
    void connect();
  }, [pendingConnect, connect]);

  const connectFor = useCallback((target: BoundExperiment | null) => {
    setBound(target);
    setPendingConnect(true);
  }, []);

  const switchTo = useCallback(
    (target: BoundExperiment) => {
      disconnect();
      router.push(`/dashboard/experiments/${target.id}`);
      connectFor(target);
    },
    [connectFor, disconnect, router],
  );

  // Hand over once the agent has spoken its confirmation and gone quiet.
  useEffect(() => {
    if (!handover) return;
    if (voice.status === 'speaking') heardReply.current = true;
    const done = heardReply.current && voice.status === 'listening' && !voice.busy;
    if (done || !live) {
      setHandover(null);
      switchTo(handover);
    }
  }, [handover, voice.status, voice.busy, live, switchTo]);

  useEffect(() => {
    if (!handover) return;
    const target = handover;
    const timer = setTimeout(() => {
      setHandover(null);
      switchTo(target);
    }, HANDOVER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [handover, switchTo]);

  const bind = useCallback((experiment: BoundExperiment) => {
    // Any live session keeps its binding: a bench session stays on its own
    // experiment, and a desk session is switched deliberately (switchTo), never
    // by navigating to a page.
    if (liveRef.current) return;
    setBound((current) =>
      current?.id === experiment.id && current.code === experiment.code ? current : experiment,
    );
  }, []);

  const unbind = useCallback((id: string) => {
    if (liveRef.current) return;
    setBound((current) => (current?.id === id ? null : current));
  }, []);

  const startVoice = useCallback(() => {
    if (liveRef.current) return;
    connectFor(boundRef.current);
  }, [connectFor]);

  const value = useMemo(
    () => ({
      ...voice,
      bound,
      live,
      mode: (bound ? 'bench' : 'desk') as 'desk' | 'bench',
      bind,
      unbind,
      startVoice,
      switchTo,
      switching: handover,
    }),
    [voice, bound, live, bind, unbind, startVoice, switchTo, handover],
  );

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
