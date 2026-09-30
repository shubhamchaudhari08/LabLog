/**
 * The "next step" button and the refusals it can override (owner report
 * 2026-09-30): a step with required readings missing asks before completing,
 * and "Complete step" sends the override the tool asked for.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/lib/api', () => ({ callTool: (...args: unknown[]) => callTool(...args) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/components/voice/VoiceSession', () => ({ useVoiceSession: () => ({ busy: false, sessionId: 's1' }) }));

import { BenchCommands } from '@/components/bench/BenchCommands';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const INCOMPLETE = {
  success: false,
  error: 'STEP_INCOMPLETE',
  message: 'Record initial temperature is still missing temperature for A18 and CONTROL-01.',
};
const TIMER = {
  success: false,
  error: 'TIMER_STILL_RUNNING',
  message: 'timer',
  detail: { duration_spoken: '15 minutes', remaining_spoken: '2 minutes' },
};
const DONE = { success: true, data: { advanced: true } };

let root: Root;
let host: HTMLDivElement;

function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
  if (!found) throw new Error(`no button "${label}" in: ${host.textContent}`);
  return found;
}

async function click(label: string) {
  await act(async () => button(label).click());
}

beforeEach(async () => {
  callTool.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const client = new QueryClient();
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client }, createElement(BenchCommands, { experimentId: 'e1' }))),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('BenchCommands next step', () => {
  it('asks before completing a step with readings missing, and overrides on confirm', async () => {
    callTool.mockResolvedValueOnce(INCOMPLETE).mockResolvedValueOnce(DONE);
    await click('next step');
    expect(host.textContent).toContain('missing temperature for A18 and CONTROL-01. Complete anyway?');
    await click('Complete step');
    expect(callTool.mock.calls[1][0].args).toEqual({ confirmed_incomplete: true });
    expect(host.textContent).not.toContain('Complete anyway?');
  });

  it('"Not yet" leaves the step alone', async () => {
    callTool.mockResolvedValueOnce(INCOMPLETE);
    await click('next step');
    await click('Not yet');
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain('Complete anyway?');
  });

  it('keeps both overrides when a step is incomplete and still timing', async () => {
    callTool.mockResolvedValueOnce(INCOMPLETE).mockResolvedValueOnce(TIMER).mockResolvedValueOnce(DONE);
    await click('next step');
    await click('Complete step');
    expect(host.textContent).toContain('2 minutes left');
    await click('Complete step');
    expect(callTool.mock.calls[2][0].args).toEqual({ confirmed_incomplete: true, confirmed_early: true });
  });
});
