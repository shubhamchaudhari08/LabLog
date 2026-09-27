'use client';

/**
 * The voice console, docked to the bottom of the workspace.
 *
 * Bottom-centre is where call controls live on every device people already
 * use, so it is found without looking. It also keeps the microphone clear of
 * the two things a scientist reads while speaking: the sample board above it
 * and the protocol rail beside it. It is sticky, not fixed, so it never covers
 * the protocol rail — a microphone that slides off-screen mid-sentence is a
 * broken microphone.
 *
 * Collapsed, it shows one line: the words being heard right now. The full
 * transcript opens upward from the same surface.
 */

import { useState } from 'react';
import Link from 'next/link';
import { TranscriptPanel } from './TranscriptPanel';
import { STATUS_COPY, STATUS_DOT, useVoiceSession } from './VoiceSession';
import { IconMic, IconMicOff, IconStop, IconTranscript } from '@/components/icons';
import type { VoiceStatusValue } from '@/lib/voiceClient/types';

const HEARING = new Set<VoiceStatusValue>(['listening', 'thinking', 'speaking']);

/** Five bars rather than a spinner: a spinner says "wait", this says "hearing you". */
function Meter({ status, muted }: { status: VoiceStatusValue; muted: boolean }) {
  const on = HEARING.has(status) && !muted;
  return (
    <span className="flex h-6 items-center gap-[3px]" aria-hidden>
      {[0.55, 0.85, 1, 0.75, 0.5].map((height, i) => (
        <span
          key={i}
          className={`w-[3px] origin-center rounded-pill transition-colors duration-300 ${
            on ? STATUS_DOT[status] : 'bg-white/15'
          } ${on ? 'animate-bar' : ''}`}
          style={{
            height: `${height * 100}%`,
            transform: on ? undefined : 'scaleY(0.3)',
            animationDelay: `${i * 110}ms`,
            animationDuration: status === 'speaking' ? '0.7s' : '1.1s',
          }}
        />
      ))}
    </span>
  );
}

