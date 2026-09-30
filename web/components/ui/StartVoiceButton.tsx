'use client';

/**
 * The header's Start voice control (DESIGN.md button-start-voice). Idle, it
 * starts a session: on a workspace or bench, that experiment's; anywhere else
 * a desk session. Live, it becomes a dark chip that says what the microphone
 * is doing and links back to the run it belongs to.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { IconMic, IconMicOff } from '@/components/icons';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import { TONE_ON_DARK, voiceStatusView } from '@/lib/ui/voiceStatus';

function useTick(active: boolean, ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}

export function StartVoiceButton() {
  const voice = useVoiceSession();
  const now = useTick(voice.understoodAt != null, 500);

  // A refused attempt (no microphone) stays on this button, which is how it gets fixed.
  if ((!voice.live && voice.status !== 'error') || voice.micNotice) {
    // Clicking still starts voice: the session asks for the microphone first.
    const needsMic = !voice.mic.ready && voice.mic.issue !== 'checking';
    const Glyph = needsMic ? IconMicOff : IconMic;
    return (
      <button
        type="button"
        onClick={voice.startVoice}
        title={
          needsMic
            ? voice.mic.message
            : voice.bound
              ? `Start voice on ${voice.bound.code}`
              : 'Start voice: create, start or resume an experiment'
        }
        aria-label={
          needsMic
            ? `${voice.mic.title}. ${voice.mic.action}`
            : voice.bound
              ? `Start voice on ${voice.bound.code}`
              : 'Start voice'
        }
        className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center gap-xs rounded-pill bg-primary text-button text-on-primary shadow-start-voice transition-colors hover:bg-primary-active sm:w-auto sm:px-[18px]"
      >
        <Glyph className="h-[18px] w-[18px]" />
        <span className="hidden sm:inline">
          {needsMic ? 'Enable mic' : voice.bound ? `Voice · ${voice.bound.code}` : 'Start voice'}
        </span>
      </button>
    );
  }

  const view = voiceStatusView(voice, voice.understoodAt, now);
  const label = view.tone === 'danger' ? 'Voice error' : view.label.split(' · ')[0];
  const chip = (
    <>
      <span aria-hidden className="relative flex h-[8px] w-[8px]">
        {view.orb === 'active' && (
          <span className="absolute inset-0 animate-pulse-dot rounded-full bg-primary-glow" />
        )}
        <span
          className={`relative h-[8px] w-[8px] rounded-full ${view.tone === 'clay' ? 'bg-primary-glow' : 'bg-current'}`}
        />
      </span>
      <span className={`eyebrow ${TONE_ON_DARK[view.tone]}`}>{label}</span>
      <span className="hidden font-mono text-code text-on-dark-muted sm:inline">
        {voice.bound?.code ?? 'no experiment'}
      </span>
    </>
  );
  const className = `inline-flex h-[42px] shrink-0 items-center gap-xs rounded-pill border border-dark-border bg-dark-panel px-[14px] ${TONE_ON_DARK[view.tone]}`;

  return voice.bound ? (
    <Link
      href={`/dashboard/experiments/${voice.bound.id}`}
      className={className}
      aria-live="polite"
    >
      {chip}
    </Link>
  ) : (
    <span className={className} aria-live="polite">
      {chip}
    </span>
  );
}
