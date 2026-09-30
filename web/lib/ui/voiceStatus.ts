/**
 * What the voice surfaces say about the microphone (specs/005
 * contracts/ui-voice-surfaces.md §1, data-model §5). Evaluated top to bottom;
 * the first matching row wins. Motion (orb rings, waveform) is only on while
 * the agent is actually hearing or replying (DESIGN.md D-8).
 */
import type { VoiceStatusValue } from '@/lib/voiceClient/types';

export type VoiceTone = 'clay' | 'green' | 'grey' | 'amber' | 'danger';
export type OrbView = 'active' | 'calm' | 'grey';

export interface VoiceStatusInput {
  status: VoiceStatusValue;
  muted: boolean;
  error: string | null;
  live: boolean;
  bound: { code: string } | null;
  /** The bound experiment's current_step_index, when known. */
  stepIndex?: number | null;
  switching: { code: string } | null;
}

export interface VoiceStatusView {
  label: string;
  tone: VoiceTone;
  orb: OrbView;
  wave: boolean;
  context: string;
}

/** How long UNDERSTOOD stays up after a stored result. */
export const UNDERSTOOD_MS = 2500;

function context(input: VoiceStatusInput): string {
  if (input.switching) return `opening ${input.switching.code || 'the experiment'}…`;
  if (!input.bound) return 'no experiment open';
  return input.stepIndex != null
    ? `${input.bound.code} · step ${input.stepIndex + 1}`
    : input.bound.code;
}

export function voiceStatusView(
  input: VoiceStatusInput,
  understoodAt: number | null,
  now: number,
): VoiceStatusView {
  const ctx = context(input);
  const still = (label: string, tone: VoiceTone, orb: OrbView): VoiceStatusView => ({
    label,
    tone,
    orb,
    wave: false,
    context: ctx,
  });

  if (input.status === 'error' || input.error) {
    return still(input.error ?? 'Voice error', 'danger', 'grey');
  }
  if (input.status === 'reconnecting') {
    return still('RECONNECTING · nothing is being recorded', 'amber', 'grey');
  }
  if (input.live && input.muted) return still('PAUSED', 'grey', 'grey');
  if (understoodAt != null && now - understoodAt <= UNDERSTOOD_MS) {
    return still('UNDERSTOOD', 'green', 'calm');
  }

  switch (input.status) {
    case 'connecting':
      return still('CONNECTING', 'grey', 'calm');
    case 'thinking':
      return still('WORKING', 'clay', 'calm');
    case 'speaking':
      return { label: 'REPLYING', tone: 'clay', orb: 'active', wave: true, context: ctx };
    case 'ready':
    case 'listening':
      return { label: 'LISTENING', tone: 'clay', orb: 'active', wave: true, context: ctx };
    default:
      return still('READY', 'grey', 'calm');
  }
}

/** The text colour class for a tone, on dark surfaces. */
export const TONE_ON_DARK: Record<VoiceTone, string> = {
  clay: 'text-primary-on-dark',
  green: 'text-status-running-on-dark',
  grey: 'text-on-dark-muted',
  amber: 'text-deviation-on-dark',
  danger: 'text-danger-on-dark',
};
