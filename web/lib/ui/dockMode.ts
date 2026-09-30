/**
 * Which face the floating voice dock shows (specs/005 tasks T055; research R-509).
 * Evaluated in order; the first match wins.
 */
export type DockMode =
  'hidden' | 'mic-needed' | 'session' | 'offer-switch' | 'live-elsewhere' | 'closed-here';

export function dockMode(input: {
  live: boolean;
  error: string | null;
  bound: { id: string } | null;
  /** The experiment whose workspace is open, if any. */
  pageExperimentId: string | null;
  /** That workspace's run is COMPLETED or CANCELLED. */
  closedHere: boolean;
  /** An attempt to start voice was refused because the microphone cannot be used. */
  micNotice?: boolean;
}): DockMode {
  const { live, error, bound, pageExperimentId, closedHere, micNotice = false } = input;
  // 0. Voice was asked for but the microphone cannot be used: say what to fix.
  if (!live && micNotice) return 'mic-needed';
  if (!live && !error) return 'hidden';
  if (live && pageExperimentId && closedHere && bound?.id === pageExperimentId)
    return 'closed-here';
  if (live && pageExperimentId && !bound && !closedHere) return 'offer-switch';
  if (live && pageExperimentId && bound && bound.id !== pageExperimentId) return 'live-elsewhere';
  return 'session';
}
