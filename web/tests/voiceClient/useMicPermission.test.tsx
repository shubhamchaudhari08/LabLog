/**
 * The microphone hook against a fake browser: the Permissions API, the device
 * list and getUserMedia are stubbed, so these tests check the wiring (what the
 * browser says turns into the right readiness) without a real microphone.
 * Rendered with react-dom in jsdom, as tests/timer/provider.test.tsx is.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMicPermission, type MicPermissionValue } from '@/components/voice/useMicPermission';

// React 18 warns without this flag when act() is used outside a test renderer.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakePermissionStatus extends EventTarget {
  constructor(public state: PermissionState) {
    super();
  }
  set(state: PermissionState) {
    this.state = state;
    this.dispatchEvent(new Event('change'));
  }
}

let permission: FakePermissionStatus;
let devices: { kind: string }[];
let getUserMedia: ReturnType<typeof vi.fn>;
let root: Root;
let container: HTMLDivElement;
let latest: MicPermissionValue;

function Probe() {
  latest = useMicPermission();
  return null;
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function mount() {
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => root.render(createElement(Probe)));
  await flush();
}

beforeEach(() => {
  permission = new FakePermissionStatus('prompt');
  devices = [{ kind: 'audioinput' }];
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn(async () => permission) },
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      enumerateDevices: vi.fn(async () => devices),
      getUserMedia,
    }),
  });
});

afterEach(() => {
  act(() => root.unmount());
});

const track = () => ({ stop: vi.fn() });
const domError = (name: string) => Object.assign(new Error(name), { name });

describe('useMicPermission', () => {
  it('is not ready (red) until the browser has been asked', async () => {
    await mount();
    expect(latest.readiness).toMatchObject({ ready: false, issue: 'needs-permission' });
  });

  it('turns ready when the user allows the microphone, and releases it at once', async () => {
    const t = track();
    getUserMedia.mockResolvedValue({ getTracks: () => [t] });
    await mount();
    let ok = false;
    await act(async () => {
      ok = await latest.request();
    });
    expect(ok).toBe(true);
    expect(t.stop).toHaveBeenCalled();
    expect(latest.readiness.ready).toBe(true);
  });

  it('is ready straight away when permission was granted before', async () => {
    permission = new FakePermissionStatus('granted');
    await mount();
    expect(latest.readiness.ready).toBe(true);
  });

  it('reports a blocked microphone, and turns ready without a reload when it is unblocked', async () => {
    permission = new FakePermissionStatus('denied');
    await mount();
    expect(latest.readiness.issue).toBe('blocked');
    await act(async () => permission.set('granted'));
    expect(latest.readiness.ready).toBe(true);
  });

  it('keeps asking, rather than calling it blocked, when the prompt was only dismissed', async () => {
    getUserMedia.mockRejectedValue(domError('NotAllowedError'));
    await mount();
    await act(async () => {
      await latest.request();
    });
    // The fake still says "prompt": the browser can ask again.
    expect(latest.readiness.issue).toBe('needs-permission');
  });

  it('calls it blocked when the user chose Block', async () => {
    getUserMedia.mockImplementation(async () => {
      permission.state = 'denied';
      throw domError('NotAllowedError');
    });
    await mount();
    await act(async () => {
      await latest.request();
    });
    expect(latest.readiness.issue).toBe('blocked');
  });

  it('reports a missing microphone, and recovers when one is plugged in', async () => {
    permission = new FakePermissionStatus('granted');
    devices = [];
    await mount();
    expect(latest.readiness.issue).toBe('no-device');
    devices = [{ kind: 'audioinput' }];
    await act(async () => {
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
    });
    await flush();
    expect(latest.readiness.ready).toBe(true);
  });

  it('reports a microphone switched off in the OS although the site is allowed', async () => {
    permission = new FakePermissionStatus('granted');
    getUserMedia.mockRejectedValue(domError('NotReadableError'));
    await mount();
    await act(async () => {
      await latest.request();
    });
    expect(latest.readiness).toMatchObject({
      ready: false,
      issue: 'unavailable',
      canRequest: true,
    });
  });

  it('asks when the browser has no Permissions API', async () => {
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
    await mount();
    expect(latest.readiness.issue).toBe('needs-permission');
  });
});
