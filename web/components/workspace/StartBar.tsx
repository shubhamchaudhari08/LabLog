'use client';

/**
 * Voice records only into a RUNNING experiment (the dispatcher refuses the rest).
 * A READY run gets its Start here; anything else gets one line saying why the
 * microphone would have nothing to write to (specs/003-post-mvp-features FR-214).
 *
 * Shared by the workspace and Bench mode (specs/005), which passes `onDark`.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconMic } from '@/components/icons';
import { ButtonLink } from '@/components/ui/Button';
import { startExperiment } from '@/lib/api';
import { keys } from '@/lib/queries/useExperiment';

export function StartBar({
  experimentId,
  status,
  hasProtocol,
  onDark = false,
}: {
  experimentId: string;
  status: string;
  hasProtocol: boolean;
  onDark?: boolean;
}) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'RUNNING') return null;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const result = await startExperiment(experimentId);
      if (!result.success) setError(result.message);
      await Promise.all([
        client.invalidateQueries({ queryKey: keys.experiment(experimentId) }),
        client.invalidateQueries({ queryKey: ['experiments'] }),
        client.invalidateQueries({ queryKey: keys.events(experimentId) }),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The experiment was not started.');
    } finally {
      setBusy(false);
    }
  }

  const message =
    status === 'READY'
      ? 'Ready to run. Start it, then press the microphone to record by voice.'
      : status === 'DRAFT'
        ? hasProtocol
          ? 'This experiment is a draft.'
          : 'No protocol yet. Press the microphone and say "create a new protocol and start this experiment", then dictate the steps.'
        : 'This run is finished, so voice has nothing to record into.';

  return (
    <div
      className={`mt-md flex flex-wrap items-center gap-sm rounded-card border px-md py-sm text-body-md ${
        onDark
          ? 'border-dark-line bg-dark-panel text-on-dark-body'
          : 'border-hairline bg-surface-rail text-body'
      }`}
    >
      <IconMic className={`h-4 w-4 shrink-0 ${onDark ? 'text-primary-on-dark' : 'text-primary'}`} />
      <span className="min-w-0 flex-1">{message}</span>
      {status === 'READY' && (
        <button type="button" className="btn-primary" onClick={start} disabled={busy}>
          {busy ? 'Starting…' : 'Start experiment'}
        </button>
      )}
      {(status === 'COMPLETED' || status === 'CANCELLED') && (
        <ButtonLink href="/experiments/new" variant={onDark ? 'secondary-dark' : 'secondary'}>
          New experiment
        </ButtonLink>
      )}
      {error && (
        <p
          role="alert"
          className={`w-full text-caption ${onDark ? 'text-danger-on-dark' : 'text-danger-text'}`}
        >
          {error}
        </p>
      )}
    </div>
  );
}
