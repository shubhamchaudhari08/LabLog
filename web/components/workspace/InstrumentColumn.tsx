'use client';

/**
 * The instrument: a floor-to-ceiling dark column holding everything to do with
 * speaking.
 *
 * This is the structural half of the redesign. Previously the voice panel was a
 * dark card dropped into a cream grid, which reads as an accident. Making it a
 * full-height column instead means the page is divided by *function* — the left
 * is the thing you talk to, the right is the record it produces — and the dark
 * surface becomes architecture rather than decoration.
 *
 * It never scrolls with the record, because it is an input device. A microphone
 * that slides off-screen mid-sentence is a broken microphone.
 */

import Link from 'next/link';
import { TranscriptPanel } from '@/components/voice/TranscriptPanel';
import type { TranscriptTurn, VoiceStatusValue } from '@/lib/voiceClient/types';
import type { ProtocolStep } from '@/lib/queries/useExperiment';

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

const STATUS_TONE: Record<VoiceStatusValue, string> = {
  idle: 'bg-on-dark-soft',
  connecting: 'bg-accent-amber',
  ready: 'bg-accent-teal',
  listening: 'bg-accent-teal',
  thinking: 'bg-accent-amber',
  speaking: 'bg-primary',
  reconnecting: 'bg-accent-amber',
  error: 'bg-error',
};

const ACTIVE = new Set<VoiceStatusValue>(['listening', 'thinking', 'speaking', 'connecting']);

/**
 * Listening indicator. Three bars rather than a spinner: a spinner says "wait",
 * and the machine is not making the user wait — it is hearing them.
 */
function Meter({ status }: { status: VoiceStatusValue }) {
  const live = ACTIVE.has(status);
  return (
    <div className="flex h-8 items-end gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-pill transition-all duration-300 ${
            live ? STATUS_TONE[status] : 'bg-white/15'
          }`}
          style={{
            height: live ? `${[40, 75, 100, 65, 45][i]}%` : '18%',
            animation: live ? `pulse-soft ${1.1 + i * 0.13}s ease-in-out infinite` : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function InstrumentColumn({
  experimentCode,
  status,
  turns,
  partial,
  sessionId,
  error,
  busy,
  muted,
  steps,
  currentIndex,
  onConnect,
  onDisconnect,
  onToggleMute,
}: {
  experimentCode: string;
  status: VoiceStatusValue;
  turns: TranscriptTurn[];
  partial: string;
  sessionId: string | null;
  error: string | null;
  busy: boolean;
  muted: boolean;
  steps: ProtocolStep[];
  currentIndex: number;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleMute: () => void;
}) {
  const live = status !== 'idle' && status !== 'error';
  const degraded = status === 'reconnecting';

  return (
    <aside className="instrument">
      {/* brand + experiment */}
      <div className="flex items-center gap-xs px-lg pt-lg">
        <Link href="/dashboard" className="flex items-center gap-xs" aria-label="LabLog home">
          <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
            <path
              d="M13 7h6v10.5a5 5 0 1 1-6 0V7Z"
              fill="none"
              stroke="#cc785c"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            <path d="M13 15.5h6" stroke="#cc785c" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <span className="text-title-sm text-on-dark">LabLog</span>
        </Link>
        <span className="ml-auto font-mono text-caption text-on-dark-soft">{experimentCode}</span>
      </div>

      {/* status — the largest thing in the column, legible across a bench */}
      <div className="flex items-center gap-md px-lg pt-xl">
        <Meter status={status} />
        <div>
          <p className="font-display text-[30px] leading-none text-on-dark" aria-live="polite">
            {STATUS_COPY[status]}
          </p>
          {sessionId && (
            <p className="mt-xxs font-mono text-[11px] text-on-dark-soft">
              session {sessionId.slice(0, 8)}
            </p>
          )}
        </div>
      </div>

      {degraded && (
        <p className="mx-lg mt-md rounded-sm border border-accent-amber/25 bg-accent-amber/10 px-sm py-xs text-caption text-accent-amber">
          Connection lost. Nothing is being recorded until this reconnects.
        </p>
      )}
      {error && (
        <p className="mx-lg mt-md rounded-sm border border-error/25 bg-error/10 px-sm py-xs text-caption text-error">
          {error}
        </p>
      )}

      {/* transcript takes the slack so the controls stay pinned to the floor */}
      <div className="mt-lg min-h-0 flex-1 border-t border-white/[0.06]">
        <TranscriptPanel turns={turns} partial={partial} />
      </div>

      {/* protocol rail — where you are, without leaving the instrument */}
      <div className="border-t border-white/[0.06] px-lg py-md">
        <p className="text-caption-upper uppercase text-on-dark-soft/70">
          Step {Math.min(currentIndex + 1, steps.length)} of {steps.length}
        </p>
        <div className="mt-xs flex gap-[3px]" role="img" aria-label={`Step ${currentIndex + 1} of ${steps.length}`}>
          {steps.map((step) => (
            <span
              key={step.id}
              className={`h-1 flex-1 rounded-pill ${
                step.index < currentIndex
                  ? 'bg-accent-teal/70'
                  : step.index === currentIndex
                    ? 'bg-primary'
                    : 'bg-white/12'
              }`}
            />
          ))}
        </div>
        <p className="mt-xs text-body-sm text-on-dark">
          {steps[currentIndex]?.name ?? 'Not started'}
        </p>
      </div>

      {/* controls */}
      <div className="flex items-center gap-xs border-t border-white/[0.06] bg-black/20 px-lg py-md">
        {!live ? (
          <button type="button" className="btn-primary w-full justify-center" onClick={onConnect}>
            Start session
          </button>
        ) : (
          <>
            <button type="button" className="btn-dark" onClick={onToggleMute} disabled={degraded}>
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button type="button" className="btn-quiet" onClick={onDisconnect}>
              End
            </button>
            {busy && (
              <span className="ml-auto flex items-center gap-xs text-caption text-on-dark-soft">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 animate-pulse-soft rounded-pill bg-primary"
                />
                saving
              </span>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
