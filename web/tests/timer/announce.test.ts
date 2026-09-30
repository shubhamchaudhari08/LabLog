import { describe, expect, it } from 'vitest';
import {
  ANNOUNCE_MAX_WAIT_MS,
  EMPTY,
  enqueue,
  gateOpen,
  next,
  type Pending,
  type VoiceView,
} from '@/components/timer/announce';

const IDLE: VoiceView = {
  live: true,
  boundId: 'exp-a',
  status: 'listening',
  partial: '',
  busy: false,
  userSpeaking: false,
  alarmPlaying: false,
};

const item = (timerId: string, queuedAt = 0): Pending => ({
  timerId,
  experimentId: 'exp-a',
  instructions: `say ${timerId}`,
  queuedAt,
});

describe('gateOpen', () => {
  it('opens only when the bound, live session is idle', () => {
    expect(gateOpen(IDLE, 'exp-a')).toBe(true);
  });

  it.each<[string, Partial<VoiceView>]>([
    ['no live session', { live: false }],
    ['bound to another experiment', { boundId: 'exp-b' }],
    ['a desk session', { boundId: null }],
    ['the agent is speaking', { status: 'speaking' }],
    ['the agent is thinking', { status: 'thinking' }],
    ['reconnecting', { status: 'reconnecting' }],
    ['the user is mid-utterance (partial)', { partial: 'start a' }],
    ['a tool call is in flight', { busy: true }],
    ['the user started speaking', { userSpeaking: true }],
    ['the alarm is still sounding', { alarmPlaying: true }],
  ])('stays closed when %s', (_, change) => {
    expect(gateOpen({ ...IDLE, ...change }, 'exp-a')).toBe(false);
  });
});

describe('queue', () => {
  it('sends the oldest first, once', () => {
    let state = enqueue(enqueue(EMPTY, item('t1')), item('t2'));
    const first = next(state, () => true, 10);
    expect(first.send?.timerId).toBe('t1');
    state = first.state;
    expect(next(state, () => true, 10).send?.timerId).toBe('t2');
  });

  it('does not queue a timer twice, or again after it was handled', () => {
    let state = enqueue(EMPTY, item('t1'));
    state = enqueue(state, item('t1'));
    expect(state.queue).toHaveLength(1);
    state = next(state, () => true, 0).state;
    expect(enqueue(state, item('t1')).queue).toHaveLength(0);
  });

  it('holds while the gate is closed', () => {
    const state = enqueue(EMPTY, item('t1'));
    const step = next(state, () => false, 1_000);
    expect(step.send).toBeUndefined();
    expect(step.state.queue).toHaveLength(1);
  });

  it('drops an announcement that waited more than a minute', () => {
    const state = enqueue(EMPTY, item('t1', 0));
    const step = next(state, () => true, ANNOUNCE_MAX_WAIT_MS + 1);
    expect(step.send).toBeUndefined();
    expect(step.dropped).toEqual(['t1']);
    expect(step.state.done.has('t1')).toBe(true);
  });
});
