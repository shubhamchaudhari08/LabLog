'use client';

/**
 * Voice from any screen (specs/003-post-mvp-features, constitution amendment A-1).
 *
 * HeaderVoiceControl sits in the app header on every page. Idle, it starts a
 * session: on an experiment's bench it is that experiment's session; anywhere
 * else it is a desk session that can create, start or resume an experiment by
 * voice. Live, it shows the state and links back to where the session belongs.
 *
 * DeskVoiceBar is the desk session's surface: what is being heard and said,
 * with mute and end. The bench has its own dock, so the bar stays off there.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { STATUS_COPY, STATUS_DOT, useVoiceSession } from './VoiceSession';
import { IconMic, IconMicOff, IconStop } from '@/components/icons';

export function HeaderVoiceControl() {
  const voice = useVoiceSession();

  if (!voice.live && voice.status !== 'error') {
    return (
      <button
        type="button"
        onClick={voice.startVoice}
        className="inline-flex items-center gap-xs rounded-pill bg-primary py-[6px] pl-[10px] pr-sm text-caption font-medium text-on-primary shadow-[0_6px_18px_-8px_rgba(204,120,92,0.9)] transition-colors hover:bg-primary-active"
        title={voice.bound ? `Start voice on ${voice.bound.code}` : 'Start voice: create, start or resume an experiment'}
      >
        <IconMic className="h-4 w-4" />
        <span>{voice.bound ? `Voice · ${voice.bound.code}` : 'Start voice'}</span>
      </button>
    );
  }

  const chip = (
    <>
      <span className="relative flex h-2 w-2">
        {voice.live && (
          <span aria-hidden className={`absolute inset-0 animate-beacon rounded-pill ${STATUS_DOT[voice.status]}`} />
        )}
        <span className={`relative h-2 w-2 rounded-pill ${STATUS_DOT[voice.status]}`} />
      </span>
      <span>{STATUS_COPY[voice.status]}</span>
      <span className="font-mono text-[11px] text-on-dark-soft">{voice.bound?.code ?? 'no experiment'}</span>
      {voice.muted && <span className="text-[11px] text-accent-amber">muted</span>}
    </>
  );
  const className =
    'group inline-flex items-center gap-xs rounded-pill border border-primary/25 bg-surface-dark py-[5px] pl-[10px] pr-sm text-caption text-on-dark shadow-panel transition-transform duration-200 hover:-translate-y-px';

  return voice.bound ? (
    <Link href={`/dashboard/experiments/${voice.bound.id}`} className={className} aria-live="polite">
      {chip}
    </Link>
  ) : (
    <span className={className} aria-live="polite">
      {chip}
    </span>
  );
}

export function DeskVoiceBar() {
  const voice = useVoiceSession();
  const pathname = usePathname();

  const onBench = pathname.startsWith('/dashboard/experiments/');
  if (voice.bound || onBench || (!voice.live && voice.status !== 'error')) return null;

  const last = voice.turns[voice.turns.length - 1];
  const caption = voice.switching
    ? `Opening ${voice.switching.code || 'the experiment'}…`
    : voice.partial ||
      last?.text ||
      'Say "create an experiment called …", "what protocols can I run?", or "resume STAB-104".';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-md z-dock flex justify-center px-md lg:pl-[calc(var(--sidebar-w)+16px)]">
      <section
        aria-label="Voice session"
        className="panel-dark pointer-events-auto flex w-full max-w-[720px] items-center gap-md rounded-xl px-md py-sm shadow-dark"
      >
        <button
          type="button"
          onClick={voice.live ? voice.toggleMute : voice.startVoice}
          aria-label={voice.live ? (voice.muted ? 'Unmute microphone' : 'Mute microphone') : 'Retry voice'}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-pill ${
            voice.muted ? 'bg-white/10 text-accent-amber' : 'bg-primary text-on-primary'
          }`}
        >
          {voice.muted ? <IconMicOff className="h-5 w-5" /> : <IconMic className="h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-xs text-[12px] text-on-dark-soft" aria-live="polite">
            <span className={`h-1.5 w-1.5 rounded-pill ${STATUS_DOT[voice.status]}`} />
            {voice.muted ? 'Muted' : STATUS_COPY[voice.status]} · no experiment open
            {voice.busy && <span className="text-primary">· working</span>}
          </p>
          <p
            className={`mt-[2px] truncate text-[14px] ${
              voice.error ? 'text-[#e98b8b]' : last?.role === 'agent' ? 'text-accent-teal' : 'text-on-dark'
            } ${voice.partial ? 'italic' : ''}`}
          >
            {voice.error ?? caption}
          </p>
        </div>
        {voice.live && (
          <button type="button" onClick={voice.disconnect} className="btn-dark h-10 shrink-0 px-md" aria-label="End voice session">
            <IconStop className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline">End</span>
          </button>
        )}
      </section>
    </div>
  );
}
