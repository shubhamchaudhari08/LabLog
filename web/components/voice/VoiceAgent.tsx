'use client';

/**
 * The voice session panel.
 *
 * DESIGN.md reserves the dark navy surface for product chrome — code editors,
 * terminal panels, the places the product shows itself working. The live
 * transcript is this application's equivalent.
 *
 * One dark block dropped into a cream page normally reads as an accident. What
 * makes it read as intentional here: it is the tallest element in its column,
 * it carries a lit top edge under the same light as the cream panels, and its
 * own internal surfaces step darker rather than sitting flat.
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

export function VoiceStatus({
  status,
  sessionId,
}: {
  status: VoiceStatusValue;
  sessionId: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-md border-b border-white/[0.07] px-lg py-md">
      <div className="flex items-center gap-xs">
        <span aria-hidden className={`h-2 w-2 rounded-pill ${STATUS_DOT[status]}`} />
        <span className="text-title-sm text-on-dark" role="status" aria-live="polite">
          {STATUS_COPY[status]}
        </span>
      </div>
      {sessionId && (
        <span className="font-mono text-[11px] text-on-dark-soft" title="Voice session id">
          {sessionId.slice(0, 8)}
        </span>
      )}
    </div>
  );
}

export function TranscriptPanel({ turns, partial }: { turns: TranscriptTurn[]; partial: string }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, partial]);

  return (
    <div className="max-h-[300px] min-h-[200px] space-y-md overflow-y-auto px-lg py-md">
      {turns.length === 0 && !partial && (
        <div className="pt-md">
          <p className="text-body-sm text-on-dark-soft">
            The transcript appears here as you speak.
          </p>
          <ul className="mt-md space-y-xs font-mono text-[13px] text-on-dark-soft/80">
            <li>“A17 is 4.2 Celsius”</li>
            <li>“Note A18 looks slightly cloudy”</li>
            <li>“What&rsquo;s next?”</li>
          </ul>
        </div>
      )}

      {turns.map((turn) => (
        <div key={turn.id} className="animate-rise">
          <p className="text-caption-upper uppercase text-on-dark-soft/70">
            {turn.role === 'user' ? 'you' : 'lablog'}
          </p>
          <p
            className={`mt-xxs text-body-sm ${
              turn.role === 'user' ? 'text-on-dark' : 'text-accent-teal'
            }`}
          >
            {turn.text}
          </p>
        </div>
      ))}

      {/* Provisional text sits visibly below the committed turns, so the user
          can see recognition happening without mistaking it for a record. */}
      {partial && (
        <p className="border-l-2 border-white/10 pl-sm text-body-sm italic text-on-dark-soft">
          {partial}
        </p>
      )}

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
    <section className="panel-dark flex flex-col overflow-hidden" aria-label="Voice session">
      <VoiceStatus status={status} sessionId={sessionId} />

      {degraded && (
        <p className="mx-lg mt-md rounded-md border border-accent-amber/25 bg-accent-amber/10 px-sm py-xs text-caption text-accent-amber">
          Connection lost. Nothing is being recorded until this reconnects.
        </p>
      )}

      {error && (
        <p className="mx-lg mt-md rounded-md border border-error/25 bg-error/10 px-sm py-xs text-caption text-error">
          {error}
        </p>
      )}

      <TranscriptPanel turns={turns} partial={partial} />

      <footer className="mt-auto flex items-center gap-xs border-t border-white/[0.07] bg-surface-dark-soft px-lg py-md">
        {!live ? (
          <button type="button" className="btn-primary" onClick={onConnect}>
            Start session
          </button>
        ) : (
          <>
            <button type="button" className="btn-dark" onClick={onToggleMute} disabled={degraded}>
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button type="button" className="btn-quiet" onClick={onDisconnect}>
              End session
            </button>
          </>
        )}

        {busy && (
          <span className="ml-auto flex items-center gap-xs text-caption text-on-dark-soft">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse-soft rounded-pill bg-primary" />
            saving
          </span>
        )}
      </footer>
    </section>
  );
}
