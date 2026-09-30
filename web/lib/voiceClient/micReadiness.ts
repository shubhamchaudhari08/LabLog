/**
 * Is the microphone usable, and if not, what should the user do?
 *
 * Voice is the product, so "ready" must mean ready: permission granted and a
 * microphone present. Anything else is shown in red with the one thing to fix,
 * and every attempt to start voice asks for it first (specs/005 follow-up,
 * contracts/ui-voice-surfaces.md §7).
 */

/** The browser's permission state, plus the cases the Permissions API cannot answer. */
export type MicPermission = 'checking' | 'granted' | 'prompt' | 'denied' | 'unsupported';

/** Why the last attempt to open the microphone failed, if it did. */
export type MicFailure = 'denied' | 'no-device' | 'unavailable' | null;

export interface MicState {
  permission: MicPermission;
  /** Whether any audio input exists. null until the browser has said. */
  hasInput: boolean | null;
  /** The last getUserMedia failure; cleared when the microphone opens. */
  failure: MicFailure;
}

export type MicIssue =
  'checking' | 'needs-permission' | 'blocked' | 'no-device' | 'unavailable' | null;

export interface MicReadiness {
  /** Voice can start without asking anything first. */
  ready: boolean;
  issue: MicIssue;
  title: string;
  /** What to do about it, in one line. */
  action: string;
  /** The longer message shown when an attempt to start voice is refused. */
  message: string;
  /** The browser can show its permission prompt, so a tap can fix this. */
  canRequest: boolean;
}

/** Map a getUserMedia error to what it means for the user. */
export function classifyMicError(cause: unknown): MicFailure {
  const name =
    typeof cause === 'object' && cause !== null && 'name' in cause
      ? String((cause as { name: unknown }).name)
      : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError')
    return 'denied';
  if (
    name === 'NotFoundError' ||
    name === 'OverconstrainedError' ||
    name === 'DevicesNotFoundError'
  ) {
    return 'no-device';
  }
  // The device exists but cannot be opened: switched off in the OS, or held by another app.
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError')
    return 'unavailable';
  return null;
}

const READY: MicReadiness = {
  ready: true,
  issue: null,
  title: 'Voice agent ready',
  action: 'Mic idle · tap Start voice',
  message: '',
  canRequest: false,
};

export function micReadiness(state: MicState): MicReadiness {
  // A real failure outranks what the Permissions API last reported.
  if (state.permission === 'denied' || state.failure === 'denied') {
    return {
      ready: false,
      issue: 'blocked',
      title: 'Microphone blocked',
      action: 'Allow it in the address bar',
      message:
        'The microphone is blocked for this site. Allow it from the icon in the address bar, then try again.',
      canRequest: false,
    };
  }
  // Some browsers list no devices until access is granted, so an empty list
  // only means "no microphone" once permission is known to be granted.
  if (
    state.failure === 'no-device' ||
    (state.hasInput === false && state.permission === 'granted')
  ) {
    return {
      ready: false,
      issue: 'no-device',
      title: 'No microphone found',
      action: 'Connect or turn on a microphone',
      message: 'No microphone was found. Connect or turn on a microphone, then try again.',
      canRequest: false,
    };
  }
  if (state.failure === 'unavailable') {
    return {
      ready: false,
      issue: 'unavailable',
      title: 'Microphone unavailable',
      action: 'Turn it on, then tap to try again',
      message:
        'The microphone could not be opened. It may be switched off in your system settings or in use by another app. Fix that, then try again.',
      canRequest: true,
    };
  }
  if (state.permission === 'checking') {
    return {
      ready: false,
      issue: 'checking',
      title: 'Checking microphone',
      action: 'One moment…',
      message: 'Still checking the microphone. Try again in a moment.',
      canRequest: false,
    };
  }
  if (state.permission === 'prompt' || state.permission === 'unsupported') {
    return {
      ready: false,
      issue: 'needs-permission',
      title: 'Microphone access needed',
      action: 'Tap to allow the microphone',
      message: 'Voice needs your microphone. Allow access when your browser asks, then try again.',
      canRequest: true,
    };
  }
  return READY;
}

export type MicEvent =
  | { type: 'permission'; state: 'granted' | 'prompt' | 'denied' }
  | { type: 'unsupported' }
  | { type: 'devices'; hasInput: boolean }
  | { type: 'opened' }
  | { type: 'failed'; failure: MicFailure };

export const INITIAL_MIC_STATE: MicState = {
  permission: 'checking',
  hasInput: null,
  failure: null,
};

/** How what the browser reports changes the microphone state. */
export function reduceMic(state: MicState, event: MicEvent): MicState {
  switch (event.type) {
    case 'permission':
      // Unblocking in site settings, or a dismissed prompt that can be shown
      // again, clears a remembered refusal.
      return {
        ...state,
        permission: event.state,
        failure: state.failure === 'denied' && event.state !== 'denied' ? null : state.failure,
      };
    case 'unsupported':
      return {
        ...state,
        permission: state.permission === 'checking' ? 'unsupported' : state.permission,
      };
    case 'devices':
      return {
        ...state,
        hasInput: event.hasInput,
        failure: event.hasInput && state.failure === 'no-device' ? null : state.failure,
      };
    case 'opened':
      return { permission: 'granted', hasInput: true, failure: null };
    case 'failed':
      return {
        ...state,
        // Refused although this site is allowed: the OS has the microphone
        // switched off, which the address bar cannot fix.
        failure:
          event.failure === 'denied' && state.permission === 'granted'
            ? 'unavailable'
            : event.failure,
      };
  }
}
