'use client';

/**
 * The voice session: socket lifecycle, audio, transcript, tool routing.
 *
 * The browser is a transport. It receives a token that expires in minutes and a
 * session configuration it did not author, and passes the latter through
 * verbatim (contracts/voice-bootstrap.md). It does not inspect or reshape it.
 *
 * The turn state machine lives in lib/voiceClient/turnBuffer.ts, on its own,
 * with its own tests — it is the piece most likely to be wrong.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { callTool, fetchBootstrap } from '@/lib/api';
import { TRANSPORT_ERROR, TurnBuffer } from '@/lib/voiceClient/turnBuffer';
import type {
  ServerMessage,
  ToolOutcome,
  TranscriptTurn,
  VoiceStatusValue,
} from '@/lib/voiceClient/types';
import { AgentAudioPlayer } from './audio/player';
import { startMicCapture, type MicCapture } from './audio/micWorklet';

export interface UseVoiceAgentOptions {
  /** Empty: a desk session with no experiment open (specs/003). */
  experimentId: string;
  /**
   * Called when the agent asks for a tool, before POST /tools. The session uses
   * it to remember what the user had just said (specs/005 data-model §8).
   */
  onToolDispatch?: (callId: string, tool: string) => void;
  /** Called on a successful tool result, for the optimistic cache patch. */
  onToolSuccess?: (tool: string, data: Record<string, unknown>, callId: string) => void;
  /** Called when starting a session failed, so microphone problems update the mic state. */
  onStartError?: (cause: unknown) => void;
}

export interface VoiceAgentState {
  status: VoiceStatusValue;
  turns: TranscriptTurn[];
  partial: string;
  sessionId: string | null;
  error: string | null;
  /** True while a tool round trip is outstanding — destructive UI is disabled. */
  busy: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  muted: boolean;
  toggleMute: () => void;
  /** Between input.speech.started and the user's committed transcript (specs/004). */
  userSpeaking: boolean;
  /**
   * Ask the agent to speak now, with server-authored instructions (specs/004
   * contracts/voice-announcement.md). Returns false when nothing was sent.
   */
  sendReplyCreate: (instructions: string) => boolean;
  /**
   * Drop microphone frames between two device-clock instants, so a timer alarm
   * is never heard as speech (specs/004 FR-315). A time window rather than a
   * toggle: frames arrive on the audio thread, which background tabs do not
   * throttle, while a setTimeout to un-mute would be.
   */
  muteMicBetween: (fromMs: number, toMs: number) => void;
  /** When the last session.error/error arrived, for the announcement's failure check. */
  lastErrorAt: number | null;
  /** Device time of the first session.ready of this session; null when idle (specs/005). */
  sessionStartedAt: number | null;
  /** The text of the user's last committed turn, read at call time (specs/005). */
  lastUserUtterance: () => string | null;
}

let turnSeq = 0;
const nextTurnId = () => `turn-${++turnSeq}`;

/** Microphone failures in words the user can act on (specs/005 DESIGN.md D-16). */
function micErrorMessage(cause: unknown): string | null {
  const name = cause instanceof Error || cause instanceof DOMException ? cause.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone blocked — allow it in the address bar, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone found.';
  return null;
}

