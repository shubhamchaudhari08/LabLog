'use client';

/**
 * Measured reliability. Every number here comes from web/public/metrics.json,
 * written only by a complete run of api/eval/run.py — so "how did you measure
 * that?" has a one-line answer. Failures are shown on purpose: a page of only
 * passes reads as marketing.
 */

import { useEffect, useState } from 'react';
import { TopNav } from '@/components/Chrome';

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

  if (data === null)
    return (
      <>
        <TopNav />
        <main id="main" className="mx-auto max-w-[880px] px-lg py-xl">
          <div className="skeleton h-9 w-64" />
          <div className="panel mt-lg divide-y divide-hairline-soft">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="px-lg py-sm">
                <div className="skeleton h-4 w-48" />
              </div>
            ))}
          </div>
        </main>
      </>
    );

  if (data === 'missing')
    return (
      <>
        <TopNav />
        <main id="main" className="mx-auto max-w-[720px] px-lg py-section">
          <h1 className="text-display-md">Reliability</h1>
        {/* Never a placeholder figure that could be mistaken for a measurement. */}
          <p className="mt-sm max-w-[52ch] text-body-md text-muted">
            No evaluation has been run yet, so there are no numbers to show. Running the harness
            writes them here.
          </p>
          <p className="mt-md inline-block rounded-md border border-hairline bg-surface-soft px-sm py-xs font-mono text-body-sm text-body">
            cd api && python -m eval.run
          </p>
        </main>
      </>
    );

  return (
    <>
      <TopNav />
      <main id="main" className="mx-auto max-w-[880px] px-lg pb-section pt-xl">
      <h1 className="text-display-md">Reliability</h1>
      <p className="mt-xs font-mono text-caption text-muted">
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
                  <div className="mt-xs h-1.5 overflow-hidden rounded-pill bg-surface-card">
                    <div
                      className={`h-full rounded-pill transition-[width] duration-700 ${
                        good === false ? 'bg-error' : 'bg-primary'
                      }`}
                      style={{ width: pct(m.value) }}
                    />
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
    </>
  );
}
