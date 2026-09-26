'use client';

/**
 * The chronological record — now secondary to the sample board.
 *
 * Rendered as a running log rather than a data grid: no header row, no cell
 * borders, time in a fixed mono gutter. A lab notebook is a sequence of
 * entries, not a spreadsheet, and dropping the table chrome roughly halves the
 * lines of ink on screen.
 *
 * Measurements, observations and deviations share one stream, because they
 * happened in one sequence. Splitting them into three panels made the user
 * reassemble the order in their head.
 */

import type { MeasurementRow } from '@/lib/queries/useExperiment';

export interface Entry {
  id: string;
  at: string;
  kind: 'measurement' | 'observation' | 'deviation';
  sample?: string | null;
  text: string;
  value?: number;
  unit?: string | null;
  note?: string | null;
}

const KIND_MARK: Record<Entry['kind'], string> = {
  measurement: 'bg-primary',
  observation: 'bg-accent-teal',
  deviation: 'bg-accent-amber',
};

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function toEntries(
  measurements: MeasurementRow[],
  observations: {
    id: string;
    observation: string;
    recorded_at: string;
    samples?: { sample_code: string } | null;
  }[],
  deviations: { id: string; description: string; reason?: string | null; created_at: string }[],
): Entry[] {
  return [
    ...measurements.map<Entry>((m) => ({
      id: m.id,
      at: m.recorded_at,
      kind: 'measurement',
      sample: m.samples?.sample_code,
      text: m.measurement_type,
      value: m.value,
      unit: m.unit,
      note: m.correction_reason ? `corrected from ${m.previous_value ?? '—'}` : null,
    })),
    ...observations.map<Entry>((o) => ({
      id: o.id,
      at: o.recorded_at,
      kind: 'observation',
      sample: o.samples?.sample_code,
      text: o.observation,
    })),
    ...deviations.map<Entry>((d) => ({
      id: d.id,
      at: d.created_at,
      kind: 'deviation',
      text: d.description,
      note: d.reason,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

export function Ledger({ entries, loading }: { entries: Entry[]; loading?: boolean }) {
  return (
    <section aria-labelledby="ledger-heading">
      <header className="flex items-baseline justify-between border-b border-hairline pb-xs">
        <h2 id="ledger-heading" className="panel-label">
          Record
        </h2>
        <span className="tabular text-caption text-muted-soft">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </header>

      {loading ? (
        <div className="space-y-sm pt-md" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-md">
              <div className="skeleton h-4 w-10" />
              <div className="skeleton h-4 flex-1" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="py-xl">
          <p className="text-body-md text-muted">Nothing recorded yet.</p>
          <p className="mt-xs inline-flex items-center gap-xs rounded-md border border-dashed border-hairline bg-surface-soft px-sm py-xs font-mono text-body-sm text-body">
            <span aria-hidden className="text-primary">
              ▸
            </span>
            “A17 is 4.2 Celsius”
          </p>
        </div>
      ) : (
        <ol className="pt-xs">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="group flex animate-rise items-baseline gap-md border-b border-hairline-soft py-sm last:border-0"
            >
              <time
                dateTime={entry.at}
                className="tabular w-[72px] shrink-0 whitespace-nowrap font-mono text-caption text-muted-soft"
              >
                {time(entry.at)}
              </time>

              <span
                aria-hidden
                className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-pill ${KIND_MARK[entry.kind]}`}
              />

              {entry.sample && (
                <span className="w-24 shrink-0 whitespace-nowrap font-mono text-body-sm text-ink">
                  {entry.sample}
                </span>
              )}

              <span
                className={`min-w-0 flex-1 text-body-sm ${
                  entry.kind === 'measurement' ? 'capitalize text-muted' : 'text-body'
                }`}
              >
                {entry.text}
                {entry.note && (
                  <span className="ml-xs text-caption text-muted-soft">· {entry.note}</span>
                )}
              </span>

              {entry.value !== undefined && (
                <span className="tabular shrink-0 text-title-sm text-ink">
                  {entry.value}
                  <span className="ml-xxs text-body-sm text-muted-soft">{entry.unit}</span>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
