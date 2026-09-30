import { describe, expect, it } from 'vitest';
import { dockMode } from '@/lib/ui/dockMode';

const bound = { id: 'exp-105', code: 'STAB-105' };

describe('dockMode (tasks T055, evaluated in order)', () => {
  it('1. hidden when not live and no error', () => {
    expect(
      dockMode({
        live: false,
        error: null,
        bound: null,
        pageExperimentId: null,
        closedHere: false,
      }),
    ).toBe('hidden');
  });

  it('1. a closed workspace with no live session is hidden (its StartBar explains it)', () => {
    expect(
      dockMode({ live: false, error: null, bound, pageExperimentId: 'exp-105', closedHere: true }),
    ).toBe('hidden');
  });

  it('2. closed-here when the live session is bound to this closed run', () => {
    expect(
      dockMode({ live: true, error: null, bound, pageExperimentId: 'exp-105', closedHere: true }),
    ).toBe('closed-here');
  });

  it('3. offer-switch for a live desk session on a workspace', () => {
    expect(
      dockMode({
        live: true,
        error: null,
        bound: null,
        pageExperimentId: 'exp-105',
        closedHere: false,
      }),
    ).toBe('offer-switch');
  });

  it('3. no offer-switch on a closed workspace', () => {
    expect(
      dockMode({
        live: true,
        error: null,
        bound: null,
        pageExperimentId: 'exp-105',
        closedHere: true,
      }),
    ).toBe('session');
  });

  it('4. live-elsewhere when bound to a different experiment than the workspace', () => {
    expect(
      dockMode({ live: true, error: null, bound, pageExperimentId: 'exp-999', closedHere: false }),
    ).toBe('live-elsewhere');
  });

  it('5. session otherwise, including off a workspace and an error with no live session', () => {
    expect(
      dockMode({ live: true, error: null, bound: null, pageExperimentId: null, closedHere: false }),
    ).toBe('session');
    expect(
      dockMode({ live: true, error: null, bound, pageExperimentId: 'exp-105', closedHere: false }),
    ).toBe('session');
    expect(
      dockMode({
        live: false,
        error: 'Microphone blocked',
        bound,
        pageExperimentId: null,
        closedHere: false,
      }),
    ).toBe('session');
  });

  it('0. mic-needed when voice was refused for want of a microphone, before anything else', () => {
    expect(
      dockMode({
        live: false,
        error: null,
        bound: null,
        pageExperimentId: null,
        closedHere: false,
        micNotice: true,
      }),
    ).toBe('mic-needed');
    expect(
      dockMode({
        live: false,
        error: 'x',
        bound,
        pageExperimentId: 'exp-105',
        closedHere: true,
        micNotice: true,
      }),
    ).toBe('mic-needed');
    // A live session means the microphone works; the notice no longer applies.
    expect(
      dockMode({
        live: true,
        error: null,
        bound: null,
        pageExperimentId: null,
        closedHere: false,
        micNotice: true,
      }),
    ).toBe('session');
  });
});
