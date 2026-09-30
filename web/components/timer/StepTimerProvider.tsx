'use client';

/**
 * Step timers on every screen (specs/004-step-timers).
 *
 * Mounted once, beside the voice session, so a timer outlives navigation: the
 * countdown keeps showing in the header and the alarm still sounds while the
 * user is on History or Protocols (FR-306, FR-312).
 *
 * What it watches (research R-310, owner decision G1):
 *   - the experiment the voice session is bound to, else the last one opened at
 *     the bench, for the countdown and the Start button;
 *   - every experiment that has an alarm scheduled in this tab, so opening
 *     another experiment never silences one that is already counting down. An
 *     alarm is unscheduled only when the server stops backing it: cancelled,
 *     replaced, or its experiment no longer RUNNING.
 *
 * The sequence at zero (contracts/voice-announcement.md §2): the alarm on the
 * audio clock, the microphone deaf for its length, the "complete" state, then a
 * spoken announcement once the agent and the user are both quiet.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { callTool } from '@/lib/api';
import {
  fetchStepTimer,
  stepTimerKey,
  useStepTimerRealtime,
  type StepTimer,
  type StepTimerStatus,
} from '@/lib/queries/useStepTimer';
import { useVoiceSession, type BoundExperiment } from '@/components/voice/VoiceSession';
import { ALARM_DURATION_MS, AlarmPlayer } from './AlarmPlayer';
import { EMPTY, enqueue, gateOpen, next, type AnnounceState, type VoiceView } from './announce';
import { toLocalMs } from './clock';

/** Mic stays deaf this long after the last beep (research R-306). */
const MIC_TAIL_MS = 300;
/** An error this soon after reply.create means the announcement failed. */
const ANNOUNCE_ERROR_WINDOW_MS = 2_000;
/** Reschedule when a fresh clock offset moves the alarm by more than this. */
const REANCHOR_MS = 250;
/** Backstop when the audio clock is not running (sound blocked) and never ends the alarm. */
const BACKSTOP_SLACK_MS = 1_000;
/**
 * Refusals that say something about the timer. A 401 or a dropped connection
 * says nothing, and must not silence an alarm that is still counting down.
 */
const AUTHORITATIVE = new Set(['EXPERIMENT_NOT_RUNNING', 'EXPERIMENT_REQUIRED', 'FORBIDDEN']);

export type AnnounceOutcome = 'pending' | 'announced' | 'failed' | 'not-announced';

export interface FinishedTimer {
  timerId: string;
  experimentId: string;
  experimentCode: string;
  stepName: string | null;
  durationSpoken: string;
  endsAt: string;
  /** The alarm could not be heard: the browser had sound blocked (FR-316). */
  silent: boolean;
  dismissed: boolean;
}

type Action = 'start' | 'cancel';
export type ActionResult = { ok: true } | { ok: false; message: string };

interface Alarm {
  experimentId: string;
  experimentCode: string;
  atMs: number;
  timer: StepTimer;
  backstop: ReturnType<typeof setTimeout>;
}

export interface StepTimersValue {
  /** The experiment the countdown and Start button refer to. */
  watched: BoundExperiment | null;
  status: StepTimerStatus | undefined;
  timer: StepTimer | null;
  offsetMs: number;
  soundReady: boolean;
  ringing: boolean;
  /** Timers that reached zero in this tab and were not dismissed, newest first. */
  finished: FinishedTimer[];
  outcomes: Record<string, AnnounceOutcome>;
  pending: Action | null;
  start: () => Promise<ActionResult>;
  cancel: () => Promise<ActionResult>;
  /** Silence the alarm and hide the header's "complete" chip (owner decision I3). */
  dismiss: () => void;
  enableSound: () => Promise<boolean>;
}

const TimerContext = createContext<StepTimersValue | null>(null);

