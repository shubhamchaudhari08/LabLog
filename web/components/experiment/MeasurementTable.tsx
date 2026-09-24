'use client';

/**
 * The hero surface.
 *
 * A measurement cell arriving the instant it is spoken is what the whole
 * product is selling, so several decisions here are deliberate:
 *
 *   - Values are tabular-nums and right-aligned, so a number never changes
 *     width as it lands. A value that jiggles undercuts the precision claim.
 *   - The landing animation is a coral wash that recedes (DESIGN.md's signature
 *     accent) rather than a flash that blinks. The value should feel *placed*,
 *     not alarmed.
 *   - Rows stagger on first paint instead of all appearing at once, which reads
 *     as a list being laid down rather than a page snapping into place.
 *
 * A corrected value shows its predecessor inline. That is the audit trail made
 * visible — the thing that separates this from a spreadsheet.
 */

import { useEffect, useState } from 'react';
import type { MeasurementRow } from '@/lib/queries/useExperiment';
import { OPTIMISTIC_TIMEOUT_MS } from '@/lib/queries/useExperiment';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function UnconfirmedMark({ since }: { since: string }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const elapsed = Date.now() - new Date(since).getTime();
    const remaining = Math.max(0, OPTIMISTIC_TIMEOUT_MS - elapsed);
    const timer = setTimeout(() => setStale(true), remaining);
    return () => clearTimeout(timer);
  }, [since]);

  // Never silently keep an unconfirmed row looking stored. If the change stream
  // has not confirmed it, say so.
  if (!stale) return <span className="text-muted-soft">saving…</span>;
  return <span className="text-warning">unconfirmed</span>;
}

function Row({
  measurement,
  previous,
  index,
}: {
  measurement: MeasurementRow;
  previous?: number;
  index: number;
}) {
  const corrected = Boolean(measurement.correction_reason);

  return (
    <tr
      className="animate-cell-land border-b border-hairline-soft transition-colors last:border-0 hover:bg-surface-soft/60"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <td className="py-sm pl-lg pr-md">
        <span className="font-mono text-body-sm font-medium text-ink">
          {measurement.samples?.sample_code ?? '—'}
        </span>
      </td>
      <td className="px-md py-sm text-body-sm capitalize text-muted">
        {measurement.measurement_type}
      </td>
      <td className="px-md py-sm text-right">
        <span className="tabular text-title-md font-semibold text-ink">{measurement.value}</span>
        <span className="ml-xxs text-body-sm text-muted-soft">{measurement.unit}</span>
      </td>
      <td className="px-md py-sm text-right text-caption text-muted-soft">
        {measurement._optimistic ? (
          <UnconfirmedMark since={measurement.recorded_at} />
        ) : (
          <time dateTime={measurement.recorded_at} className="tabular">
            {formatTime(measurement.recorded_at)}
          </time>
        )}
      </td>
      <td className="py-sm pl-md pr-lg text-right">
        {/* The audit trail made visible: the old value stays on screen. */}
        {corrected && (
          <span className="badge tabular" title={measurement.correction_reason ?? ''}>
            {previous === undefined ? 'corrected' : `was ${previous}`}
          </span>
        )}
      </td>
    </tr>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-sm px-lg py-md" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-md">
          <div className="skeleton h-4 w-16" />
          <div className="skeleton h-4 w-24" />
          <div className="skeleton ml-auto h-5 w-14" />
          <div className="skeleton h-4 w-10" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-lg py-xl">
      <p className="text-title-sm text-ink">No measurements yet</p>
      <p className="mt-xxs max-w-[46ch] text-body-sm text-muted">
        Start the session and speak a reading. The value appears here before the agent finishes
        confirming it.
      </p>
      <p className="mt-md inline-flex items-center gap-xs rounded-md border border-dashed border-hairline bg-surface-soft px-sm py-xs font-mono text-body-sm text-body">
        <span aria-hidden className="text-primary">
          ▸
        </span>
        “A17 is 4.2 Celsius”
      </p>
    </div>
  );
}

export function MeasurementTable({
  measurements,
  previousById = {},
  loading,
}: {
  measurements: MeasurementRow[];
  /** measurement id -> value it superseded, from MEASUREMENT_CORRECTED events. */
  previousById?: Record<string, number>;
  loading?: boolean;
}) {
  const corrections = measurements.filter((m) => m.correction_reason).length;

  return (
    <section className="panel overflow-hidden" aria-labelledby="measurements-heading">
      <header className="panel-header">
        <h2 id="measurements-heading" className="panel-label">
          Measurements
        </h2>
        <span className="tabular text-caption text-muted-soft">
          {measurements.length} recorded
          {corrections > 0 && ` · ${corrections} corrected`}
        </span>
      </header>

      {loading ? (
        <SkeletonRows />
      ) : measurements.length === 0 ? (
        <EmptyState />
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-surface-soft/50">
              <th
                scope="col"
                className="py-xs pl-lg pr-md text-caption-upper uppercase text-muted-soft"
              >
                Sample
              </th>
              <th scope="col" className="px-md py-xs text-caption-upper uppercase text-muted-soft">
                Type
              </th>
              <th
                scope="col"
                className="px-md py-xs text-right text-caption-upper uppercase text-muted-soft"
              >
                Value
              </th>
              <th
                scope="col"
                className="px-md py-xs text-right text-caption-upper uppercase text-muted-soft"
              >
                Time
              </th>
              <th scope="col" className="py-xs pl-md pr-lg">
                <span className="sr-only">Correction</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {measurements.map((measurement, index) => (
              <Row
                key={measurement.id}
                index={index}
                measurement={measurement}
                previous={measurement.previous_value ?? previousById[measurement.id]}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
