/**
 * Agent audio playback, with barge-in flush.
 *
 * Buffers are scheduled on a running cursor so consecutive chunks play without
 * a seam. The part that gets forgotten is resetting that cursor on
 * interruption: without it the cursor still points into the future, and the
 * discarded tail plays seconds later over the next turn — audio "stops", then
 * mysteriously resumes. See contracts/aai-websocket.md §7.
 */

const SAMPLE_RATE = 24_000;
/** Small lead so network jitter does not produce gaps. */
const SCHEDULE_LEAD_SECONDS = 0.05;

function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export class AgentAudioPlayer {
  private context: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private cursor = 0;

  /** Called when the queue drains, so the UI can leave the "speaking" state. */
  onDrained?: () => void;

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: SAMPLE_RATE });
      this.cursor = this.context.currentTime;
    }
    return this.context;
  }

  async resume(): Promise<void> {
    const context = this.ensureContext();
    if (context.state === 'suspended') await context.resume();
  }

  /** Schedule one `reply.audio` chunk. */
  enqueue(base64Pcm: string): void {
    const context = this.ensureContext();
    const samples = base64ToInt16(base64Pcm);
    if (samples.length === 0) return;

    const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) channel[i] = samples[i] / 32768;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const startAt = Math.max(this.cursor, context.currentTime + SCHEDULE_LEAD_SECONDS);
    source.start(startAt);
    this.cursor = startAt + buffer.duration;

    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0) this.onDrained?.();
    };
  }

  /**
   * Barge-in: stop everything and discard what was queued.
   *
   * Resetting the cursor is the whole point — see the note at the top.
   */
  flush(): void {
    for (const source of this.sources) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        // Already stopped; harmless.
      }
    }
    this.sources.clear();
    if (this.context) this.cursor = this.context.currentTime;
  }

  get isPlaying(): boolean {
    return this.sources.size > 0;
  }

  async close(): Promise<void> {
    this.flush();
    await this.context?.close();
    this.context = null;
  }
}