export function StepTimerProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const voice = useVoiceSession();
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const playerRef = useRef<AlarmPlayer | null>(null);
  const player = useCallback(() => (playerRef.current ??= new AlarmPlayer()), []);

  // -- what to watch ---------------------------------------------------------
  const [lastBench, setLastBench] = useState<BoundExperiment | null>(null);
  useEffect(() => {
    if (voice.bound) setLastBench(voice.bound);
  }, [voice.bound]);
  const watched = voice.bound ?? lastBench;

  const alarmsRef = useRef(new Map<string, Alarm>());
  const [alarmExperiments, setAlarmExperiments] = useState<string[]>([]);
  const syncAlarmExperiments = useCallback(() => {
    const ids = [...new Set([...alarmsRef.current.values()].map((a) => a.experimentId))].sort();
    setAlarmExperiments((prev) => (prev.join() === ids.join() ? prev : ids));
  }, []);

  const ids = useMemo(
    () => [...new Set([...(watched ? [watched.id] : []), ...alarmExperiments])],
    [watched, alarmExperiments],
  );
  useStepTimerRealtime(ids);
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: stepTimerKey(id),
      queryFn: () => fetchStepTimer(id),
      // Realtime and visibility drive refetches; this is only a safety net.
      refetchInterval: 60_000,
    })),
  });
  const dataKey = results.map((r) => r.dataUpdatedAt).join();
  const statusById = useMemo(
    () => Object.fromEntries(ids.map((id, i) => [id, results[i]?.data])) as Record<string, StepTimerStatus | undefined>,
    // results is a new array every render; dataUpdatedAt says when any of it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids, dataKey],
  );

  // -- finishing and announcing ----------------------------------------------
  const [finished, setFinished] = useState<FinishedTimer[]>([]);
  const finishedIds = useRef(new Set<string>());
  const [outcomes, setOutcomes] = useState<Record<string, AnnounceOutcome>>({});
  const announceRef = useRef<AnnounceState>(EMPTY);
  const [ringing, setRinging] = useState(false);
  const [soundReady, setSoundReady] = useState(false);

  const finishOnce = useCallback(
    (timerId: string) => {
      const alarm = alarmsRef.current.get(timerId);
      if (!alarm || finishedIds.current.has(timerId)) return;
      finishedIds.current.add(timerId);
      clearTimeout(alarm.backstop);
      player().cancel(timerId);
      alarmsRef.current.delete(timerId);
      syncAlarmExperiments();

      const { timer } = alarm;
      setFinished((prev) => [
        {
          timerId,
          experimentId: alarm.experimentId,
          experimentCode: alarm.experimentCode,
          stepName: timer.step_name,
          durationSpoken: timer.duration_spoken,
          endsAt: timer.ends_at,
          silent: !player().soundReady,
          dismissed: false,
        },
        ...prev,
      ]);
      setOutcomes((prev) => ({ ...prev, [timerId]: 'pending' }));
      announceRef.current = enqueue(announceRef.current, {
        timerId,
        experimentId: alarm.experimentId,
        instructions: timer.completion_instructions,
        queuedAt: Date.now(),
      });
      void client.invalidateQueries({ queryKey: stepTimerKey(alarm.experimentId) });
    },
    [client, player, syncAlarmExperiments],
  );

  const schedule = useCallback(
    (timer: StepTimer, atMs: number, experimentId: string, experimentCode: string) => {
      const existing = alarmsRef.current.get(timer.timer_id);
      if (existing) clearTimeout(existing.backstop);
      // FR-315: the recogniser must not hear the alarm as speech.
      voiceRef.current.muteMicBetween(atMs - 100, atMs + ALARM_DURATION_MS + MIC_TAIL_MS);
      player().schedule(timer.timer_id, atMs, () => finishOnce(timer.timer_id));
      // A suspended AudioContext never advances, so its alarm never "ends".
      // The backstop still moves the timer to complete and queues the announcement.
      const backstop = setTimeout(
        () => finishOnce(timer.timer_id),
        Math.max(0, atMs - Date.now()) + ALARM_DURATION_MS + BACKSTOP_SLACK_MS,
      );
      alarmsRef.current.set(timer.timer_id, { experimentId, experimentCode, atMs, timer, backstop });
      syncAlarmExperiments();
    },
    [finishOnce, player, syncAlarmExperiments],
  );

  const unschedule = useCallback(
    (timerId: string) => {
      const alarm = alarmsRef.current.get(timerId);
      if (!alarm) return;
      clearTimeout(alarm.backstop);
      player().cancel(timerId);
      alarmsRef.current.delete(timerId);
      syncAlarmExperiments();
    },
    [player, syncAlarmExperiments],
  );

  // -- reconcile the alarms with what the server says ------------------------
  useEffect(() => {
    for (const id of ids) {
      const status = statusById[id];
      // Not loaded yet, or a failure that says nothing about the timer: decide nothing.
      if (!status || (status.error && !AUTHORITATIVE.has(status.error))) continue;
      const current = status.timer;

      // Unschedule anything the server no longer backs (FR-304, FR-307).
      for (const [timerId, alarm] of alarmsRef.current) {
        if (alarm.experimentId !== id) continue;
        const backed = current?.timer_id === timerId && current.state !== 'cancelled';
        if (!backed) unschedule(timerId);
      }

      // Alarm only for a timer seen running with time left: a timer first seen
      // completed (the app was closed when it ended) never alarms (Story 4 #4).
      if (!current || current.state !== 'running' || finishedIds.current.has(current.timer_id)) continue;
      const atMs = toLocalMs(current.ends_at, status.offsetMs);
      const code = watched?.id === id ? watched.code : alarmsRef.current.get(current.timer_id)?.experimentCode ?? '';
      const scheduled = alarmsRef.current.get(current.timer_id);
      if (scheduled) {
        // A fresh offset (e.g. after the tab was hidden) re-anchors the alarm.
        if (Math.abs(scheduled.atMs - atMs) > REANCHOR_MS) schedule(current, atMs, id, scheduled.experimentCode);
      } else if (atMs > Date.now()) {
        schedule(current, atMs, id, code);
      }
    }
  }, [ids, statusById, schedule, unschedule, watched]);

  // -- the announcement loop --------------------------------------------------
  const tick = useCallback(() => {
    const v = voiceRef.current;
    const view: VoiceView = {
      live: v.live,
      boundId: v.bound?.id ?? null,
      status: v.status,
      partial: v.partial,
      busy: v.busy,
      userSpeaking: v.userSpeaking,
      alarmPlaying: player().isPlaying(),
    };
    setRinging(view.alarmPlaying);
    setSoundReady(player().soundReady);

    const step = next(announceRef.current, (item) => gateOpen(view, item.experimentId), Date.now());
    announceRef.current = step.state;
    if (step.dropped.length) {
      setOutcomes((prev) => ({ ...prev, ...Object.fromEntries(step.dropped.map((id) => [id, 'not-announced'])) }));
    }
    const item = step.send;
    if (!item) return;
    const sentAt = Date.now();
    if (!v.sendReplyCreate(item.instructions)) {
      setOutcomes((prev) => ({ ...prev, [item.timerId]: 'failed' }));
      return;
    }
    // The agent speaking is the only evidence; an error right after is its absence.
    setTimeout(() => {
      const errorAt = voiceRef.current.lastErrorAt;
      const failed = errorAt !== null && errorAt >= sentAt;
      setOutcomes((prev) => ({ ...prev, [item.timerId]: failed ? 'failed' : 'announced' }));
    }, ANNOUNCE_ERROR_WINDOW_MS);
  }, [player]);

  useEffect(() => {
    tick();
  }, [tick, voice.status, voice.partial, voice.busy, voice.userSpeaking, voice.live, voice.bound]);

  useEffect(() => {
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [tick]);

  // -- sound ------------------------------------------------------------------
  const enableSound = useCallback(async () => {
    const ready = await player().unlock();
    setSoundReady(ready);
    if (ready) {
      // Alarms scheduled while the context was suspended were placed on a
      // frozen clock; place them again now that it runs (FR-316).
      for (const [timerId, alarm] of alarmsRef.current) {
        if (!finishedIds.current.has(timerId)) schedule(alarm.timer, alarm.atMs, alarm.experimentId, alarm.experimentCode);
      }
    }
    return ready;
  }, [player, schedule]);

  // Starting voice was a user gesture, which lets the alarm's audio start too.
  useEffect(() => {
    if (voice.live) void enableSound();
  }, [voice.live, enableSound]);

  // -- actions ----------------------------------------------------------------
  const [pending, setPending] = useState<Action | null>(null);
  const act = useCallback(
    async (action: Action): Promise<ActionResult> => {
      if (!watched) return { ok: false, message: 'Open an experiment first.' };
      setPending(action);
      void enableSound(); // the click is a user gesture (research R-311)
      try {
        const outcome = await callTool({
          tool: 'step_timer',
          args: { action },
          experiment_id: watched.id,
          session_id: null,
        });
        if (!outcome.success) return { ok: false, message: outcome.message };
        // Never show a countdown the server did not confirm (FR-321): the
        // display follows the refetched status, not this response.
        await client.invalidateQueries({ queryKey: stepTimerKey(watched.id) });
        return { ok: true };
      } catch {
        return {
          ok: false,
          message: `Couldn't reach the record system, so the timer was not ${action === 'start' ? 'started' : 'cancelled'}.`,
        };
      } finally {
        setPending(null);
      }
    },
    [client, enableSound, watched],
  );
  const start = useCallback(() => act('start'), [act]);
  const cancel = useCallback(() => act('cancel'), [act]);

  const dismiss = useCallback(() => {
    player().dismiss(); // finishes whatever is sounding, which queues its announcement
    setFinished((prev) => prev.map((f) => ({ ...f, dismissed: true })));
    setRinging(false);
  }, [player]);

  const watchedStatus = watched ? statusById[watched.id] : undefined;
  const value = useMemo<StepTimersValue>(
    () => ({
      watched,
      status: watchedStatus,
      timer: watchedStatus?.timer ?? null,
      offsetMs: watchedStatus?.offsetMs ?? 0,
      soundReady,
      ringing,
      finished: finished.filter((f) => !f.dismissed),
      outcomes,
      pending,
      start,
      cancel,
      dismiss,
      enableSound,
    }),
    [watched, watchedStatus, soundReady, ringing, finished, outcomes, pending, start, cancel, dismiss, enableSound],
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useStepTimers(): StepTimersValue {
  const value = useContext(TimerContext);
  if (!value) throw new Error('useStepTimers must be used inside StepTimerProvider');
  return value;
}