export function useVoiceAgent({
  experimentId,
  onToolDispatch,
  onToolSuccess,
  onStartError,
}: UseVoiceAgentOptions): VoiceAgentState {
  const [status, setStatus] = useState<VoiceStatusValue>('idle');
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [partial, setPartial] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [lastErrorAt, setLastErrorAt] = useState<number | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const lastUserTextRef = useRef<string | null>(null);
  const alarmWindowsRef = useRef<Array<[number, number]>>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<AgentAudioPlayer | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const bufferRef = useRef<TurnBuffer | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const deliberateCloseRef = useRef(false);
  /** Audio may only flow after session.ready (contracts/aai-websocket.md §3). */
  const readyRef = useRef(false);
  const configRef = useRef<Record<string, unknown> | null>(null);
  const retriesRef = useRef(0);
  const connectRef = useRef<() => Promise<void>>(async () => {});

  const send = useCallback((message: unknown) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const appendTurn = useCallback((role: 'user' | 'agent', text: string) => {
    if (!text.trim()) return;
    if (role === 'user') lastUserTextRef.current = text;
    setTurns((prev) => [...prev, { id: nextTurnId(), role, text, at: Date.now() }]);
  }, []);

  // -------------------------------------------------------------------------
  // tool.call -> POST /tools -> tool.result
  // -------------------------------------------------------------------------
  const dispatchTool = useCallback(
    async (callId: string, name: string, args: Record<string, unknown>) => {
      const buffer = bufferRef.current;
      buffer?.registerCall(callId);
      setBusy(true);
      onToolDispatch?.(callId, name);

      let outcome: ToolOutcome;
      try {
        // `args` arrives already parsed. Calling JSON.parse on it throws —
        // the source brief says to, which is why this comment exists.
        outcome = await callTool({
          tool: name,
          args,
          experiment_id: experimentId || null,
          session_id: sessionIdRef.current,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
          utterance: lastUserTextRef.current,
        });
      } catch {
        // Never silence. An unanswered tool.call leaves the agent waiting until
        // timeout_seconds with a live microphone.
        outcome = TRANSPORT_ERROR as unknown as ToolOutcome;
      }

      if (outcome.success && onToolSuccess) onToolSuccess(name, outcome.data, callId);

      buffer?.completeCall(callId, outcome);
      setBusy((buffer?.inFlight ?? 0) > 0);
    },
    [experimentId, onToolDispatch, onToolSuccess],
  );

  // -------------------------------------------------------------------------
  // inbound events
  // -------------------------------------------------------------------------
  const handleMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'session.ready':
          readyRef.current = true;
          retriesRef.current = 0;
          sessionIdRef.current = message.session_id;
          setSessionId(message.session_id);
          // A resumed session keeps its start time; only a new one sets it.
          setSessionStartedAt((current) => current ?? Date.now());
          setStatus('listening');
          break;

        case 'input.speech.started':
          // Softer barge-in hint. The authoritative signal is reply.done.
          if (playerRef.current?.isPlaying) playerRef.current.flush();
          setUserSpeaking(true);
          setStatus('listening');
          break;

        case 'input.speech.stopped':
          setStatus('thinking');
          break;

        case 'transcript.user.delta':
          setPartial(message.text);
          break;

        case 'transcript.user':
          setUserSpeaking(false);
          setPartial('');
          appendTurn('user', message.text);
          break;

        case 'reply.started':
          setUserSpeaking(false);
          bufferRef.current?.openTurn(message.reply_id);
          setStatus('speaking');
          break;

        case 'reply.audio':
          playerRef.current?.enqueue(message.data);
          break;

        case 'transcript.agent':
          appendTurn('agent', message.text);
          break;

        case 'reply.done':
          // THIS is barge-in. There is no interruption event — a handler
          // written against the source brief's imagined event never fires.
          if (message.status === 'interrupted') playerRef.current?.flush();
          bufferRef.current?.closeTurn(message.reply_id);
          setStatus('listening');
          break;

        case 'tool.call':
          // `call_id`, not `id`.
          void dispatchTool(message.call_id, message.name, message.arguments);
          break;

        case 'session.error':
        case 'error':
          setLastErrorAt(Date.now());
          if (
            (message.code === 'session_not_found' || message.code === 'session_expired') &&
            configRef.current
          ) {
            // Resume failed: start a fresh session and say so, rather than
            // pretend the conversation survived.
            sessionIdRef.current = null;
            setSessionStartedAt(null);
            send({ type: 'session.update', session: configRef.current });
            setError('The previous conversation could not be resumed; started a new one.');
            break;
          }
          setError(`${message.code}: ${message.message}`);
          setStatus('error');
          break;

        case 'session.ended':
          setStatus('idle');
          break;

        default:
          break;
      }
    },
    [appendTurn, dispatchTool, send],
  );

  // -------------------------------------------------------------------------
  // connect
  // -------------------------------------------------------------------------
  const connect = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    deliberateCloseRef.current = false;

    try {
      const bootstrap = await fetchBootstrap(experimentId || undefined);
      configRef.current = bootstrap.session_config;

      void playerRef.current?.close();
      const player = new AgentAudioPlayer();
      await player.resume();
      playerRef.current = player;

      const socket = new WebSocket(`${bootstrap.ws_url}?token=${bootstrap.token}`);
      socketRef.current = socket;
      bufferRef.current = new TurnBuffer((m) => send(m));

      socket.onopen = () => {
        const resumeId = sessionIdRef.current;
        // Reconnect keeps the conversation; a fresh start sends the config,
        // which is opaque — passed through exactly as the backend authored it.
        socket.send(
          JSON.stringify(
            resumeId
              ? { type: 'session.resume', session_id: resumeId }
              : { type: 'session.update', session: bootstrap.session_config },
          ),
        );
      };

      socket.onmessage = (event) => {
        if (socketRef.current !== socket) return; // a replaced session still draining
        try {
          handleMessage(JSON.parse(event.data) as ServerMessage);
        } catch {
          // A frame we cannot parse is a contract divergence. Surface it rather
          // than swallowing it — see the contract change protocol.
          setError('Received an unrecognised message from the voice service.');
        }
      };

      socket.onerror = () => {
        if (socketRef.current !== socket) return;
        setError('Voice connection error.');
        setStatus('error');
      };

      socket.onclose = () => {
        // A session replaced by a switch (desk → experiment) closes late; ignore it,
        // or its close would look like a dropped connection and trigger a reconnect.
        if (socketRef.current !== socket) return;
        readyRef.current = false;
        setUserSpeaking(false);
        void micRef.current?.stop();
        micRef.current = null;
        playerRef.current?.flush();
        if (deliberateCloseRef.current) {
          setStatus('idle');
          return;
        }
        if (retriesRef.current >= 3) {
          setError('Connection lost. Press Start session to try again.');
          setStatus('error');
          retriesRef.current = 0;
          return;
        }
        // Nothing is recorded while degraded, and nothing claims a save that may
        // not have completed. A fresh token is minted — the old one is spent.
        retriesRef.current += 1;
        setStatus('reconnecting');
        setTimeout(() => void connectRef.current(), 1000 * retriesRef.current);
      };

      micRef.current = await startMicCapture((base64Pcm) => {
        if (!readyRef.current) return;
        const now = Date.now();
        if (alarmWindowsRef.current.some(([from, to]) => now >= from && now < to)) return;
        send({ type: 'input.audio', audio: base64Pcm });
      });

      // session.ready may already have moved us to "listening".
      setStatus((current) => (current === 'connecting' ? 'ready' : current));
    } catch (cause) {
      deliberateCloseRef.current = true;
      socketRef.current?.close();
      setError(micErrorMessage(cause) ?? (cause instanceof Error ? cause.message : 'Could not start the voice session.'));
      setStatus('error');
      onStartError?.(cause);
    }
  }, [experimentId, handleMessage, send, onStartError]);
  connectRef.current = connect;

  const disconnect = useCallback(() => {
    deliberateCloseRef.current = true;
    send({ type: 'session.end' });
    void micRef.current?.stop();
    void playerRef.current?.close();
    socketRef.current?.close();
    micRef.current = null;
    playerRef.current = null;
    socketRef.current = null;
    sessionIdRef.current = null;
    setSessionId(null);
    setSessionStartedAt(null);
    lastUserTextRef.current = null;
    setStatus('idle');
    setPartial('');
  }, [send]);

  const lastUserUtterance = useCallback(() => lastUserTextRef.current, []);

  const toggleMute = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      micRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const sendReplyCreate = useCallback((instructions: string) => {
    const socket = socketRef.current;
    if (!readyRef.current || socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type: 'reply.create', instructions }));
    return true;
  }, []);

  const muteMicBetween = useCallback((fromMs: number, toMs: number) => {
    const now = Date.now();
    alarmWindowsRef.current = [...alarmWindowsRef.current.filter(([, to]) => to > now), [fromMs, toMs]];
  }, []);

  useEffect(() => {
    return () => {
      void micRef.current?.stop();
      void playerRef.current?.close();
      socketRef.current?.close();
    };
  }, []);

  return {
    status,
    turns,
    partial,
    sessionId,
    error,
    busy,
    connect,
    disconnect,
    muted,
    toggleMute,
    userSpeaking,
    sendReplyCreate,
    muteMicBetween,
    lastErrorAt,
    sessionStartedAt,
    lastUserUtterance,
  };
}
