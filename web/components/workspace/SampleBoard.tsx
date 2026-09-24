'use client';

/**
 * Sample-first view — the redesign's main information change.
 *
 * The old table was ordered by time, which answers "what happened recently?".
 * Standing at a bench, the question is almost always "what do I have for A17?",
 * and answering it from a reverse-chronological list means reading and
 * discarding rows. One card per sample answers it without reading.
 *
 * It also improves the demo's hero moment: a large number changing inside a
 * card is far more visible from across a room than a new row appearing in a
 * dense table.
 */

import type { MeasurementRow } from '@/lib/queries/useExperiment';

export interface SampleInfo {
  id: string;
  sample_code: string;
  sample_type?: string;
}

interface Reading {
  type: string;
  value: number;
  unit: string | null;
  corrected: boolean;
  previous?: number;
  recordedAt: string;
  optimistic?: boolean;
}

/** Latest live reading per measurement type, newest type first. */
function readingsFor(code: string, measurements: MeasurementRow[]): Reading[] {
  const seen = new Set<string>();
  const out: Reading[] = [];
  for (const m of measurements) {
    if (m.samples?.sample_code !== code || seen.has(m.measurement_type)) continue;
    seen.add(m.measurement_type);
    out.push({
      type: m.measurement_type,
      value: m.value,
      unit: m.unit,
      corrected: Boolean(m.correction_reason),
      previous: m.previous_value,
      recordedAt: m.recorded_at,
      optimistic: m._optimistic,
    });
  }
  return out;
}

function Card({
  sample,
  readings,
  previousById,
}: {
  sample: SampleInfo;
  readings: Reading[];
  previousById: Record<string, number>;
}) {
  const [primary, ...rest] = readings;
  const isControl = sample.sample_type === 'control';

  return (
    <article
      className={`group relative flex min-h-[168px] flex-col overflow-hidden rounded-lg border p-lg transition-all duration-300 ${
        isControl
          ? 'border-hairline bg-surface-card/70'
          : 'border-hairline bg-canvas shadow-panel hover:shadow-lift'
      }`}
    >
      <header className="flex items-start justify-between gap-xs">
        <span className="font-mono text-title-sm tracking-tight text-ink">
          {sample.sample_code}
        </span>
        {isControl && (
          <span className="text-caption-upper uppercase text-muted-soft">control</span>
        )}
      </header>

      {primary ? (
        <>
          {/* The hero number. Sized to be read from across a bench, and keyed so
              React remounts it on change — which replays the landing wash. */}
          <div
            key={`${primary.type}-${primary.value}`}
            className="mt-auto animate-cell-land -mx-xs rounded-md px-xs"
          >
            <p className="flex items-baseline gap-xxs">
              <span className="tabular font-display text-[44px] leading-none text-ink">
                {primary.value}
              </span>
              <span className="text-title-sm text-muted">{primary.unit}</span>
            </p>
            <p className="mt-xxs flex items-center gap-xs text-caption text-muted">
              <span className="capitalize">{primary.type}</span>
              {primary.corrected && (
                <span className="badge tabular">
                  was {primary.previous ?? previousById[primary.type] ?? '—'}
                </span>
              )}
              {primary.optimistic && <span className="text-muted-soft">saving…</span>}
            </p>
          </div>

          {rest.length > 0 && (
            <ul className="mt-md space-y-xxs border-t border-hairline-soft pt-xs">
              {rest.map((r) => (
                <li key={r.type} className="flex justify-between text-body-sm">
                  <span className="capitalize text-muted">{r.type}</span>
                  <span className="tabular text-ink">
                    {r.value}
                    <span className="ml-xxs text-muted-soft">{r.unit}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="mt-auto">
          <p className="font-display text-[44px] leading-none text-hairline">—</p>
          <p className="mt-xxs text-caption text-muted-soft">No reading yet</p>
        </div>
      )}
    </article>
  );
}

export function SampleBoard({
  samples,
  measurements,
  previousById = {},
  loading,
}: {
  samples: SampleInfo[];
  measurements: MeasurementRow[];
  previousById?: Record<string, number>;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="min-h-[168px] rounded-lg border border-hairline p-lg">
            <div className="skeleton h-4 w-16" />
            <div className="skeleton mt-xl h-10 w-24" />
            <div className="skeleton mt-xs h-3 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (samples.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-hairline px-lg py-xl text-body-sm text-muted-soft">
        No samples registered for this experiment.
      </p>
    );
  }

  return (
    <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
      {samples.map((sample) => (
        <Card
          key={sample.id}
          sample={sample}
          readings={readingsFor(sample.sample_code, measurements)}
          previousById={previousById}
        />
      ))}
    </div>
  );
}
