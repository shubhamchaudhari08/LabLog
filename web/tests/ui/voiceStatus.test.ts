import { describe, expect, it } from 'vitest';
import { voiceStatusView, type VoiceStatusInput } from '@/lib/ui/voiceStatus';
import { fixture } from './fixtures';

interface Case extends VoiceStatusInput {
  understoodAt: number | null;
  expect: Record<string, unknown>;
}
const state = fixture<{ now: number; cases: Record<string, Case> }>('voice-state');
const view = (name: string, now = state.now) => {
  const c = state.cases[name];
  return voiceStatusView(c, c.understoodAt, now);
};

describe('voiceStatusView (contracts/ui-voice-surfaces.md §1)', () => {
  it.each([
    'desk_listening',
    'bench_listening',
    'bench_understood',
    'paused',
    'reconnecting',
    'mic_blocked',
  ])('%s matches the fixture', (name) => {
    const expected = { ...state.cases[name].expect };
    delete expected.note;
    delete expected.chips;
    delete expected.dock;
    expect(view(name)).toMatchObject(expected);
  });

  it('shows UNDERSTOOD for 2500 ms after a stored result, then falls through', () => {
    const c = state.cases.bench_understood;
    expect(voiceStatusView(c, c.understoodAt, c.understoodAt! + 2499).label).toBe('UNDERSTOOD');
    expect(voiceStatusView(c, c.understoodAt, c.understoodAt! + 2501).label).toBe('WORKING');
    expect(view('bench_understood_expired').label).toBe('LISTENING');
  });

  it('applies the precedence error > reconnecting > muted > understood > status', () => {
    const base = state.cases.bench_listening;
    const now = state.now;
    const recent = now - 100;
    expect(
      voiceStatusView({ ...base, status: 'error', error: 'boom', muted: true }, recent, now).label,
    ).toBe('boom');
    expect(
      voiceStatusView({ ...base, status: 'reconnecting', muted: true }, recent, now).label,
    ).toBe('RECONNECTING · nothing is being recorded');
    expect(voiceStatusView({ ...base, muted: true }, recent, now).label).toBe('PAUSED');
    expect(voiceStatusView(base, recent, now).label).toBe('UNDERSTOOD');
  });

  it('animates the waveform only while listening, ready or speaking and not muted', () => {
    const base = state.cases.bench_listening;
    const wave = (status: VoiceStatusInput['status'], muted = false) =>
      voiceStatusView({ ...base, status, muted }, null, state.now).wave;
    expect(wave('listening')).toBe(true);
    expect(wave('ready')).toBe(true);
    expect(wave('speaking')).toBe(true);
    expect(wave('thinking')).toBe(false);
    expect(wave('connecting')).toBe(false);
    expect(wave('listening', true)).toBe(false);
  });

  it('labels thinking and speaking in plain words', () => {
    const base = state.cases.bench_listening;
    expect(voiceStatusView({ ...base, status: 'thinking' }, null, state.now).label).toBe('WORKING');
    expect(voiceStatusView({ ...base, status: 'speaking' }, null, state.now).label).toBe(
      'REPLYING',
    );
  });

  it('builds the context line for bench, desk and switching', () => {
    expect(view('bench_listening').context).toBe('STAB-105 · step 6');
    expect(view('desk_listening').context).toBe('no experiment open');
    expect(view('switching').context).toBe('opening PCR-01-3…');
    expect(view('switching').label).toBe('CONNECTING');
  });
});
