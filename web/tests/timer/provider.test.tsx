/**
 * specs/004-step-timers T039 — the provider's resilience rules (spec Story 4).
 *
 * Rendered with react-dom in jsdom; the voice session, the API, Supabase and the
 * alarm are mocked, so these assert decisions, not audio.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/lib/api', () => ({ callTool: (...args: unknown[]) => callTool(...args) }));

vi.mock('@/lib/supabase', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { channel: () => channel, removeChannel: vi.fn() } };
});

let voice: Record<string, unknown>;
vi.mock('@/components/voice/VoiceSession', () => ({ useVoiceSession: () => voice }));

const player = {
  schedule: vi.fn(),
  cancel: vi.fn(),
  dismiss: vi.fn(),
  isPlaying: vi.fn(() => false),
  unlock: vi.fn(async () => true),
  soundReady: true,
};
vi.mock('@/components/timer/AlarmPlayer', () => ({
  AlarmPlayer: vi.fn(() => player),
  ALARM_DURATION_MS: 3_000,
}));

import { StepTimerProvider, useStepTimers, type StepTimersValue } from '@/components/timer/StepTimerProvider';
import { stepTimerKey } from '@/lib/queries/useStepTimer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function status(timer: Record<string, unknown> | null) {
  return { success: true, data: { timer, server_now: new Date().toISOString(), current_step_timer_seconds: 600 } };
}

function timer(id: string, state: 'running' | 'completed', endsInMs: number) {
  return {
    timer_id: id,
    state,
    duration_seconds: 600,
    duration_spoken: '10 minutes',
    started_at: new Date(Date.now() - 1_000).toISOString(),
    ends_at: new Date(Date.now() + endsInMs).toISOString(),
    remaining_seconds: Math.max(0, Math.ceil(endsInMs / 1000)),
    remaining_spoken: '1 minute',
    step_index: 2,
    step_name: 'Centrifuge',
    protocol_seconds: 600,
    differs_from_protocol: false,
    completion_instructions: 'Say the timer is complete.',
  };
}

function idleVoice(overrides: Record<string, unknown> = {}) {
  return {
    bound: { id: 'exp-a', code: 'STAB-105' },
    live: false,
    status: 'idle',
    partial: '',
    busy: false,
    userSpeaking: false,
    lastErrorAt: null,
    muteMicBetween: vi.fn(),
    sendReplyCreate: vi.fn(() => true),
    ...overrides,
  };
}

let root: Root;
let client: QueryClient;
let latest: StepTimersValue;

function Probe() {
  latest = useStepTimers();
  return null;
}

function render() {
  root.render(
    createElement(QueryClientProvider, { client }, createElement(StepTimerProvider, null, createElement(Probe))),
  );
}

async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  voice = idleVoice();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
});

describe('StepTimerProvider', () => {
  it('(a) a timer first seen completed never alarms and is never announced', async () => {
    callTool.mockResolvedValue(status(timer('t1', 'completed', -5_000)));
    await act(async () => render());
    await flush();

    expect(latest.timer?.state).toBe('completed');
    expect(player.schedule).not.toHaveBeenCalled();
    expect((voice.sendReplyCreate as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('(b) an experiment that leaves RUNNING cancels the scheduled alarm', async () => {
    callTool.mockResolvedValue(status(timer('t1', 'running', 60_000)));
    await act(async () => render());
    await flush();
    expect(player.schedule).toHaveBeenCalledTimes(1);
    expect((voice.muteMicBetween as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

    callTool.mockResolvedValue({ success: false, error: 'EXPERIMENT_NOT_RUNNING', message: 'completed' });
    await act(async () => {
      await client.invalidateQueries({ queryKey: stepTimerKey('exp-a') });
    });
    await flush();
    expect(player.cancel).toHaveBeenCalledWith('t1');
  });

  it('a dropped connection does not silence a running alarm', async () => {
    callTool.mockResolvedValue(status(timer('t1', 'running', 60_000)));
    await act(async () => render());
    await flush();

    callTool.mockResolvedValue({ success: false, error: 'TRANSPORT_ERROR', message: 'offline' });
    await act(async () => {
      await client.invalidateQueries({ queryKey: stepTimerKey('exp-a') });
    });
    await flush();
    expect(player.cancel).not.toHaveBeenCalled();
  });

  it('(c) the voice session reconnecting neither cancels nor reschedules the alarm', async () => {
    callTool.mockResolvedValue(status(timer('t1', 'running', 60_000)));
    voice = idleVoice({ live: true, status: 'listening' });
    await act(async () => render());
    await flush();
    const scheduled = player.schedule.mock.calls.length;

    for (const s of ['reconnecting', 'listening']) {
      voice = { ...voice, status: s };
      await act(async () => render());
      await flush();
    }
    expect(player.cancel).not.toHaveBeenCalled();
    expect(player.schedule.mock.calls.length).toBe(scheduled);
  });

  it('(d) leaving the bench keeps watching the last experiment opened there', async () => {
    callTool.mockResolvedValue(status(timer('t1', 'running', 60_000)));
    await act(async () => render());
    await flush();

    voice = { ...voice, bound: null };
    await act(async () => render());
    await flush();
    expect(latest.watched?.id).toBe('exp-a');
    expect(latest.timer?.timer_id).toBe('t1');
  });

  it('(e) keeps A’s alarm when B is opened, and announces only through a session bound to A', async () => {
    callTool.mockImplementation(async ({ experiment_id }: { experiment_id: string }) =>
      status(experiment_id === 'exp-a' ? timer('t1', 'running', 60_000) : null),
    );
    voice = idleVoice({ live: true, status: 'listening' });
    await act(async () => render());
    await flush();
    const onEnded = player.schedule.mock.calls[0][2] as () => void;

    // Owner decision G1: opening another experiment does not silence this one.
    voice = { ...voice, bound: { id: 'exp-b', code: 'STAB-106' } };
    await act(async () => render());
    await flush();
    expect(player.cancel).not.toHaveBeenCalled();

    await act(async () => onEnded());
    await flush();
    expect((voice.sendReplyCreate as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(latest.finished[0]?.experimentCode).toBe('STAB-105');

    voice = { ...voice, bound: { id: 'exp-a', code: 'STAB-105' } };
    await act(async () => render());
    await flush();
    expect((voice.sendReplyCreate as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('Say the timer is complete.');
  });

  it('dismiss silences the alarm and hides the finished chip', async () => {
    callTool.mockResolvedValue(status(timer('t1', 'running', 60_000)));
    await act(async () => render());
    await flush();
    const onEnded = player.schedule.mock.calls[0][2] as () => void;
    await act(async () => onEnded());
    expect(latest.finished).toHaveLength(1);

    await act(async () => latest.dismiss());
    expect(player.dismiss).toHaveBeenCalled();
    expect(latest.finished).toHaveLength(0);
  });
});
