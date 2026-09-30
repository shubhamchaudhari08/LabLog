'use client';

/**
 * Where a step timer shows (specs/004-step-timers FR-312, FR-313, FR-316).
 *
 *   StepTimerSlot   — on the bench, beside the step the timer belongs to, plus
 *                     the Start button on a timed current step (US3).
 *   HeaderTimerChip — in the app header on every screen: the countdown, or a
 *                     finished timer until it is dismissed.
 *
 * Every figure comes from the server's status: remaining time is computed from
 * the stored end time and the server clock offset, never counted locally from
 * when a button was pressed.
 */

import { useEffect, useState } from 'react';
import { formatCountdown, remainingMs } from './clock';
import { useStepTimers, type StepTimersValue } from './StepTimerProvider';

const ERROR_VISIBLE_MS = 6_000;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function notAnnounced(timers: StepTimersValue, timerId: string): boolean {
  const outcome = timers.outcomes[timerId];
  return outcome === 'failed' || outcome === 'not-announced';
}

/** Class sets for the light app and the dark bench (specs/005 T080). Behaviour is identical. */
const TONES = {
  light: {
    strong: 'text-ink',
    muted: 'text-muted',
    done: 'text-status-running-text',
    warn: 'text-deviation-text',
    quiet: 'text-muted hover:bg-surface-muted hover:text-ink',
    start: 'border-primary/30 text-primary-text hover:bg-primary-tint-soft',
    chip: 'border-border-control bg-surface-card text-ink',
    doneChip: 'border-status-done-dot/40 bg-status-running-bg text-ink',
  },
  dark: {
    strong: 'text-on-dark-strong',
    muted: 'text-on-dark-muted',
    done: 'text-status-running-on-dark',
    warn: 'text-deviation-on-dark',
    quiet: 'text-on-dark-muted hover:bg-dark-raised hover:text-on-dark',
    start: 'border-primary-on-dark/40 text-primary-on-dark hover:bg-dark-raised',
    chip: 'border-dark-border bg-dark-panel text-on-dark',
    doneChip: 'border-status-running-border-dark bg-status-running-bg-dark text-on-dark',
  },
};

function SoundOff({ timers, onDark = false }: { timers: StepTimersValue; onDark?: boolean }) {
  if (timers.soundReady) return null;
  return (
    <button
      type="button"
      onClick={() => void timers.enableSound()}
      className={`rounded-sm px-[6px] py-[1px] text-[11px] font-medium underline-offset-2 hover:underline ${TONES[onDark ? 'dark' : 'light'].warn}`}
      title="The browser blocks sound until you interact with the page. Click to allow the alarm."
    >
      Sound off — enable
    </button>
  );
}

function useFlash(): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), ERROR_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [message]);
  return [message, setMessage];
}

/**
 * The bench rail's slot for one step. Renders the timer on the step it was
 * started for, which is not necessarily the current step (spec Story 4 #6),
 * and the Start button on a timed current step.
 */
