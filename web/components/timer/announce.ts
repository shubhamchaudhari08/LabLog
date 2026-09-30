/**
 * When may the agent announce a finished timer? (specs/004 contracts/voice-announcement.md §2–§3)
 *
 * Pure, so every gate condition is testable. The provider feeds it the live
 * voice state; this decides whether the head of the queue may be sent now, and
 * drops anything that waited too long rather than announcing it minutes late.
 */

export const ANNOUNCE_MAX_WAIT_MS = 60_000;

export interface Pending {
  timerId: string;
  experimentId: string;
  instructions: string;
  queuedAt: number;
}

export interface AnnounceState {
  queue: Pending[];
  /** Announced, failed or dropped: never queued again. */
  done: ReadonlySet<string>;
}

export const EMPTY: AnnounceState = { queue: [], done: new Set() };

export interface VoiceView {
  live: boolean;
  boundId: string | null;
  status: string;
  partial: string;
  busy: boolean;
  userSpeaking: boolean;
  alarmPlaying: boolean;
}

/** Every row of the contract's §3 table. */
export function gateOpen(v: VoiceView, timerExperimentId: string): boolean {
  return (
    v.live &&
    v.boundId === timerExperimentId &&
    v.status === 'listening' &&
    v.partial === '' &&
    !v.busy &&
    !v.userSpeaking &&
    !v.alarmPlaying
  );
}

export function enqueue(state: AnnounceState, item: Pending): AnnounceState {
  if (state.done.has(item.timerId) || state.queue.some((q) => q.timerId === item.timerId)) return state;
  return { ...state, queue: [...state.queue, item] };
}

export interface Step {
  state: AnnounceState;
  send?: Pending;
  dropped: string[];
}

export function next(state: AnnounceState, isOpen: (item: Pending) => boolean, nowMs: number): Step {
  const done = new Set(state.done);
  const dropped: string[] = [];
  const live: Pending[] = [];
  for (const item of state.queue) {
    if (nowMs - item.queuedAt > ANNOUNCE_MAX_WAIT_MS) {
      done.add(item.timerId);
      dropped.push(item.timerId);
    } else {
      live.push(item);
    }
  }

  const head = live[0];
  if (head && isOpen(head)) {
    done.add(head.timerId);
    return { state: { queue: live.slice(1), done }, send: head, dropped };
  }
  return { state: { queue: live, done }, dropped };
}
