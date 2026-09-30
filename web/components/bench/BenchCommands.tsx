'use client';

/**
 * "Say or tap" (DESIGN.md bench-command-button, D-5; ui-voice-surfaces §5).
 *
 * Tapping goes through POST /tools, the same dispatcher the voice agent uses,
 * as the step-timer buttons already do (specs/004). Phrases with no safe
 * direct equivalent are shown as things to say, not as buttons that do nothing.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconMic } from '@/components/icons';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import { callTool } from '@/lib/api';
import { applyOptimisticToolResult, keys } from '@/lib/queries/useExperiment';

const CELL =
  'flex h-[52px] items-center justify-center rounded-xl border px-sm text-center text-body-md transition-colors';

function SayOnly({ phrase, spoken }: { phrase: string; spoken: string }) {
  return (
    <span
      role="note"
      aria-label={`Say: ${spoken}`}
      className={`${CELL} gap-[6px] border-dashed border-dark-border text-on-dark-muted`}
    >
      <IconMic aria-hidden className="h-[14px] w-[14px] shrink-0" />“{phrase}”
    </span>
  );
}

export function BenchCommands({ experimentId }: { experimentId: string }) {
  const voice = useVoiceSession();
  const client = useQueryClient();
  const [pending, setPending] = useState<'step' | 'deviation' | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A refusal the user may override: what to say, what to send again, what "no" is called. */
  const [confirm, setConfirm] = useState<{ text: string; args: Record<string, boolean>; decline: string } | null>(
    null,
  );
  const [flagging, setFlagging] = useState(false);
  const [description, setDescription] = useState('');

  // Each "complete anyway" is kept, so a step that is both incomplete and still
  // timing asks twice and then goes through.
  async function completeStep(args: Record<string, boolean> = {}) {
    setPending('step');
    setError(null);
    setConfirm(null);
    try {
      const outcome = await callTool({
        tool: 'complete_protocol_step',
        args,
        experiment_id: experimentId,
        session_id: voice.sessionId,
      });
      if (outcome.success) {
        applyOptimisticToolResult(client, experimentId, 'complete_protocol_step', outcome.data);
        void client.invalidateQueries({ queryKey: keys.events(experimentId) });
      } else if (outcome.error === 'TIMER_STILL_RUNNING') {
        const d = outcome.detail ?? {};
        setConfirm({
          text: `The ${String(d.duration_spoken ?? '')} timer still has ${String(d.remaining_spoken ?? 'time')} left — complete anyway?`,
          args: { ...args, confirmed_early: true },
          decline: 'Keep timer',
        });
      } else if (outcome.error === 'STEP_INCOMPLETE') {
        // The readings this step asks for are not all in (owner decision 2026-09-30).
        setConfirm({ text: `${outcome.message} Complete anyway?`, args: { ...args, confirmed_incomplete: true }, decline: 'Not yet' });
      } else {
        setError(outcome.message);
      }
    } finally {
      setPending(null);
    }
  }

  async function flagDeviation(event: React.FormEvent) {
    event.preventDefault();
    const text = description.trim();
    if (!text) return;
    setPending('deviation');
    setError(null);
    try {
      const outcome = await callTool({
        tool: 'create_deviation',
        args: { description: text },
        experiment_id: experimentId,
        session_id: voice.sessionId,
      });
      if (outcome.success) {
        setFlagging(false);
        setDescription('');
        void client.invalidateQueries({ queryKey: keys.deviations(experimentId) });
        void client.invalidateQueries({ queryKey: keys.events(experimentId) });
        void client.invalidateQueries({ queryKey: ['experiments'] });
      } else {
        setError(outcome.message);
      }
    } finally {
      setPending(null);
    }
  }

  const disabled = voice.busy || pending !== null;

  return (
    <section aria-labelledby="say-or-tap">
      <p id="say-or-tap" className="text-eyebrow uppercase text-on-dark-muted">
        Say or tap
      </p>
      <div className="mt-sm grid grid-cols-2 gap-sm md:grid-cols-4">
        <button
          type="button"
          disabled={disabled}
          onClick={() => void completeStep()}
          className={`${CELL} border-dark-border bg-dark-panel text-on-dark hover:bg-dark-raised disabled:opacity-50`}
        >
          {pending === 'step' ? 'Saving…' : '“next step”'}
        </button>
        <SayOnly phrase="correct that to …" spoken="correct that to, then the value" />
        <SayOnly phrase="repeat" spoken="repeat" />
        <button
          type="button"
          disabled={disabled}
          aria-expanded={flagging}
          onClick={() => setFlagging((f) => !f)}
          className={`${CELL} border-dark-border bg-dark-panel text-on-dark hover:bg-dark-raised disabled:opacity-50`}
        >
          “flag deviation”
        </button>
      </div>

      {confirm && (
        <div
          role="alert"
          className="mt-sm flex flex-wrap items-center gap-sm rounded-lg border border-deviation-border-dark bg-deviation-bg-dark px-md py-sm"
        >
          <span className="min-w-0 flex-1 text-body-md text-deviation-on-dark">{confirm.text}</span>
          <button
            type="button"
            className="btn-secondary-dark"
            disabled={disabled}
            onClick={() => void completeStep(confirm.args)}
          >
            Complete step
          </button>
          <button
            type="button"
            className="btn-secondary-dark"
            onClick={() => setConfirm(null)}
          >
            {confirm.decline}
          </button>
        </div>
      )}

      {flagging && (
        <form
          onSubmit={flagDeviation}
          className="mt-sm flex flex-wrap items-end gap-sm rounded-lg border border-dark-line bg-dark-panel p-sm"
        >
          <label className="min-w-[220px] flex-1">
            <span className="mb-xxs block text-caption text-on-dark-muted">What happened?</span>
            <input
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-dark"
              placeholder="Incubator door open for two minutes"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={disabled || !description.trim()}>
            {pending === 'deviation' ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn-secondary-dark" onClick={() => setFlagging(false)}>
            Cancel
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-sm text-body-md text-danger-on-dark">
          {error}
        </p>
      )}
    </section>
  );
}
