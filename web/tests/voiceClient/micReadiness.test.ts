import { describe, expect, it } from 'vitest';
import {
  classifyMicError,
  INITIAL_MIC_STATE,
  micReadiness,
  reduceMic,
  type MicState,
} from '@/lib/voiceClient/micReadiness';

const state = (over: Partial<MicState> = {}): MicState => ({
  permission: 'granted',
  hasInput: true,
  failure: null,
  ...over,
});

describe('micReadiness', () => {
  it('is ready only with permission granted and a microphone present', () => {
    expect(micReadiness(state())).toMatchObject({
      ready: true,
      issue: null,
      title: 'Voice agent ready',
    });
    // Device list not reported yet, but permission granted: nothing says it is missing.
    expect(micReadiness(state({ hasInput: null })).ready).toBe(true);
  });

  it('asks for permission when the browser has not been asked yet', () => {
    expect(micReadiness(state({ permission: 'prompt' }))).toMatchObject({
      ready: false,
      issue: 'needs-permission',
      canRequest: true,
    });
  });

  it('asks when the Permissions API cannot say (the only way to find out is to ask)', () => {
    expect(micReadiness(state({ permission: 'unsupported' })).issue).toBe('needs-permission');
  });

  it('reports a blocked microphone, which only the user can unblock', () => {
    expect(micReadiness(state({ permission: 'denied' }))).toMatchObject({
      ready: false,
      issue: 'blocked',
      canRequest: false,
    });
    // A refused getUserMedia counts even if the Permissions API still says prompt.
    expect(micReadiness(state({ permission: 'prompt', failure: 'denied' })).issue).toBe('blocked');
  });

  it('reports a missing microphone', () => {
    expect(micReadiness(state({ hasInput: false })).issue).toBe('no-device');
    expect(micReadiness(state({ failure: 'no-device' })).issue).toBe('no-device');
  });

  it('does not trust an empty device list before permission, since some browsers hide it', () => {
    expect(micReadiness(state({ permission: 'prompt', hasInput: false })).issue).toBe(
      'needs-permission',
    );
  });

  it('reports a microphone that is off or in use, and lets the user retry', () => {
    expect(micReadiness(state({ failure: 'unavailable' }))).toMatchObject({
      ready: false,
      issue: 'unavailable',
      canRequest: true,
    });
  });

  it('is not ready while still checking, without claiming a problem', () => {
    expect(micReadiness(state({ permission: 'checking' }))).toMatchObject({
      ready: false,
      issue: 'checking',
    });
  });

  it('gives every problem a message that says what to do', () => {
    for (const s of [
      state({ permission: 'prompt' }),
      state({ permission: 'denied' }),
      state({ hasInput: false }),
      state({ failure: 'unavailable' }),
    ]) {
      expect(micReadiness(s).message).toMatch(/try again/);
    }
  });
});

describe('classifyMicError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'no-device'],
    ['OverconstrainedError', 'no-device'],
    ['NotReadableError', 'unavailable'],
    ['AbortError', 'unavailable'],
    ['TypeError', null],
  ])('%s → %s', (name, expected) => {
    expect(classifyMicError({ name })).toBe(expected);
  });

  it('ignores things that are not errors', () => {
    expect(classifyMicError(undefined)).toBeNull();
    expect(classifyMicError('nope')).toBeNull();
  });
});

describe('reduceMic', () => {
  it('starts out checking, then follows the permission', () => {
    expect(micReadiness(INITIAL_MIC_STATE).issue).toBe('checking');
    const s = reduceMic(INITIAL_MIC_STATE, { type: 'permission', state: 'prompt' });
    expect(micReadiness(s).issue).toBe('needs-permission');
  });

  it('turns ready once the microphone opens', () => {
    const s = reduceMic(state({ permission: 'prompt' }), { type: 'opened' });
    expect(micReadiness(s).ready).toBe(true);
  });

  it('clears a refusal when the site is unblocked, or the prompt can be shown again', () => {
    const refused = reduceMic(state({ permission: 'prompt' }), {
      type: 'failed',
      failure: 'denied',
    });
    expect(micReadiness(refused).issue).toBe('blocked');
    expect(micReadiness(reduceMic(refused, { type: 'permission', state: 'granted' })).ready).toBe(
      true,
    );
    expect(micReadiness(reduceMic(refused, { type: 'permission', state: 'prompt' })).issue).toBe(
      'needs-permission',
    );
    expect(micReadiness(reduceMic(refused, { type: 'permission', state: 'denied' })).issue).toBe(
      'blocked',
    );
  });

  it('treats a refusal while the site is allowed as the OS switching the mic off', () => {
    const s = reduceMic(state({ permission: 'granted' }), { type: 'failed', failure: 'denied' });
    expect(micReadiness(s).issue).toBe('unavailable');
  });

  it('clears "no microphone" when one is plugged in', () => {
    const missing = reduceMic(state(), { type: 'failed', failure: 'no-device' });
    expect(micReadiness(missing).issue).toBe('no-device');
    expect(micReadiness(reduceMic(missing, { type: 'devices', hasInput: true })).ready).toBe(true);
  });

  it('marks the Permissions API unsupported only while still checking', () => {
    expect(reduceMic(INITIAL_MIC_STATE, { type: 'unsupported' }).permission).toBe('unsupported');
    expect(reduceMic(state(), { type: 'unsupported' }).permission).toBe('granted');
  });
});
