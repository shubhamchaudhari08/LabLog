/**
 * Microphone capture → PCM16 24 kHz mono → base64 → `input.audio`.
 *
 * Two details from contracts/aai-websocket.md §9 that are easy to miss:
 *
 *   - The worklet callback delivers 128 samples (~5.3 ms at 24 kHz). One
 *     WebSocket message per callback is ~190 messages/second. We accumulate to
 *     ~50 ms before sending.
 *   - Float32 → Int16 must be CLAMPED. Unclamped overflow wraps and produces
 *     audible clicks that measurably degrade recognition — and recognition
 *     accuracy on spoken sample codes is this project's headline risk.
 *
 * AudioWorklet, never ScriptProcessorNode: the latter is deprecated and runs on
 * the main thread, where a UI repaint becomes an audio glitch — precisely while
 * the dashboard is animating, which is the moment being filmed.
 */

const SAMPLE_RATE = 24_000;
const FRAME_MS = 50;
const SAMPLES_PER_MESSAGE = (SAMPLE_RATE * FRAME_MS) / 1000; // 1200

/**
 * The worklet runs in its own realtime thread, so it is defined as a source
 * string and loaded from a blob — no separate asset to deploy or 404 on.
 */
const WORKLET_SOURCE = `
class PcmCollector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(${SAMPLES_PER_MESSAGE});
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i += 1) {
      this.buffer[this.offset++] = channel[i];
      if (this.offset === this.buffer.length) {
        const pcm = new Int16Array(this.buffer.length);
        for (let j = 0; j < this.buffer.length; j += 1) {
          // Clamp before rounding. Wrapping here is audible and hurts accuracy.
          const s = Math.max(-1, Math.min(1, this.buffer[j]));
          pcm[j] = Math.round(s * 32767);
        }
        this.port.postMessage(pcm.buffer, [pcm.buffer]);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-collector', PcmCollector);
`;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000; // avoid blowing the argument limit on large buffers
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export interface MicCapture {
  stop: () => Promise<void>;
  /** Stop sending frames without tearing down the graph (mute). */
  setMuted: (muted: boolean) => void;
}

export async function startMicCapture(onFrame: (base64Pcm: string) => void): Promise<MicCapture> {
  // Chromium honours a forced 24 kHz context, which avoids resampling
  // entirely. Firefox and Safari do not and would need worklet resampling —
  // out of scope (research.md R-012). Record the demo in Chromium.
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
  await context.audioWorklet.addModule(blobUrl);
  URL.revokeObjectURL(blobUrl);

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'pcm-collector');

  let muted = false;
  node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    if (!muted) onFrame(arrayBufferToBase64(event.data));
  };

  source.connect(node);
  // The worklet produces no output; connecting to the destination would echo
  // the user's own microphone back at them.

  return {
    setMuted: (value: boolean) => {
      muted = value;
    },
    stop: async () => {
      node.port.onmessage = null;
      node.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      await context.close();
    },
  };
}