export function StepTimerSlot({
  stepIndex,
  currentIndex,
  onDark = false,
}: {
  stepIndex: number;
  currentIndex: number;
  onDark?: boolean;
}) {
  const t = TONES[onDark ? 'dark' : 'light'];
  const timers = useStepTimers();
  const now = useNow(250);
  const [error, flash] = useFlash();
  const { timer, status } = timers;

  const onThisStep = timer && timer.step_index === stepIndex;
  const running = timer?.state === 'running';

  let body: React.ReactNode = null;
  if (onThisStep && timer) {
    const left = running ? remainingMs(timer.ends_at, timers.offsetMs, now) : 0;
    body =
      running && left > 0 ? (
        <>
          <span
            role="timer"
            aria-label={`${timer.duration_spoken} timer, ${formatCountdown(left)} left`}
            className={`tabular font-mono text-[15px] font-semibold ${t.strong}`}
          >
            {formatCountdown(left)}
          </span>
          <span className={`text-caption ${t.muted}`}>of {timer.duration_spoken}</span>
          <SoundOff timers={timers} onDark={onDark} />
          <button
            type="button"
            disabled={timers.pending !== null}
            onClick={async () => {
              const result = await timers.cancel();
              if (!result.ok) flash(result.message);
            }}
            className={`ml-auto rounded-sm px-xs py-[2px] text-caption font-medium disabled:opacity-50 ${t.quiet}`}
          >
            {timers.pending === 'cancel' ? 'Cancelling…' : 'Cancel'}
          </button>
        </>
      ) : (
        <>
          <span className={`text-caption font-medium ${t.done}`}>Complete · {clockTime(timer.ends_at)}</span>
          {notAnnounced(timers, timer.timer_id) && <span className={`text-caption ${t.muted}`}>(not announced)</span>}
          {timers.ringing && (
            <button
              type="button"
              onClick={timers.dismiss}
              className="ml-auto rounded-sm bg-primary px-xs py-[2px] text-caption font-medium text-on-primary"
            >
              Dismiss
            </button>
          )}
        </>
      );
  } else if (stepIndex === currentIndex && status?.current_step_timer_seconds && !running) {
    body = (
      <button
        type="button"
        disabled={timers.pending !== null}
        onClick={async () => {
          const result = await timers.start();
          if (!result.ok) flash(result.message);
        }}
        className={`rounded-sm border px-xs py-[2px] text-caption font-medium disabled:opacity-50 ${t.start}`}
      >
        {timers.pending === 'start' ? 'Starting…' : `Start timer (${status.current_step_timer_spoken})`}
      </button>
    );
  }

  if (!body && !error) return null;
  return (
    <div className="pb-[10px]">
      {body && <div className="flex items-center gap-xs">{body}</div>}
      {error && (
        <p role="alert" className={`mt-[4px] text-caption ${t.warn}`}>
          {error}
        </p>
      )}
    </div>
  );
}

/** The header's chip, on every screen (and in the bench header, on dark). */
export function HeaderTimerChip({ onDark = false }: { onDark?: boolean } = {}) {
  const t = TONES[onDark ? 'dark' : 'light'];
  const timers = useStepTimers();
  const now = useNow(250);
  const finished = timers.finished[0];

  if (finished) {
    return (
      <span
        role="status"
        className={`inline-flex h-[34px] items-center gap-xs rounded-pill border py-[4px] pl-[12px] pr-[4px] text-caption ${t.doneChip}`}
      >
        <span>
          Timer complete
          {finished.experimentCode && <span className={`ml-xxs font-mono text-[11px] ${t.muted}`}>{finished.experimentCode}</span>}
        </span>
        {finished.silent && <span className={`text-[11px] ${t.warn}`}>sound was off</span>}
        {notAnnounced(timers, finished.timerId) && <span className={`text-[11px] ${t.muted}`}>(not announced)</span>}
        <button
          type="button"
          onClick={timers.dismiss}
          className="rounded-pill bg-primary px-xs py-[2px] text-[11px] font-medium text-on-primary"
        >
          Dismiss
        </button>
      </span>
    );
  }

  const timer = timers.timer;
  if (timer?.state !== 'running') return null;
  const left = remainingMs(timer.ends_at, timers.offsetMs, now);
  if (left <= 0) return null;
  return (
    <span className={`inline-flex h-[34px] items-center gap-xs rounded-pill border py-[4px] pl-[12px] pr-xs text-code ${t.chip}`}>
      <span
        role="timer"
        aria-label={`${timer.duration_spoken} timer, ${formatCountdown(left)} left`}
        className="tabular font-mono font-semibold"
      >
        {formatCountdown(left)}
      </span>
      {timers.watched?.code && <span className={`font-mono text-[11px] ${t.muted}`}>{timers.watched.code}</span>}
      <SoundOff timers={timers} onDark={onDark} />
    </span>
  );
}
