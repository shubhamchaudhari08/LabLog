'use client';

/**
 * The hero surface.
 *
 * A measurement cell arriving the instant it is spoken is what the whole
 * product is selling, so two decisions here are deliberate:
 *
 *   - Values are tabular-nums and right-aligned, so a number never changes
 *     width as it lands. A value that jiggles undercuts the precision claim.
 *   - The landing animation is a coral wash that recedes (DESIGN.md's signature
 *     accent) rather than a flash that blinks. The value should feel *placed*,
 *     not alarmed.
 *
 * A corrected value shows its predecessor inline. That is the audit trail made
 * visible — the thing that separates this from a spreadsheet.
 */

import { useEffect, useRef, useState } from 'react';
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

function Row({ measurement }: { measurement: MeasurementRow }) {
  const isNew = useRef(true);
  useEffect(() => {
    isNew.current = false;
  }, []);

  const corrected = Boolean(measurement.correction_reason);

  return (
    <tr
      className={`border-b border-hairline-soft last:border-0 ${
        isNew.current ? 'animate-cell-land' : ''
      }`}
    >
      <td className="py-sm pl-lg pr-md">
        <span className="text-title-sm text-ink">
          {measurement.samples?.sample_code ?? '—'}
        </span>
      </td>
      <td className="px-md py-sm text-body-sm capitalize text-body">
        {measurement.measurement_type}
      </td>
      <td className="px-md py-sm text-right">
        <span className="tabular text-title-md text-ink">{measurement.value}</span>
        <span className="ml-xxs text-body-sm text-muted">{measurement.unit}</span>
      </td>
      <td className="px-md py-sm text-right text-caption text-muted-soft">
        {measurement._optimistic ? (
          <UnconfirmedMark since={measurement.recorded_at} />
        ) : (
          formatTime(measurement.recorded_at)
        )}
      </td>
      <td className="py-sm pl-md pr-lg">
        {corrected && (
          <span className="badge" title={measurement.correction_reason ?? ''}>
            corrected
          </span>
        )}
      </td>
    </tr>
  );
}

export function MeasurementTable({
  measurements,
  loading,
}: {
  measurements: MeasurementRow[];
  loading?: boolean;
}) {
  return (
    <section className="panel overflow-hidden">
      <header className="panel-header">
        <h2 className="panel-label">Measurements</h2>
        <span className="text-caption text-muted-soft tabular">{measurements.length} recorded</span>
      </header>

      {loading ? (
        <p className="px-lg py-xl text-body-sm text-muted-soft">Loading…</p>
      ) : measurements.length === 0 ? (
        <p className="px-lg py-xl text-body-sm text-muted-soft">
          Nothing recorded yet. Say something like “A17 is 4.2 Celsius”.
        </p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline">
              <th className="py-xs pl-lg pr-md text-caption-upper uppercase text-muted-soft">
                Sample
              </th>
              <th className="px-md py-xs text-caption-upper uppercase text-muted-soft">Type</th>
              <th className="px-md py-xs text-right text-caption-upper uppercase text-muted-soft">
                Value
              </th>
              <th className="px-md py-xs text-right text-caption-upper uppercase text-muted-soft">
                Time
              </th>
              <th className="py-xs pl-md pr-lg" />
            </tr>
          </thead>
          <tbody>
            {measurements.map((measurement) => (
              <Row key={measurement.id} measurement={measurement} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
