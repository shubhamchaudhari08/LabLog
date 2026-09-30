'use client';

/**
 * The voice dock (DESIGN.md voice-dock, D-7; specs/005 US3): one floating dark
 * panel, centred at the bottom of every light screen while a session is live.
 * It replaces the desk bar and the workspace's in-page dock.
 *
 * It says honestly what the microphone is doing, shows what it heard, and,
 * after a stored result, chips built from the stored values: never from the
 * transcript (Constitution Principle I). Pause mutes; Close ends the session.
 * The whole conversation is one click away in the transcript sheet.
 *
 * Bench mode has its own surface, so the shell never mounts this there.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TranscriptPanel } from './TranscriptPanel';
import { useVoiceSession } from './VoiceSession';
import { IconClose, IconMic, IconMicOff, IconPause, IconTranscript } from '@/components/icons';
import { Caret, Orb, Waveform } from '@/components/ui/voiceVisuals';
import { useExperiment } from '@/lib/queries/useExperiment';
import { useMeasurementTypes } from '@/lib/queries/useMeasurementTypes';
import { dockMode } from '@/lib/ui/dockMode';
import { intentChips } from '@/lib/ui/intentChips';
import { TONE_ON_DARK, voiceStatusView } from '@/lib/ui/voiceStatus';

const SHELL =
  'dark-surface pointer-events-auto w-full max-w-[760px] animate-slide-up rounded-feature border border-[#332d26] bg-dark-panel shadow-dock max-md:rounded-b-none';

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** Bottom-centre of the content area, clear of the sidebar; a bottom sheet on phones. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-dock flex justify-center md:bottom-[28px] md:px-md lg:pl-[calc(var(--sidebar-w)+16px)]">
      {children}
    </div>
  );
}

/** One-line variants: the session belongs somewhere else, or could move here. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <Frame>
      <section aria-label="Voice session" className={`${SHELL} flex flex-wrap items-center gap-md px-[24px] py-md`}>
        {children}
      </section>
    </Frame>
  );
}

export function VoiceDock() {
  const voice = useVoiceSession();
  const pathname = usePathname();
  const types = useMeasurementTypes();
  const [open, setOpen] = useState(false);

  const pageExperimentId = /^\/dashboard\/experiments\/([^/]+)$/.exec(pathname)?.[1] ?? null;
  const pageExperiment = useExperiment(pageExperimentId ?? '');
  const pageCode = (pageExperiment.data?.experiment_code as string | undefined) ?? '';
  const pageStatus = pageExperiment.data?.status as string | undefined;
  const closedHere = pageStatus === 'COMPLETED' || pageStatus === 'CANCELLED';

  const now = useNow(voice.understoodAt != null);
  const stepIndex = voice.bound?.id === pageExperimentId ? (pageExperiment.data?.current_step_index as number | undefined) : undefined;
  const view = voiceStatusView({ ...voice, stepIndex }, voice.understoodAt, now);

  const mode = dockMode({
    live: voice.live,
    error: voice.error,
    bound: voice.bound,
    pageExperimentId,
    closedHere,
    micNotice: voice.micNotice != null,
  });
  if (mode === 'hidden') return null;

  // Voice was asked for, but the microphone cannot be used yet: say what to
  // fix, and let the user try again once they have (specs/005 follow-up).
  if (mode === 'mic-needed') {
    return (
      <Notice>
        <IconMicOff className="h-6 w-6 shrink-0 text-danger-on-dark" />
        <div className="min-w-0 flex-1" role="alert">
          <p className="text-eyebrow uppercase text-danger-on-dark">{voice.mic.title}</p>
          <p className="mt-xxs text-body-md text-on-dark">{voice.micNotice}</p>
        </div>
        <button type="button" className="btn-primary" onClick={voice.startVoice}>
          <IconMic className="h-[18px] w-[18px]" />
          {voice.mic.canRequest ? 'Allow microphone' : 'Try again'}
        </button>
        <button
          type="button"
          className="icon-btn-dark"
          onClick={voice.dismissMicNotice}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <IconClose className="h-5 w-5" />
        </button>
      </Notice>
    );
  }

  if (mode === 'closed-here') {
    return (
      <Notice>
        <p className="flex-1 text-body-md text-on-dark">
          <span className="font-mono text-primary-on-dark">{pageCode}</span> is finished, so voice has nothing to record
          into. Its record stays readable here.
        </p>
        {/* Normally the session ends itself after complete_experiment; this covers
            a run closed some other way (another tab) while the microphone was live. */}
        <button type="button" onClick={voice.disconnect} className="btn-secondary-dark">
          End session
        </button>
      </Notice>
    );
  }

  if (mode === 'offer-switch' && pageExperimentId) {
    return (
      <Notice>
        <p className="flex-1 text-body-md text-on-dark">
          {voice.switching
            ? `Switching voice to ${voice.switching.code || 'the new experiment'}…`
            : 'Voice is open with no experiment. Use it here to record into this run.'}
        </p>
        {!voice.switching && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => voice.switchTo({ id: pageExperimentId, code: pageCode })}
          >
            <IconMic className="h-[18px] w-[18px]" />
            Use voice on {pageCode}
          </button>
        )}
      </Notice>
    );
  }

  if (mode === 'live-elsewhere' && voice.bound) {
    return (
      <Notice>
        <p className="flex-1 text-body-md text-on-dark">
          The microphone is live on <span className="font-mono text-primary-on-dark">{voice.bound.code}</span>. End that
          session to record here.
        </p>
        <Link href={`/dashboard/experiments/${voice.bound.id}`} className="btn-secondary-dark">
          Go to {voice.bound.code}
        </Link>
        <button type="button" className="btn-secondary-dark" onClick={voice.disconnect}>
          End session
        </button>
      </Notice>
    );
  }

  // --- the session itself ----------------------------------------------------
  const understood = view.label === 'UNDERSTOOD' && voice.lastOutcome != null;
  const chips = understood
    ? intentChips(voice.lastOutcome!.tool, voice.lastOutcome!.data, voice.bound, { typeName: types.typeName })
    : [];
  const last = voice.turns[voice.turns.length - 1];

  let line: React.ReactNode;
  if (voice.partial) {
    line = (
      <span className="text-on-dark">
        “{voice.partial}”
        {view.wave && <Caret />}
      </span>
    );
  } else if (voice.hint && !last) {
    line = <span className="text-on-dark-body">{voice.hint}</span>;
  } else if (last) {
    line = (
      <span className={last.role === 'agent' ? 'text-status-running-on-dark' : 'text-on-dark'}>
        <span className="mr-xs text-eyebrow uppercase text-on-dark-muted">{last.role === 'user' ? 'You' : 'LabLog'}</span>
        {last.role === 'user' ? `“${last.text}”` : last.text}
      </span>
    );
  } else {
    line = (
      <span className="text-on-dark-muted">
        {voice.bound ? 'Speak a reading, a note, or ask what is next.' : 'Say “what protocols can I run?” or “start a new run of …”.'}
      </span>
    );
  }

  return (
    <Frame>
      <section aria-label="Voice session" className={SHELL}>
        {/* the conversation, opening upward from the same surface */}
        <div
          className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-dark-line px-[24px] pb-xs pt-md">
              <p className="text-eyebrow uppercase text-on-dark-muted">Transcript · {voice.bound?.code ?? 'no experiment'}</p>
              {voice.sessionId && (
                <p className="font-mono text-[11px] text-on-dark-muted">session {voice.sessionId.slice(0, 8)}</p>
              )}
            </div>
            <TranscriptPanel turns={voice.turns} partial={voice.partial} />
          </div>
        </div>

        {view.tone === 'danger' && (
          <p role="alert" className="mx-[24px] mt-md rounded-lg bg-danger-bg-dark px-[14px] py-xs text-body-md text-danger-on-dark">
            {voice.error}
          </p>
        )}

        <div className="grid min-h-[168px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-md px-[20px] py-[20px] md:gap-lg md:px-[24px]">
          <Orb size="dock" state={view.orb} label="" />

          <div className="min-w-0">
            <div className="flex items-center gap-sm">
              <span aria-live="polite" className={`text-eyebrow uppercase ${TONE_ON_DARK[view.tone]}`}>
                {view.tone === 'danger' ? 'Voice error' : view.label}
              </span>
              <span className="truncate font-mono text-code text-on-dark-muted">{view.context}</span>
              {voice.busy && (
                <span className="inline-flex items-center gap-[6px] text-caption text-on-dark-muted">
                  <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-primary-glow" />
                  saving
                </span>
              )}
              <Waveform running={view.wave} className="ml-auto hidden sm:flex" />
            </div>

            <p aria-live="polite" className="mt-xs truncate text-transcript">
              {line}
            </p>

            {chips.length > 0 && (
              <ul className="mt-sm flex flex-wrap gap-xs" aria-label="Understood">
                {chips.map((chip, i) => (
                  <li
                    key={`${chip.label}-${i}`}
                    className="inline-flex h-[28px] animate-rise items-center gap-[6px] rounded-sm border border-dark-border bg-[#2a2520] px-[10px] text-caption"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <span className="text-on-dark-muted">{chip.label}</span>
                    <span className="font-semibold text-on-dark-strong">{chip.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-xs">
            {voice.live && (
              <button
                type="button"
                onClick={voice.toggleMute}
                className="icon-btn-dark"
                aria-label={voice.muted ? 'Resume listening' : 'Pause listening'}
                title={voice.muted ? 'Resume' : 'Pause'}
              >
                {voice.muted ? <IconMic className="h-5 w-5" /> : <IconPause className="h-5 w-5" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="icon-btn-dark relative"
              aria-label={open ? 'Hide transcript' : 'Show transcript'}
              title="Transcript"
            >
              <IconTranscript className="h-5 w-5" />
              {voice.turns.length > 0 && (
                <span className="tabular absolute -right-[4px] -top-[4px] grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-primary px-[4px] text-[10px] font-semibold text-on-primary">
                  {voice.turns.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={voice.live ? voice.disconnect : voice.startVoice}
              className="icon-btn-dark"
              aria-label={voice.live ? 'End voice session' : 'Try voice again'}
              title={voice.live ? 'Close' : 'Retry'}
            >
              {voice.live ? <IconClose className="h-5 w-5" /> : <IconMic className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </section>
    </Frame>
  );
}
