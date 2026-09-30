'use client';

/**
 * What was just saved (DESIGN.md bench-confirm-card, D-4). Shown for six
 * seconds after a stored result, built from the stored values. No countdown,
 * no Undo: the record is append-only, and a wrong value is corrected by voice.
 */
import { useEffect, useState } from 'react';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import { useMeasurementTypes } from '@/lib/queries/useMeasurementTypes';
import { intentChips, MUTATING_TOOLS } from '@/lib/ui/intentChips';
import { unitNote } from '@/lib/ui/unitNote';

const VISIBLE_MS = 6000;

const KICKER: Record<string, string> = {
  record_measurement: 'Reading',
  correct_measurement: 'Correction',
  record_observation: 'Note',
  create_deviation: 'Deviation flagged',
  complete_protocol_step: 'Step change',
  step_timer: 'Timer',
  complete_experiment: 'Run finished',
};

/** The card the bench shows, or null. Used by BenchCenter to choose between this and the commands. */
export function useConfirmVisible(): boolean {
  const voice = useVoiceSession();
  const [now, setNow] = useState(() => Date.now());
  const at = voice.lastOutcome?.at ?? null;
  useEffect(() => {
    if (at == null) return;
    setNow(Date.now());
    const id = setTimeout(() => setNow(Date.now()), VISIBLE_MS + 50);
    return () => clearTimeout(id);
  }, [at]);
  return (
    voice.lastOutcome != null &&
    voice.lastOutcome.tool in KICKER &&
    MUTATING_TOOLS.has(voice.lastOutcome.tool) &&
    now - voice.lastOutcome.at < VISIBLE_MS
  );
}

export function ConfirmCard() {
  const voice = useVoiceSession();
  const types = useMeasurementTypes();
  const outcome = voice.lastOutcome;
  if (!outcome) return null;

  const { tool, data } = outcome;
  const deviation = tool === 'create_deviation';
  const measurement = tool === 'record_measurement' || tool === 'correct_measurement';
  const chips = intentChips(tool, data, voice.bound, { typeName: types.typeName });
  const main = chips.find((c) => c.kind === 'value');
  const quote =
    typeof data.measurement_id === 'string'
      ? (voice.quotes.get(data.measurement_id) ?? null)
      : null;
  const note = measurement
    ? unitNote(
        quote,
        typeof data.unit === 'string' ? data.unit : null,
        types.find(String(data.measurement_type ?? '')),
      )
    : null;

  const label = deviation ? 'Deviation' : (main?.label ?? KICKER[tool]);
  const value = deviation ? String(data.description ?? '') : (main?.value ?? null);

  return (
    <section
      role="status"
      className={`animate-rise rounded-panel border bg-dark-raised px-[20px] py-[18px] ${
        deviation ? 'border-deviation-border-dark' : 'border-dark-border'
      }`}
    >
      <p
        className={`text-eyebrow uppercase ${deviation ? 'text-deviation-on-dark' : 'text-status-running-on-dark'}`}
      >
        Saved · {KICKER[tool]}
      </p>
      {note && <p className="mt-xxs text-caption text-on-dark-muted">{note}</p>}
      <div className="mt-sm flex flex-wrap items-baseline gap-x-md gap-y-xs">
        <span className="text-body-lg text-on-dark-body">{label}</span>
        {value && <span className="font-mono text-readout text-on-dark-strong">{value}</span>}
        {chips
          .filter((c) => c.kind === 'value' && c !== main)
          .map((c) => (
            <span key={c.label} className="text-body-md text-on-dark-muted">
              {c.label} {c.value}
            </span>
          ))}
      </div>
      {measurement && (
        <p className="mt-sm text-caption text-on-dark-muted">Wrong? Say “correct that to …”</p>
      )}
    </section>
  );
}
