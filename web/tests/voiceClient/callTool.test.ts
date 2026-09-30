/**
 * specs/007 R-714: every tool holds, so a POST /tools that never returns would
 * leave the agent ignoring the user. It must fail, which useVoiceAgent turns
 * into a TRANSPORT_ERROR tool.result.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callTool, TOOL_TIMEOUT_MS } from '@/lib/api';

vi.mock('@/lib/supabase', () => ({ getAccessToken: async () => 'jwt' }));

const request = { tool: 'create_experiment', args: {}, experiment_id: null, session_id: 's1' };

/** A fetch that never answers, and rejects the way fetch does when aborted. */
function hangingFetch() {
  return vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
  );
}

describe('callTool', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('gives up on a request that never returns', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const outcome = callTool(request);
    const settled = expect(outcome).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(TOOL_TIMEOUT_MS);
    await settled;
  });

  it('does not abort a request that answers in time', async () => {
    const body = { success: true, data: {} };
    const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(callTool(request)).resolves.toEqual(body);
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    await vi.advanceTimersByTimeAsync(TOOL_TIMEOUT_MS);
    expect(init.signal?.aborted).toBe(false);
  });

  it('stays well inside the tools\' own timeout', () => {
    expect(TOOL_TIMEOUT_MS).toBeLessThan(30_000);
  });
});
