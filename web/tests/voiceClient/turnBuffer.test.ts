/**
 * T049 — the pending tool-result buffer.
 *
 * Every assertion here maps to a line in contracts/aai-websocket.md §6. This is
 * the protocol rule most likely to be got wrong, and getting it wrong looks
 * like the agent ignoring results rather than like a client bug.
 */

import { describe, expect, it, vi } from 'vitest';
import { TRANSPORT_ERROR, TurnBuffer } from '@/lib/voiceClient/turnBuffer';

function setup() {
  const send = vi.fn();
  return { send, buffer: new TurnBuffer(send) };
}

describe('TurnBuffer', () => {
  it('sends nothing before reply.done', () => {
    const { send, buffer } = setup();

    buffer.openTurn('reply-1');
    buffer.registerCall('call-1');
    buffer.completeCall('call-1', { success: true, data: { value: 4.2 } });

    expect(send).not.toHaveBeenCalled();
    expect(buffer.buffered).toBe(1);
  });

  it('flushes on reply.done', () => {
    const { send, buffer } = setup();

    buffer.openTurn('reply-1');
    buffer.registerCall('call-1');
    buffer.completeCall('call-1', { success: true, data: { value: 4.2 } });
    buffer.closeTurn('reply-1');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: 'tool.result',
      call_id: 'call-1',
      result: JSON.stringify({ success: true, data: { value: 4.2 } }),
    });
    expect(buffer.buffered).toBe(0);
  });

  it('serialises the result to a JSON string, not an object', () => {
    // The protocol is asymmetric: arguments arrive as an object, results go
    // back as a string. Easy to get backwards.
    const { send, buffer } = setup();

    buffer.openTurn('r');
    buffer.registerCall('c');
    buffer.completeCall('c', { success: true });
    buffer.closeTurn('r');

    expect(typeof send.mock.calls[0][0].result).toBe('string');
  });

  it('flushes several results from one turn in order', () => {
    const { send, buffer } = setup();

    buffer.openTurn('reply-1');
    for (const id of ['a', 'b', 'c']) {
      buffer.registerCall(id);
      buffer.completeCall(id, { success: true, data: { id } });
    }
    expect(send).not.toHaveBeenCalled();

    buffer.closeTurn('reply-1');
    expect(send.mock.calls.map((c) => c[0].call_id)).toEqual(['a', 'b', 'c']);
  });

  it('sends immediately when the dispatch finishes after reply.done', () => {
    // A slow backend must not leave the result stranded in a turn that is over.
    const { send, buffer } = setup();

    buffer.openTurn('reply-1');
    buffer.registerCall('slow');
    buffer.closeTurn('reply-1');
    expect(send).not.toHaveBeenCalled();

    buffer.completeCall('slow', { success: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].call_id).toBe('slow');
  });

  it('still sends a result when the dispatch failed', () => {
    // Silence leaves the agent waiting until timeout_seconds with a live
    // microphone — on camera that is indistinguishable from a crash.
    const { send, buffer } = setup();

    buffer.openTurn('reply-1');
    buffer.registerCall('call-1');
    buffer.completeCall('call-1', TRANSPORT_ERROR);
    buffer.closeTurn('reply-1');

    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][0].result)).toMatchObject({
      success: false,
      error: 'TRANSPORT_ERROR',
    });
  });

  it('keeps two concurrent turns separate', () => {
    const { send, buffer } = setup();

    buffer.openTurn('reply-1');
    buffer.registerCall('call-1');
    buffer.openTurn('reply-2');
    buffer.registerCall('call-2');

    buffer.completeCall('call-1', { success: true, data: { turn: 1 } });
    buffer.completeCall('call-2', { success: true, data: { turn: 2 } });

    buffer.closeTurn('reply-2');
    expect(send.mock.calls.map((c) => c[0].call_id)).toEqual(['call-2']);

    buffer.closeTurn('reply-1');
    expect(send.mock.calls.map((c) => c[0].call_id)).toEqual(['call-2', 'call-1']);
  });

  it('does not strand a tool.call that arrives before reply.started', () => {
    const { send, buffer } = setup();

    buffer.registerCall('early');
    buffer.completeCall('early', { success: true });

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('closing an unknown turn is a no-op, not a throw', () => {
    const { send, buffer } = setup();
    expect(() => buffer.closeTurn('never-opened')).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('tracks in-flight dispatches', () => {
    const { buffer } = setup();

    buffer.openTurn('reply-1');
    buffer.registerCall('call-1');
    expect(buffer.inFlight).toBe(1);

    buffer.completeCall('call-1', { success: true });
    expect(buffer.inFlight).toBe(0);
  });
});
