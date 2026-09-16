'use client';

/**
 * The voice session panel.
 *
 * DESIGN.md reserves the dark navy surface for product chrome — code editors,
 * terminal panels, the places the product shows itself working. The live
 * transcript is this application's equivalent, and the cream-to-dark contrast
 * makes the conversation read as the instrument rather than as decoration.
 */

import { useEffect, useRef } from 'react';
import type { TranscriptTurn, VoiceStatusValue } from '@/lib/voiceClient/types';

const STATUS_COPY: Record<VoiceStatusValue, string> = {
  idle: 'Not connected',
  connecting: 'Connecting',
  ready: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  reconnecting: 'Reconnecting',
  error: 'Error',
};

const STATUS_DOT: Record<VoiceStatusValue, string> = {
  idle: 'bg-on-dark-soft',
  connecting: 'bg-accent-amber animate-pulse-soft',
  ready: 'bg-accent-teal',
  listening: 'bg-accent-teal animate-pulse-soft',
  thinking: 'bg-accent-amber animate-pulse-soft',
  speaking: 'bg-primary animate-pulse-soft',
  reconnecting: 'bg-accent-amber animate-pulse-soft',
  error: 'bg-error',
};

export function VoiceStatus({ status, sessionId }: { status: VoiceStatusValue; sessionId: string | null }) {
  return (
    <div className="flex items-center justify-between px-lg py-md">
      <div className="flex items-center gap-xs">
        <span aria-hidden className={`h-2 w-2 rounded-pill ${STATUS_DOT[status]}`} />
        <span className="text-title-sm text-on-dark">{STATUS_COPY[status]}</span>
      </div>
      {sessionId && (
        <span className="font-mono text-[11px] text-on-dark-soft" title="Voice session id">
          {sessionId.slice(0, 8)}
        </span>
      )}
    </div>
  );
}

export function TranscriptPanel({
  turns,
  partial,
}: {
  turns: TranscriptTurn[];
  partial: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, partial]);

  return (
    <div className="max-h-[260px] min-h-[160px] space-y-sm overflow-y-auto px-lg pb-md">
      {turns.length === 0 && !partial && (
        <p className="text-body-sm text-on-dark-soft">
          Start the session and speak. Try “A17 is 4.2 Celsius.”
        </p>
      )}

      {turns.map((turn) => (
        <p
          key={turn.id}
          className={
            turn.role === 'user'
              ? 'text-body-sm text-on-dark'
              : 'text-body-sm text-accent-teal'
          }
        >
          <span className="mr-xs text-caption-upper uppercase text-on-dark-soft">
            {turn.role === 'user' ? 'you' : 'lablog'}
          </span>
          {turn.text}
        </p>
      ))}

      {/* Provisional text sits visibly below the committed turns, so the user
          can see recognition happening without mistaking it for a record. */}
      {partial && <p className="text-body-sm italic text-on-dark-soft">{partial}</p>}

      <div ref={endRef} />
    </div>
  );
}

export function VoiceAgent({
  status,
  turns,
  partial,
  sessionId,
  error,
  busy,
  muted,
  onConnect,
  onDisconnect,
  onToggleMute,
}: {
  status: VoiceStatusValue;
  turns: TranscriptTurn[];
  partial: string;
  sessionId: string | null;
  error: string | null;
  busy: boolean;
  muted: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleMute: () => void;
}) {
  const live = status !== 'idle' && status !== 'error';
  const degraded = status === 'reconnecting';

  return (
    <section className="panel-dark flex flex-col overflow-hidden">
      <VoiceStatus status={status} sessionId={sessionId} />

      {degraded && (
        <p className="mx-lg mb-sm rounded-md bg-accent-amber/15 px-sm py-xs text-caption text-accent-amber">
          Connection lost. Recording is paused — nothing is being saved until this reconnects.
        </p>
      )}

      {error && (
        <p className="mx-lg mb-sm rounded-md bg-error/15 px-sm py-xs text-caption text-error">
          {error}
        </p>
      )}

      <TranscriptPanel turns={turns} partial={partial} />

      <footer className="mt-auto flex items-center gap-xs border-t border-white/5 px-lg py-md">
        {!live ? (
          <button type="button" className="btn-primary" onClick={onConnect}>
            Start session
          </button>
        ) : (
          <>
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-md bg-surface-dark-elevated px-lg text-[14px] font-medium text-on-dark transition-colors hover:bg-white/10"
              onClick={onToggleMute}
              // Destructive and record-producing controls are disabled while a
              // tool round trip is outstanding or the socket is degraded.
              disabled={degraded}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-md px-lg text-[14px] font-medium text-on-dark-soft transition-colors hover:text-on-dark"
              onClick={onDisconnect}
            >
              End session
            </button>
          </>
        )}

        {busy && <span className="ml-auto text-caption text-on-dark-soft">saving…</span>}
      </footer>
    </section>
  );
}
