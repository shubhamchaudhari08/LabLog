import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlarmPlayer } from '@/components/timer/AlarmPlayer';

class FakeParam {
  value = 0;
  setValueAtTime() {}
  linearRampToValueAtTime() {}
}

class FakeOscillator {
  frequency = new FakeParam();
  starts: number[] = [];
  onended: (() => void) | null = null;
  connect() {}
  disconnect() {}
  start(at: number) {
    this.starts.push(at);
  }
  stop() {}
}

class FakeContext {
  state: AudioContextState = 'suspended';
  currentTime = 100;
  destination = {};
  oscillators: FakeOscillator[] = [];
  async resume() {
    this.state = 'running';
  }
  createGain() {
    return { gain: new FakeParam(), connect() {}, disconnect() {} };
  }
  createOscillator() {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }
}

describe('AlarmPlayer', () => {
  let context: FakeContext;
  let player: AlarmPlayer;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T14:00:00Z'));
    context = new FakeContext();
    player = new AlarmPlayer(() => context as unknown as AudioContext);
  });

  afterEach(() => vi.useRealTimers());

  it('schedules eight beeps on the audio clock, starting at the timer end', () => {
    player.schedule('t1', Date.now() + 10_000, () => {});
    expect(context.oscillators).toHaveLength(8);
    const starts = context.oscillators.map((o) => o.starts[0]);
    expect(starts[0]).toBeCloseTo(110);
    expect(starts[1] - starts[0]).toBeCloseTo(0.4);
    expect(starts[7]).toBeCloseTo(112.8);
  });

  it('fires onEnded when the last beep ends', () => {
    const onEnded = vi.fn();
    player.schedule('t1', Date.now(), onEnded);
    context.oscillators[7].onended?.();
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('cancel suppresses onEnded', () => {
    const onEnded = vi.fn();
    player.schedule('t1', Date.now() + 1_000, onEnded);
    const last = context.oscillators[7];
    player.cancel('t1');
    last.onended?.();
    expect(onEnded).not.toHaveBeenCalled();
    expect(player.isPlaying(Date.now() + 2_000)).toBe(false);
  });

  it('rescheduling a timer replaces the earlier schedule', () => {
    const first = vi.fn();
    player.schedule('t1', Date.now() + 1_000, first);
    const stale = context.oscillators[7];
    player.schedule('t1', Date.now() + 2_000, () => {});
    stale.onended?.();
    expect(first).not.toHaveBeenCalled();
  });

  it('dismiss silences a sounding alarm and still reports it ended', () => {
    const onEnded = vi.fn();
    player.schedule('t1', Date.now() - 500, onEnded);
    expect(player.isPlaying()).toBe(true);
    player.dismiss();
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(player.isPlaying()).toBe(false);
  });

  it('dismiss leaves a future alarm scheduled', () => {
    const onEnded = vi.fn();
    player.schedule('t1', Date.now() + 60_000, onEnded);
    player.dismiss();
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('reports sound readiness after a gesture unlocks it', async () => {
    player.schedule('t1', Date.now() + 1_000, () => {});
    expect(player.soundReady).toBe(false);
    expect(await player.unlock()).toBe(true);
    expect(player.soundReady).toBe(true);
  });
});
