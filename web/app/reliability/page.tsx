'use client';

/**
 * Measured reliability. Every number here comes from web/public/metrics.json,
 * written only by a complete run of api/eval/run.py — so "how did you measure
 * that?" has a one-line answer. Failures are shown on purpose: a page of only
 * passes reads as marketing.
 */

import { useEffect, useState } from 'react';

interface Metric {
  value: number | null;
  passed: number;
  total: number;
  lower_is_better?: boolean;
}

interface Metrics {
  generated_at: string;
  scenario_count: number;
  model: string;
  git_sha: string;
  metrics: Record<string, Metric>;
  failures: { scenario_id: string; utterance: string; actual: unknown; note: string }[];
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function Reliability() {
  const [data, setData] = useState<Metrics | null | 'missing'>(null);

  useEffect(() => {
    fetch('/metrics.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : 'missing'))
      .then(setData)
      .catch(() => setData('missing'));
  }, []);

  if (data === null) return <main className="px-lg py-section text-muted">Loading…</main>;

  if (data === 'missing')
    return (
      <main className="mx-auto max-w-[720px] px-lg py-section">
        <h1 className="text-display-sm">Reliability</h1>
        {/* Never a placeholder figure that could be mistaken for a measurement. */}
        <p className="mt-md text-body-md text-muted">
          No evaluation has been run yet. Run{' '}
          <code className="font-mono text-code text-ink">python -m eval.run</code> in{' '}
          <code className="font-mono text-code text-ink">api/</code>.
        </p>
      </main>
    );

  return (
    <main className="mx-auto max-w-[880px] px-lg py-xl">
      <h1 className="text-display-md">Reliability</h1>
      <p className="mt-xs text-body-sm text-muted">
        {data.scenario_count} scenarios · {data.model} · {new Date(data.generated_at).toLocaleString()} ·
        commit {data.git_sha}
      </p>

      <section className="panel mt-lg divide-y divide-hairline-soft">
        {Object.entries(data.metrics).map(([name, m]) => {
          const good = m.value === null ? null : m.lower_is_better ? m.value === 0 : m.value >= 0.95;
          return (
            <div key={name} className="grid grid-cols-[1fr_auto] items-center gap-md px-lg py-sm">
              <div>
                <p className="text-body-sm capitalize text-ink">{name.replaceAll('_', ' ')}</p>
                {/* Rates where lower is better are not drawn as bars beside accuracies. */}
                {m.value !== null && !m.lower_is_better && (
                  <div className="mt-xxs h-1.5 rounded-pill bg-surface-card">
                    <div className="h-full rounded-pill bg-primary" style={{ width: pct(m.value) }} />
                  </div>
                )}
              </div>
              <p className={`tabular text-title-sm ${good === false ? 'text-error' : 'text-ink'}`}>
                {m.value === null ? 'n/a' : pct(m.value)}
                <span className="ml-xs text-caption text-muted-soft">
                  {m.passed}/{m.total}
                </span>
              </p>
            </div>
          );
        })}
      </section>

      <h2 className="mt-xl text-title-lg">Failures ({data.failures.length})</h2>
      <ul className="mt-sm space-y-xs">
        {data.failures.map((f) => (
          <li key={f.scenario_id} className="panel px-lg py-sm text-body-sm">
            <span className="font-mono text-caption text-muted">{f.scenario_id}</span> “{f.utterance}”
            <p className="mt-xxs text-caption text-muted">
              {JSON.stringify(f.actual)} {f.note}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
