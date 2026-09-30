'use client';

/**
 * Watches whether the microphone can be used, and asks for it.
 *
 * The Permissions API reports granted / prompt / denied and fires when the
 * user changes it in site settings, so unblocking turns the app ready without
 * a reload. The device list tells us whether a microphone exists and fires
 * when one is plugged in. Whether the OS has it switched off is only known by
 * trying to open it, so `request()` does that and closes it again at once.
 */

import { useCallback, useEffect, useReducer } from 'react';
import {
  classifyMicError,
  INITIAL_MIC_STATE,
  micReadiness,
  reduceMic,
  type MicReadiness,
  type MicState,
} from '@/lib/voiceClient/micReadiness';

export interface MicPermissionValue {
  state: MicState;
  readiness: MicReadiness;
  /** Open the microphone once (showing the browser's prompt if needed) and close it. */
  request: () => Promise<boolean>;
  /** Record a failure seen elsewhere, e.g. when a session could not open the microphone. */
  noteFailure: (cause: unknown) => void;
}

async function queryPermission(): Promise<PermissionStatus | null> {
  try {
    // 'microphone' is supported by Chromium and current Firefox; older engines throw.
    return (await navigator.permissions?.query({ name: 'microphone' as PermissionName })) ?? null;
  } catch {
    return null;
  }
}

export function useMicPermission(): MicPermissionValue {
  const [state, dispatch] = useReducer(reduceMic, INITIAL_MIC_STATE);

  const refreshPermission = useCallback(async () => {
    const status = await queryPermission();
    if (status) dispatch({ type: 'permission', state: status.state });
    else dispatch({ type: 'unsupported' });
    return status;
  }, []);

  const countInputs = useCallback(async () => {
    try {
      const devices = (await navigator.mediaDevices?.enumerateDevices?.()) ?? null;
      if (devices)
        dispatch({ type: 'devices', hasInput: devices.some((d) => d.kind === 'audioinput') });
    } catch {
      /* the device list is a hint; the real answer comes from opening the mic */
    }
  }, []);

  useEffect(() => {
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => {
      if (status) dispatch({ type: 'permission', state: status.state });
      void countInputs(); // device labels and lists can change with permission
    };
    void queryPermission().then((result) => {
      if (cancelled) return;
      status = result;
      if (result) {
        dispatch({ type: 'permission', state: result.state });
        result.addEventListener('change', onChange);
      } else {
        dispatch({ type: 'unsupported' });
      }
    });
    void countInputs();
    navigator.mediaDevices?.addEventListener?.('devicechange', countInputs);
    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
      navigator.mediaDevices?.removeEventListener?.('devicechange', countInputs);
    };
  }, [countInputs]);

  const request = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      dispatch({ type: 'failed', failure: 'no-device' });
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      dispatch({ type: 'opened' });
      return true;
    } catch (cause) {
      dispatch({ type: 'failed', failure: classifyMicError(cause) ?? 'unavailable' });
      // A dismissed prompt also rejects; if the browser can still ask, say so
      // instead of calling the microphone blocked.
      await refreshPermission();
      void countInputs();
      return false;
    }
  }, [countInputs, refreshPermission]);

  const noteFailure = useCallback(
    (cause: unknown) => {
      const failure = classifyMicError(cause);
      if (failure) {
        dispatch({ type: 'failed', failure });
        void refreshPermission();
      }
    },
    [refreshPermission],
  );

  return { state, readiness: micReadiness(state), request, noteFailure };
}
