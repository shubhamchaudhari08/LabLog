/**
 * The timer alarm: eight 880 Hz beeps, about 3.2 s (specs/004 research R-304).
 *
 * Scheduled on the Web Audio clock at the moment the timer is known, not with
 * setTimeout: Chrome throttles timers in background tabs to once a minute, but
 * the audio thread is not throttled, so the beep starts on time regardless.
 *
 * Its own AudioContext, separate from the agent's 24 kHz player, so flushing
 * the agent's speech on barge-in can never cancel an alarm.
 */

const BEEPS = 8;
const BEEP_S = 0.2;
const GAP_S = 0.2;
const RAMP_S = 0.01;
const FREQUENCY = 880;
const GAIN = 0.25;

export const ALARM_DURATION_MS = (BEEPS * (BEEP_S + GAP_S) - GAP_S) * 1000;

interface Scheduled {
  nodes: OscillatorNode[];
  gain: GainNode;
  startsAtMs: number;
  onEnded: () => void;
  ended: boolean;
}

export class AlarmPlayer {
  private context: AudioContext | null = null;
  private scheduled = new Map<string, Scheduled>();

  constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}

  private ensure(): AudioContext {
    if (!this.context) this.context = this.createContext();
    return this.context;
  }

  /** Call from a user gesture. Browsers keep audio off until one happens. */
  async unlock(): Promise<boolean> {
    const context = this.ensure();
    try {
      if (context.state !== 'running') await context.resume();
    } catch {
      // Autoplay policy refused; soundReady stays false and the UI says so.
    }
    return context.state === 'running';
  }

  get soundReady(): boolean {
    return this.context?.state === 'running';
  }

  /** Schedule the alarm for `atMs` (device clock). Rescheduling a timer replaces it. */
  schedule(timerId: string, atMs: number, onEnded: () => void): void {
    this.cancel(timerId);
    const context = this.ensure();
    const when = context.currentTime + Math.max(0, (atMs - Date.now()) / 1000);

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);

    const nodes: OscillatorNode[] = [];
    for (let i = 0; i < BEEPS; i += 1) {
      const start = when + i * (BEEP_S + GAP_S);
      const osc = context.createOscillator();
      osc.frequency.value = FREQUENCY;
      osc.connect(gain);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(GAIN, start + RAMP_S);
      gain.gain.setValueAtTime(GAIN, start + BEEP_S - RAMP_S);
      gain.gain.linearRampToValueAtTime(0, start + BEEP_S);
      osc.start(start);
      osc.stop(start + BEEP_S);
      nodes.push(osc);
    }

    const entry: Scheduled = { nodes, gain, startsAtMs: atMs, onEnded, ended: false };
    nodes[nodes.length - 1].onended = () => this.finish(timerId, entry);
    this.scheduled.set(timerId, entry);
  }

  /** Unschedule without firing onEnded: the timer was cancelled or stopped. */
  cancel(timerId: string): void {
    const entry = this.scheduled.get(timerId);
    if (!entry) return;
    entry.ended = true;
    this.teardown(entry);
    this.scheduled.delete(timerId);
  }

  /** Silence whatever is sounding now; its onEnded still fires. */
  dismiss(): void {
    const now = Date.now();
    for (const [timerId, entry] of this.scheduled) {
      if (entry.startsAtMs <= now) this.finish(timerId, entry);
    }
  }

  isPlaying(nowMs = Date.now()): boolean {
    for (const entry of this.scheduled.values()) {
      if (!entry.ended && entry.startsAtMs <= nowMs) return true;
    }
    return false;
  }

  private finish(timerId: string, entry: Scheduled): void {
    if (entry.ended) return;
    entry.ended = true;
    this.teardown(entry);
    this.scheduled.delete(timerId);
    entry.onEnded();
  }

  private teardown(entry: Scheduled): void {
    for (const osc of entry.nodes) {
      osc.onended = null;
      try {
        osc.stop();
      } catch {
        // Already stopped.
      }
      osc.disconnect();
    }
    entry.gain.disconnect();
  }
}
