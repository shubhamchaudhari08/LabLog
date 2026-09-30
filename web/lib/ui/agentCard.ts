/**
 * The sidebar's agent status card (specs/005 contracts/ui-voice-surfaces.md §7):
 * green and "ready" when idle, clay while a session is live.
 */
import type { MicReadiness } from '@/lib/voiceClient/micReadiness';
import type { VoiceStatusView } from './voiceStatus';

export interface AgentCardView {
  dot: 'green' | 'clay' | 'grey' | 'amber' | 'danger';
  title: string;
  subtitle: string;
  pulse: boolean;
  /** The bound run's bench while a session is live on it. */
  href: string | null;
  /** Tapping the card can fix the problem (it shows the browser's microphone prompt). */
  requestable: boolean;
}

export function agentCardView(
  view: VoiceStatusView,
  voice: {
    live: boolean;
    muted: boolean;
    status: string;
    error: string | null;
    bound: { id?: string; code: string } | null;
  },
  /** Omitted: treat the microphone as ready (the card then only reflects the session). */
  mic?: MicReadiness,
): AgentCardView {
  // Idle and the microphone cannot be used: that is the one thing to fix, so it
  // outranks everything else (specs/005 follow-up).
  if (!voice.live && mic && !mic.ready) {
    return {
      dot: mic.issue === 'checking' ? 'grey' : 'danger',
      title: mic.title,
      subtitle: mic.action,
      pulse: false,
      href: null,
      requestable: mic.canRequest,
    };
  }
  if (voice.status === 'error' || voice.error) {
    return {
      dot: 'danger',
      title: 'Voice error',
      subtitle: 'Nothing is being recorded',
      pulse: false,
      href: null,
      requestable: false,
    };
  }
  if (voice.status === 'reconnecting') {
    return {
      dot: 'amber',
      title: 'Reconnecting',
      subtitle: 'Nothing is being recorded',
      pulse: false,
      href: null,
      requestable: false,
    };
  }
  if (!voice.live) {
    return {
      dot: 'green',
      title: 'Voice agent ready',
      subtitle: 'Mic idle · tap Start voice',
      pulse: true,
      href: null,
      requestable: false,
    };
  }
  const href = voice.bound?.id ? `/dashboard/experiments/${voice.bound.id}/bench` : null;
  if (voice.muted) {
    return {
      dot: 'grey',
      title: 'Paused',
      subtitle: `Mic muted · ${voice.bound?.code ?? 'no experiment'}`,
      pulse: false,
      href,
      requestable: false,
    };
  }
  const title = view.label.charAt(0) + view.label.slice(1).toLowerCase();
  return {
    dot: 'clay',
    title,
    subtitle: voice.bound ? `Streaming to ${voice.bound.code}` : 'No experiment open',
    pulse: true,
    href,
    requestable: false,
  };
}
