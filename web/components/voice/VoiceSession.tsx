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
 * Completing the bound experiment ends the session the same way: the agent says
 * it is complete, then the microphone closes. A finished run has nothing left to
 * record into, and its workspace no longer shows voice controls.
 *
 * A bench session belongs to one experiment. Another experiment can only take
 * the microphone once the current session has ended.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useVoiceAgent, type VoiceAgentState } from './useVoiceAgent';
import { useMicPermission } from './useMicPermission';
import { classifyMicError, type MicReadiness } from '@/lib/voiceClient/micReadiness';
import { applyOptimisticToolResult, keys } from '@/lib/queries/useExperiment';
import { MUTATING_TOOLS } from '@/lib/ui/intentChips';
import { openAction } from '@/lib/history';
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
  // --- specs/005 contracts/ui-voice-surfaces.md §9 -------------------------
  /** Device time of the last successful outcome of a tool that changes the record. */
  understoodAt: number | null;
  lastOutcome: { tool: string; data: Record<string, unknown>; at: number } | null;
  /** Entity key → the words that produced it (data-model §8). Display only. */
  quotes: ReadonlyMap<string, string>;
  quotesVersion: number;
  /** A "Say: …" prompt shown in the dock and on the bench. */
  hint: string | null;
  setHint: (text: string | null) => void;
  // --- microphone readiness (specs/005 follow-up, ui-voice-surfaces §7) ------
  /** Whether voice can start, and if not, what the user must fix. */
  mic: MicReadiness;
  /** Ask for the microphone now (shows the browser prompt when it can). */
  requestMic: () => Promise<boolean>;
  /** Set when an attempt to start voice was refused for want of a microphone. */
  micNotice: string | null;
  dismissMicNotice: () => void;
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
/** If the agent never finishes speaking (or never starts), act anyway. */
const AFTER_REPLY_TIMEOUT_MS = 10_000;

/** What to do once the agent has finished speaking about a tool result. */
type AfterReply = { switchTo: BoundExperiment } | { end: true } | { navigate: string };

/**
 * Where a stored result's quote is filed, so the capture log can find it by
 * the event it produced (data-model §8). Step completions carry no id in their
 * result, so they are filed by the step index read at dispatch.
 */
function quoteKeys(tool: string, data: Record<string, unknown>, stepIndex: number | null): string[] {
  const ids = (...values: unknown[]) => values.filter((v): v is string => typeof v === 'string');
  switch (tool) {
    case 'record_measurement':
    case 'correct_measurement':
      return ids(data.measurement_id);
    case 'record_observation':
      // "All samples" stores one note per sample; each carries the same words.
      return Array.isArray(data.observation_ids) ? ids(...data.observation_ids) : ids(data.observation_id);
    case 'create_deviation':
      return ids(data.deviation_id);
    case 'complete_protocol_step':
      return stepIndex != null ? [`step:${stepIndex}`] : [];
    default:
      return [];
  }
}