export function VoiceDock({
  experimentId,
  experimentCode,
  closed = false,
}: {
  experimentId: string;
  experimentCode: string;
  /** COMPLETED or CANCELLED: no session may start here (the API refuses it too). */
  closed?: boolean;
}) {
  const voice = useVoiceSession();
  const [open, setOpen] = useState(false);

  if (closed) {
    return (
      <div className="sticky bottom-md z-dock mt-xl">
        <div className="panel-dark flex flex-wrap items-center gap-md rounded-xl px-lg py-md">
          <IconMicOff className="h-5 w-5 text-on-dark-soft" />
          <p className="flex-1 text-body-sm text-on-dark">
            <span className="font-mono text-primary">{experimentCode}</span> is finished, so voice has nothing to
            record into. Its record stays readable here.
          </p>
          {voice.live && voice.bound?.id === experimentId ? (
            // Normally the session ends itself after complete_experiment; this covers
            // a run closed some other way (another tab) while the microphone was live.
            <button type="button" onClick={voice.disconnect} className="btn-dark h-9" aria-label="End voice session">
              <IconStop className="h-4 w-4 text-primary" />
              End session
            </button>
          ) : (
            <Link href="/experiments/new" className="btn-dark h-9">
              New experiment
            </Link>
          )}
        </div>
      </div>
    );
  }

  // A desk session (no experiment) is live: offer to move it onto this experiment.
  if (voice.live && !voice.bound) {
    return (
      <div className="sticky bottom-md z-dock mt-xl">
        <div className="panel-dark flex flex-wrap items-center gap-md rounded-xl px-lg py-md">
          <span className={`h-2 w-2 animate-pulse-soft rounded-pill ${STATUS_DOT[voice.status]}`} />
          <p className="flex-1 text-body-sm text-on-dark">
            {voice.switching
              ? `Switching voice to ${voice.switching.code || 'the new experiment'}…`
              : 'Voice is open with no experiment. Use it here to record into this run.'}
          </p>
          {!voice.switching && (
            <button
              type="button"
              className="btn-primary h-9"
              onClick={() => voice.switchTo({ id: experimentId, code: experimentCode })}
            >
              <IconMic className="h-4 w-4" />
              Use voice on {experimentCode}
            </button>
          )}
        </div>
      </div>
    );
  }

  const elsewhere = voice.live && voice.bound && voice.bound.id !== experimentId;
  const live = voice.live && !elsewhere;
  const degraded = voice.status === 'reconnecting';
  const lastTurn = voice.turns[voice.turns.length - 1];

  const caption = voice.partial
    ? voice.partial
    : lastTurn
      ? lastTurn.text
      : live
        ? 'Speak a reading, a note, or ask what is next.'
        : 'Start a session and speak your readings. They land in the record as you say them.';

  if (elsewhere) {
    return (
      <div className="sticky bottom-md z-dock mt-xl">
        <div className="panel-dark flex flex-wrap items-center gap-md rounded-xl px-lg py-md">
          <span className={`h-2 w-2 animate-pulse-soft rounded-pill ${STATUS_DOT[voice.status]}`} />
          <p className="flex-1 text-body-sm text-on-dark">
            The microphone is live on{' '}
            <span className="font-mono text-primary">{voice.bound?.code}</span>. End that session to record here.
          </p>
          <Link href={`/dashboard/experiments/${voice.bound?.id}`} className="btn-dark h-9">
            Go to {voice.bound?.code}
          </Link>
          <button type="button" className="btn-quiet h-9" onClick={voice.disconnect}>
            End session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky bottom-md z-dock mt-xl">
      <section
        aria-label="Voice session"
        className="panel-dark overflow-hidden rounded-xl"
      >
        {/* transcript sheet: opens upward from the same surface */}
        <div
          className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-lg pb-xs pt-md">
              <p className="text-[11px] font-medium tracking-[1.2px] text-on-dark-soft/70">
                Transcript · {experimentCode}
              </p>
              {voice.sessionId && (
                <p className="font-mono text-[11px] text-on-dark-soft/60">
                  session {voice.sessionId.slice(0, 8)}
                </p>
              )}
            </div>
            <TranscriptPanel turns={voice.turns} partial={voice.partial} />
          </div>
        </div>

        {(degraded || voice.error) && (
          <p
            className={`border-t px-lg py-xs text-caption ${
              degraded
                ? 'border-accent-amber/20 bg-accent-amber/10 text-accent-amber'
                : 'border-error/20 bg-error/10 text-[#e98b8b]'
            }`}
            role="status"
          >
            {degraded ? 'Connection lost. Nothing is being recorded until this reconnects.' : voice.error}
          </p>
        )}

        <div className="flex items-center gap-md border-t border-white/[0.06] px-md py-sm sm:px-lg">
          {/* the mic: start when idle, mute when live */}
          <div className="relative shrink-0">
            {live && HEARING.has(voice.status) && !voice.muted && (
              <>
                <span aria-hidden className="absolute inset-0 animate-breathe rounded-pill bg-primary" />
                <span
                  aria-hidden
                  className="absolute inset-0 animate-breathe rounded-pill bg-primary [animation-delay:1.2s]"
                />
              </>
            )}
            <button
              type="button"
              onClick={live ? voice.toggleMute : () => void voice.connect()}
              disabled={degraded || voice.status === 'connecting' || !voice.bound}
              aria-label={live ? (voice.muted ? 'Unmute microphone' : 'Mute microphone') : 'Start voice session'}
              className={`relative grid h-14 w-14 place-items-center rounded-pill transition-all duration-300 active:scale-95 disabled:opacity-60 ${
                !live
                  ? 'bg-primary text-on-primary shadow-[0_8px_24px_-8px_rgba(204,120,92,0.8)] hover:bg-primary-active'
                  : voice.muted
                    ? 'bg-white/10 text-accent-amber ring-1 ring-inset ring-accent-amber/40'
                    : 'bg-primary text-on-primary'
              }`}
            >
              {live && voice.muted ? <IconMicOff className="h-6 w-6" /> : <IconMic className="h-6 w-6" />}
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-sm">
              <p className="font-display text-[24px] leading-none text-on-dark" aria-live="polite">
                {live ? (voice.muted ? 'Muted' : STATUS_COPY[voice.status]) : 'Voice'}
              </p>
              {live && <Meter status={voice.status} muted={voice.muted} />}
              {voice.busy && (
                <span className="flex items-center gap-xxs text-[12px] text-on-dark-soft">
                  <span aria-hidden className="h-1.5 w-1.5 animate-pulse-soft rounded-pill bg-primary" />
                  saving
                </span>
              )}
            </div>
            <p
              key={voice.partial ? 'partial' : lastTurn?.id ?? 'hint'}
              className={`mt-[6px] truncate text-[14px] ${
                voice.partial
                  ? 'italic text-on-dark-soft'
                  : lastTurn?.role === 'agent'
                    ? 'animate-fade-in text-accent-teal'
                    : lastTurn
                      ? 'animate-fade-in text-on-dark'
                      : 'text-on-dark-soft'
              }`}
            >
              {lastTurn && !voice.partial && (
                <span className="mr-xs text-[11px] not-italic tracking-[1px] text-on-dark-soft/60">
                  {lastTurn.role === 'user' ? 'YOU' : 'LABLOG'}
                </span>
              )}
              {caption}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-xxs">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className={`icon-btn-dark relative h-10 w-10 ${open ? 'bg-white/[0.08] text-on-dark' : ''}`}
              aria-label={open ? 'Hide transcript' : 'Show transcript'}
              title="Transcript"
            >
              <IconTranscript className="h-5 w-5" />
              {voice.turns.length > 0 && (
                <span className="tabular absolute -right-[2px] -top-[2px] grid h-4 min-w-4 place-items-center rounded-pill bg-primary px-[4px] text-[10px] font-semibold text-on-primary">
                  {voice.turns.length}
                </span>
              )}
            </button>
            {live && (
              <button
                type="button"
                onClick={voice.disconnect}
                className="btn-dark h-10 px-md"
                aria-label="End voice session"
              >
                <IconStop className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline">End</span>
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
