import { describe, expect, it } from 'vitest';
import { agentCardView } from '@/lib/ui/agentCard';
import { voiceStatusView, type VoiceStatusInput } from '@/lib/ui/voiceStatus';
import { micReadiness, type MicState } from '@/lib/voiceClient/micReadiness';
import { fixture } from './fixtures';

interface Case extends VoiceStatusInput {
  understoodAt: number | null;
  expect: { agentCard?: Record<string, string> };
}
const state = fixture<{ now: number; cases: Record<string, Case> }>('voice-state');
const card = (c: Case) => agentCardView(voiceStatusView(c, c.understoodAt, state.now), c);

describe('agentCardView (contracts/ui-voice-surfaces.md §7)', () => {
  it('idle: green dot, ready, mic idle', () => {
    expect(card(state.cases.idle)).toEqual({
      ...state.cases.idle.expect.agentCard,
      pulse: true,
      href: null,
      requestable: false,
    });
  });

  it('live and bound: clay dot, streaming to the run, links to its bench', () => {
    expect(card(state.cases.bench_listening)).toEqual({
      dot: 'clay',
      title: 'Listening',
      subtitle: 'Streaming to STAB-105',
      pulse: true,
      href: '/dashboard/experiments/exp-105/bench',
      requestable: false,
    });
  });

  it('live desk session: no experiment open', () => {
    expect(card(state.cases.desk_listening)).toMatchObject({
      dot: 'clay',
      subtitle: 'No experiment open',
      href: null,
    });
  });

  it('muted: grey, paused', () => {
    expect(card(state.cases.paused)).toMatchObject({
      dot: 'grey',
      title: 'Paused',
      subtitle: 'Mic muted · STAB-105',
      pulse: false,
    });
  });

  it('reconnecting and error: nothing is being recorded', () => {
    expect(card(state.cases.reconnecting)).toMatchObject({
      dot: 'amber',
      title: 'Reconnecting',
      subtitle: 'Nothing is being recorded',
    });
    expect(card(state.cases.mic_blocked)).toMatchObject({
      dot: 'danger',
      title: 'Voice error',
      subtitle: 'Nothing is being recorded',
    });
  });
});

describe('agentCardView with microphone readiness (ui-voice-surfaces §7)', () => {
  const idle = state.cases.idle;
  const idleView = voiceStatusView(idle, null, state.now);
  const mic = (over: Partial<MicState>) =>
    micReadiness({ permission: 'granted', hasInput: true, failure: null, ...over });

  it('stays green only when the microphone is ready', () => {
    expect(agentCardView(idleView, idle, mic({}))).toMatchObject({
      dot: 'green',
      title: 'Voice agent ready',
    });
  });

  it('turns red and asks for permission, and a tap can fix it', () => {
    expect(agentCardView(idleView, idle, mic({ permission: 'prompt' }))).toMatchObject({
      dot: 'danger',
      title: 'Microphone access needed',
      subtitle: 'Tap to allow the microphone',
      requestable: true,
      pulse: false,
    });
  });

  it('turns red with instructions when blocked or missing, which a tap cannot fix', () => {
    expect(agentCardView(idleView, idle, mic({ permission: 'denied' }))).toMatchObject({
      dot: 'danger',
      title: 'Microphone blocked',
      requestable: false,
    });
    expect(agentCardView(idleView, idle, mic({ failure: 'no-device' }))).toMatchObject({
      dot: 'danger',
      title: 'No microphone found',
    });
  });

  it('is grey, not red, while still checking', () => {
    expect(agentCardView(idleView, idle, mic({ permission: 'checking' })).dot).toBe('grey');
  });

  it('describes a live session, not the idle microphone, while one is running', () => {
    const live = state.cases.bench_listening;
    const view = voiceStatusView(live, null, state.now);
    expect(agentCardView(view, live, mic({ permission: 'prompt' })).dot).toBe('clay');
  });
});