export function VoiceSessionProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const router = useRouter();
  const [bound, setBound] = useState<BoundExperiment | null>(null);
  const [pendingConnect, setPendingConnect] = useState(false);
  const [afterReply, setAfterReply] = useState<AfterReply | null>(null);
  const heardReply = useRef(false);
  const boundRef = useRef(bound);
  boundRef.current = bound;
  const experimentId = bound?.id ?? '';

  const [lastOutcome, setLastOutcome] = useState<VoiceSessionValue['lastOutcome']>(null);
  const [hint, setHint] = useState<string | null>(null);
  const quotesRef = useRef(new Map<string, string>());
  const [quotesVersion, setQuotesVersion] = useState(0);
  /** callId → what was known when the agent asked for the tool. */
  const pendingRef = useRef(new Map<string, { utterance: string | null; stepIndex: number | null }>());
  const utteranceRef = useRef<() => string | null>(() => null);

  const onToolDispatch = useCallback(
    (callId: string) => {
      const id = boundRef.current?.id;
      const experiment = id
        ? (client.getQueryData(keys.experiment(id)) as { current_step_index?: number } | undefined)
        : undefined;
      pendingRef.current.set(callId, {
        utterance: utteranceRef.current(),
        stepIndex: experiment?.current_step_index ?? null,
      });
    },
    [client],
  );

  // The optimistic patch: one frame after the tool returns, well before the
  // change stream catches up. This ordering is the hero moment — if the spoken
  // confirmation lands first, the effect is lost (research.md R-007).
  const onToolSuccess = useCallback(
    (tool: string, data: Record<string, unknown>, callId: string) => {
      const pending = pendingRef.current.get(callId);
      pendingRef.current.delete(callId);
      if (MUTATING_TOOLS.has(tool)) {
        setLastOutcome({ tool, data, at: Date.now() });
        const quoted = quoteKeys(tool, data, pending?.stepIndex ?? null);
        if (quoted.length && pending?.utterance) {
          for (const key of quoted) quotesRef.current.set(key, pending.utterance);
          setQuotesVersion((v) => v + 1);
        }
      }
      if (experimentId) applyOptimisticToolResult(client, experimentId, tool, data);
      // The tool.result goes out first (the agent must hear it); the switch or
      // the hang-up waits for the agent to finish saying what happened.
      if (!boundRef.current && HANDOVER_TOOLS.has(tool) && typeof data.experiment_id === 'string') {
        heardReply.current = false;
        setAfterReply({ switchTo: { id: data.experiment_id, code: String(data.experiment_code ?? '') } });
        void client.invalidateQueries({ queryKey: ['experiments'] });
      } else if (!boundRef.current && tool === 'search_experiments') {
        // "Open X" with one match (specs/006 US3). Opening changes no state, so
        // a running run hands over like a resume and anything else just navigates.
        const action = openAction(data.opened);
        if (action) {
          heardReply.current = false;
          setAfterReply(action);
        }
      } else if (boundRef.current && tool === 'complete_experiment') {
        heardReply.current = false;
        setAfterReply({ end: true });
      }
    },
    [client, experimentId],
  );

  const mic = useMicPermission();
  const [micRefused, setMicRefused] = useState(false);
  const { noteFailure } = mic;
  // Permission can be granted while the OS has the microphone off; that only
  // shows when a session tries to open it. Treat it like any other mic problem.
  const onStartError = useCallback(
    (cause: unknown) => {
      noteFailure(cause);
      if (classifyMicError(cause)) setMicRefused(true);
    },
    [noteFailure],
  );
  const voice = useVoiceAgent({ experimentId, onToolDispatch, onToolSuccess, onStartError });
  utteranceRef.current = voice.lastUserUtterance;
  const live = LIVE_STATES.has(voice.status);

  // Everything above is about one session: forget it when the session ends.
  useEffect(() => {
    if (voice.status !== 'idle') return;
    setLastOutcome(null);
    setHint(null);
    pendingRef.current.clear();
    if (quotesRef.current.size) {
      quotesRef.current = new Map();
      setQuotesVersion((v) => v + 1);
    }
  }, [voice.status]);
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

  const act = useCallback(
    (action: AfterReply) => {
      if ('switchTo' in action) switchTo(action.switchTo);
      // The desk session stays live: it can keep searching from the opened page.
      else if ('navigate' in action) router.push(action.navigate);
      else disconnect();
    },
    [switchTo, disconnect, router],
  );

  // Act once the agent has spoken its confirmation and gone quiet.
  useEffect(() => {
    if (!afterReply) return;
    if (voice.status === 'speaking') heardReply.current = true;
    const done = heardReply.current && voice.status === 'listening' && !voice.busy;
    if (done || !live) {
      setAfterReply(null);
      // A dropped line has already ended the session; a pending switch or open still happens.
      if (live || !('end' in afterReply)) act(afterReply);
    }
  }, [afterReply, voice.status, voice.busy, live, act]);

  useEffect(() => {
    if (!afterReply) return;
    const action = afterReply;
    const timer = setTimeout(() => {
      setAfterReply(null);
      act(action);
    }, AFTER_REPLY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [afterReply, act]);

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

  // Every way of starting voice comes through here, so the microphone is
  // checked once: ask for it if the browser can, and if it still cannot be
  // used, say what to fix instead of opening a session that cannot hear.
  const micReadyRef = useRef(mic.readiness.ready);
  micReadyRef.current = mic.readiness.ready;
  const { request: requestMic } = mic;
  const startVoice = useCallback(async () => {
    if (liveRef.current) return;
    const ok = micReadyRef.current || (await requestMic());
    if (!ok) {
      setMicRefused(true);
      return;
    }
    setMicRefused(false);
    connectFor(boundRef.current);
  }, [connectFor, requestMic]);

  // Fixed (permission granted, microphone connected): the notice has done its job.
  useEffect(() => {
    if (mic.readiness.ready) setMicRefused(false);
  }, [mic.readiness.ready]);
  const dismissMicNotice = useCallback(() => setMicRefused(false), []);

  const micNotice = micRefused && !mic.readiness.ready ? mic.readiness.message : null;
  const value = useMemo(
    () => ({
      ...voice,
      // A microphone problem is explained by the mic notice, which says what to
      // fix; the raw start error would only repeat it less helpfully.
      error: micNotice ? null : voice.error,
      bound,
      live,
      mode: (bound ? 'bench' : 'desk') as 'desk' | 'bench',
      bind,
      unbind,
      startVoice,
      switchTo,
      switching: afterReply && 'switchTo' in afterReply ? afterReply.switchTo : null,
      understoodAt: lastOutcome?.at ?? null,
      lastOutcome,
      quotes: quotesRef.current,
      quotesVersion,
      hint,
      setHint,
      mic: mic.readiness,
      requestMic,
      micNotice,
      dismissMicNotice,
    }),
    [
      voice,
      bound,
      live,
      bind,
      unbind,
      startVoice,
      switchTo,
      afterReply,
      lastOutcome,
      quotesVersion,
      hint,
      mic.readiness,
      requestMic,
      micNotice,
      dismissMicNotice,
    ],
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
  idle: 'bg-on-dark-muted',
  connecting: 'bg-on-dark-muted',
  ready: 'bg-status-running-on-dark',
  listening: 'bg-primary-glow',
  thinking: 'bg-primary-glow',
  speaking: 'bg-primary-glow',
  reconnecting: 'bg-deviation-on-dark',
  error: 'bg-danger-on-dark',
};
