/**
 * Per-turn pending tool-result buffer.
 *
 * The protocol rule (contracts/aai-websocket.md §6):
 *
 *   Accumulate tool results and send them ONLY after reply.done arrives for the
 *   turn that contained the tool.call.
 *
 * So the voice client cannot be a stateless event router. Sending early is the
 * single most likely voice-loop bug, and it presents as the agent ignoring tool
 * results rather than as a client error — which is why this logic lives in its
 * own module with its own tests instead of inside a React hook where it can
 * only be exercised by hand.
 *
 * Two edge cases the naive version gets wrong:
 *   - a result that completes AFTER reply.done must be sent immediately, not
 *     held for a turn that will never come;
 *   - a dispatch that FAILS must still send a result. Silence leaves the agent
 *     waiting until timeout_seconds with a live microphone, which on camera
 *     looks exactly like a crash.
 */

export interface PendingResult {
  call_id: string;
  /** Already serialised — the protocol wants a JSON string here. */
  result: string;
}

export type SendFn = (message: { type: 'tool.result'; call_id: string; result: string }) => void;

export class TurnBuffer {
  /** reply_id -> results waiting for that turn to finish. */
  private pending = new Map<string, PendingResult[]>();

  /** Turns whose reply.done already arrived; results for these flush at once. */
  private closed = new Set<string>();

  /** call_id -> reply_id, so a completing dispatch knows which turn it belongs to. */
  private callTurn = new Map<string, string>();

  private currentReplyId: string | null = null;

  constructor(private readonly send: SendFn) {}

  /** reply.started — open a turn. */
  openTurn(replyId: string): void {
    this.currentReplyId = replyId;
    this.closed.delete(replyId);
    if (!this.pending.has(replyId)) this.pending.set(replyId, []);
  }

  /**
   * tool.call — register the call against the open turn.
   *
   * A tool.call can arrive before reply.started in practice, so fall back to a
   * synthetic turn rather than dropping it.
   */
  registerCall(callId: string): string {
    const replyId = this.currentReplyId ?? '__unattached__';
    if (!this.pending.has(replyId)) this.pending.set(replyId, []);
    this.callTurn.set(callId, replyId);
    return replyId;
  }

  /** A dispatch finished (successfully or not). Buffer or send. */
  completeCall(callId: string, result: unknown): void {
    const replyId = this.callTurn.get(callId) ?? this.currentReplyId ?? '__unattached__';
    this.callTurn.delete(callId);

    const entry: PendingResult = { call_id: callId, result: JSON.stringify(result) };

    // The turn already ended — send now rather than holding it forever.
    if (this.closed.has(replyId) || replyId === '__unattached__') {
      this.flushOne(entry);
      return;
    }

    const queue = this.pending.get(replyId) ?? [];
    queue.push(entry);
    this.pending.set(replyId, queue);
  }

  /** reply.done — the turn is over, so everything buffered for it may go. */
  closeTurn(replyId?: string): void {
    const id = replyId ?? this.currentReplyId;
    if (!id) return;

    this.closed.add(id);
    const queue = this.pending.get(id) ?? [];
    this.pending.delete(id);
    for (const entry of queue) this.flushOne(entry);

    if (this.currentReplyId === id) this.currentReplyId = null;
  }

  /** Outstanding dispatches, for the "is a tool still running" indicator. */
  get inFlight(): number {
    return this.callTurn.size;
  }

  /** Buffered-but-unsent count. Should be 0 whenever no turn is open. */
  get buffered(): number {
    let total = 0;
    for (const queue of this.pending.values()) total += queue.length;
    return total;
  }

  private flushOne(entry: PendingResult): void {
    this.send({ type: 'tool.result', call_id: entry.call_id, result: entry.result });
  }
}

/** The result sent when the POST itself failed — never silence. */
export const TRANSPORT_ERROR = {
  success: false,
  error: 'TRANSPORT_ERROR',
  message: "I couldn't reach the record system, so that wasn't saved.",
} as const;
