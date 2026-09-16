/**
 * AssemblyAI Voice Agent protocol types.
 *
 * Transcribed from specs/001-lablog-voice-notebook/contracts/aai-websocket.md,
 * which was verified against live documentation. Do NOT code against §7 of
 * LabLog_Implementation_Plan.md — it is a reconstruction and is wrong in
 * thirteen places, four of which fail silently.
 *
 * The three that bite hardest:
 *   1. tool.call carries `call_id` (not `id`) and `arguments` as an OBJECT.
 *   2. tool.result must carry `result` as a JSON STRING. The asymmetry is real.
 *   3. There is no interruption event — barge-in is reply.done + "interrupted".
 */

// ---------------------------------------------------------------------------
// Client -> server
// ---------------------------------------------------------------------------

export interface SessionUpdate {
  type: 'session.update';
  /** Authored by the backend and passed through verbatim. Treat as opaque. */
  session: Record<string, unknown>;
}

export interface InputAudio {
  type: 'input.audio';
  /** base64-encoded PCM16 LE, 24 kHz mono. */
  audio: string;
}

export interface ToolResult {
  type: 'tool.result';
  call_id: string;
  /** JSON-stringified. Not an object — see note above. */
  result: string;
}

export interface SessionResume {
  type: 'session.resume';
  session_id: string;
}

export interface SessionEnd {
  type: 'session.end';
}

export type ClientMessage = SessionUpdate | InputAudio | ToolResult | SessionResume | SessionEnd;

// ---------------------------------------------------------------------------
// Server -> client
// ---------------------------------------------------------------------------

export interface SessionReady {
  type: 'session.ready';
  /** Store this: needed for session.resume and sent with every POST /tools. */
  session_id: string;
}

export interface SessionUpdated {
  type: 'session.updated';
}

export interface SpeechStarted {
  type: 'input.speech.started';
}

export interface SpeechStopped {
  type: 'input.speech.stopped';
}

export interface TranscriptUserDelta {
  type: 'transcript.user.delta';
  text: string;
}

export interface TranscriptUser {
  type: 'transcript.user';
  text: string;
  item_id: string;
}

export interface ReplyStarted {
  type: 'reply.started';
  reply_id: string;
}

export interface ReplyAudio {
  type: 'reply.audio';
  /** base64 PCM16. Note the field is `data` here — input uses `audio`. */
  data: string;
}

export interface TranscriptAgent {
  type: 'transcript.agent';
  text: string;
  reply_id: string;
  item_id: string;
  interrupted?: boolean;
}

export interface ReplyDone {
  type: 'reply.done';
  reply_id?: string;
  /** "interrupted" IS the barge-in signal. There is no separate event. */
  status: 'completed' | 'interrupted';
}

export interface ToolCall {
  type: 'tool.call';
  call_id: string;
  name: string;
  /** Already parsed. Calling JSON.parse on this throws. */
  arguments: Record<string, unknown>;
}

export interface SessionError {
  type: 'session.error' | 'error';
  code: string;
  message: string;
  param?: string;
}

export interface SessionEnded {
  type: 'session.ended';
  session_duration_seconds?: number;
  audio_duration_seconds?: number;
}

export type ServerMessage =
  | SessionReady
  | SessionUpdated
  | SpeechStarted
  | SpeechStopped
  | TranscriptUserDelta
  | TranscriptUser
  | ReplyStarted
  | ReplyAudio
  | TranscriptAgent
  | ReplyDone
  | ToolCall
  | SessionError
  | SessionEnded;

// ---------------------------------------------------------------------------
// Application-side types
// ---------------------------------------------------------------------------

export type VoiceStatusValue =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'reconnecting'
  | 'error';

export interface TranscriptTurn {
  id: string;
  role: 'user' | 'agent';
  text: string;
  at: number;
  /** True while the agent is still producing this turn. */
  partial?: boolean;
}

export interface BootstrapResponse {
  token: string;
  ws_url: string;
  experiment: {
    id: string;
    code: string;
    name: string;
    status: string;
    current_step_index: number;
  };
  session_config: Record<string, unknown>;
}

/** The shape POST /tools returns — see contracts/tools-api.md. */
export type ToolOutcome =
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: string; message: string; detail?: Record<string, unknown> };
