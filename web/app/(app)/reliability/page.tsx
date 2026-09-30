'use client';

/**
 * Measured reliability. Every number here comes from web/public/metrics.json
 * (the latest run) and web/public/eval-history.json (every run), both written
 * only by a complete run of api/eval/run.py — so "how did you measure that?"
 * has a one-line answer. Failures are shown on purpose: a page of only passes
 * reads as marketing (specs/003-post-mvp-features/contracts/eval-runs.md).
 */

import { useEffect, useMemo, useState } from 'react';
import { usePageCrumbs } from '@/components/shell/AppShell';
import { detailsToCsv, download, type Detail, type EvalRun, type HistoryEntry } from '@/lib/evalReport';

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const title = (key: string) => key.replaceAll('_', ' ');

// Trend series, in DESIGN.md tokens: status-done-dot (teal) for completion and
// deviation-text (amber) for false records, keeping clay off status (D-16).
// Measured 2026-09-28: 3.22:1 and 4.93:1 on the canvas; simulated ΔE76 44.7
// (protan) and 48.8 (deutan) between them. Identity is also carried by the
// legend and direct labels, never by colour alone.
const SERIES = [
  { key: 'task_completion_rate', label: 'Task completion', color: '#4f9483' },
  { key: 'false_record_creation_rate', label: 'False-record rate', color: '#9a5a14' },
] as const;

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function RunBadge({ run }: { run: EvalRun }) {
  return (
    <div className="mt-sm flex flex-wrap items-center gap-xs text-caption">
      <span className="badge badge">Last run</span>
      <span className="font-mono text-body">{run.run_id ?? run.git_sha}</span>
      <span className="text-muted">
        · {run.scenario_count} scenarios · {run.model} · commit <span className="font-mono">{run.git_sha}</span> ·{' '}
        {new Date(run.generated_at).toLocaleString()}
      </span>
    </div>
  );
}

function MetricList({ metrics }: { metrics: EvalRun['metrics'] }) {
  return (
    <section className="card mt-lg animate-slide-up divide-y divide-hairline-soft overflow-hidden">
      {Object.entries(metrics).map(([name, m]) => {
        const good = m.value === null ? null : m.lower_is_better ? m.value === 0 : m.value >= 0.95;
        return (
          <div key={name} className="grid grid-cols-[1fr_auto] items-center gap-md px-lg py-sm">
            <div>
              <p className="text-body-md capitalize text-ink">
                {title(name)}
                {m.lower_is_better && <span className="ml-xs text-caption normal-case text-muted">target 0</span>}
              </p>
              {/* Rates where lower is better are not drawn as bars beside accuracies. */}
              {m.value !== null && !m.lower_is_better && (
                <div className="mt-xs h-1.5 overflow-hidden rounded-pill bg-surface-muted">
                  <div
                    className={`h-full rounded-pill transition-[width] duration-700 ${good === false ? 'bg-deviation-text' : 'bg-status-done-dot'}`}
                    style={{ width: pct(m.value) }}
                  />
                </div>
              )}
            </div>
            <p className={`tabular font-display text-numeral-sm ${good === false ? 'text-deviation-text' : 'text-ink'}`}>
              {m.value === null ? 'n/a' : pct(m.value)}
              <span className="ml-xs font-sans text-caption text-muted">
                {m.passed}/{m.total}
              </span>
            </p>
          </div>
        );
      })}
    </section>
  );
}

function CategoryBars({ byCategory }: { byCategory: NonNullable<EvalRun['by_category']> }) {
  const rows = Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b));
  return (
    <section className="card mt-md px-lg py-md">
      <h2 className="text-title-sm text-ink">By category</h2>
      <ul className="mt-sm space-y-sm">
        {rows.map(([name, c]) => {
          const share = c.total ? c.passed / c.total : 0;
          return (
            <li key={name} className="grid grid-cols-[140px_1fr_auto] items-center gap-md text-body-md">
              <span className="truncate capitalize text-body">{title(name)}</span>
              <div className="h-2 overflow-hidden rounded-pill bg-surface-muted" aria-hidden>
                <div
                  className={`h-full rounded-pill ${share < 1 ? 'bg-deviation-text' : 'bg-status-done-dot'}`}
                  style={{ width: `${share * 100}%` }}
                />
              </div>
              <span className="tabular text-caption text-muted">
                {c.passed}/{c.total}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One line per series across every committed run. One y-axis (0–100%); hover shows both values. */
function Trend({ history }: { history: HistoryEntry[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const pad = { l: 40, r: 110, t: 12, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (history.length === 1 ? iw / 2 : (i / (history.length - 1)) * iw);
  const y = (v: number) => pad.t + (1 - v) * ih;
  const value = (run: HistoryEntry, key: string) => run.metrics?.[key]?.value ?? null;

  if (!history.length) return null;
  const last = history.length - 1;

  return (
    <section className="card mt-md px-lg py-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="text-title-sm text-ink">Trend across runs</h2>
        <ul className="flex gap-md text-caption text-body" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-xxs">
              <span className="inline-block h-[3px] w-4 rounded-pill" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mt-sm">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Task completion and false-record rate per eval run">
          {[0, 0.5, 1].map((g) => (
            <g key={g}>
              <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="#efe9df" strokeWidth={1} />
              <text x={pad.l - 8} y={y(g) + 4} textAnchor="end" className="fill-muted text-[11px]">
                {g * 100}%
              </text>
            </g>
          ))}
          {history.map((run, i) => (
            <text key={run.run_id ?? i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted font-mono text-[10px]">
              {run.git_sha}
            </text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="#6b655b" strokeWidth={1} strokeDasharray="3 3" />}

          {SERIES.map((s) => {
            const points = history
              .map((run, i) => ({ i, v: value(run, s.key) }))
              .filter((p): p is { i: number; v: number } => p.v !== null);
            const lastPoint = points[points.length - 1];
            return (
              <g key={s.key}>
                <polyline
                  points={points.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {points.map((p) => (
                  <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={4} fill={s.color} stroke="#fffdf9" strokeWidth={2} />
                ))}
                {lastPoint && lastPoint.i === last && (
                  <text x={x(last) + 10} y={y(lastPoint.v) + 4} className="fill-body text-[11px]">
                    {s.label} {pct(lastPoint.v)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Hit targets: a full-height column per run, wider than any mark. */}
          {history.map((run, i) => {
            const half = history.length === 1 ? iw / 2 : iw / (history.length - 1) / 2;
            return (
              <rect
                key={`hit-${run.run_id ?? i}`}
                x={x(i) - half}
                y={pad.t}
                width={half * 2}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 rounded-md border border-hairline bg-canvas px-sm py-xs text-caption shadow-sm"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: 'translateX(-50%)' }}
            role="status"
          >
            <p className="font-mono text-muted">
              {history[hover].git_sha} · {when(history[hover].generated_at)}
            </p>
            {SERIES.map((s) => {
              const v = value(history[hover], s.key);
              return (
                <p key={s.key} className="tabular text-body">
                  <span className="mr-xxs inline-block h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
                  {s.label}: {v === null ? 'n/a' : pct(v)}
                </p>
              );
            })}
          </div>
        )}
      </div>

      {/* The table view of the same data, for anyone not reading the chart. */}
      <details className="mt-sm text-caption">
        <summary className="cursor-pointer text-muted">Show runs as a table</summary>
        <table className="mt-xs w-full text-left">
          <thead className="text-muted">
            <tr>
              <th className="py-xxs font-medium">Run</th>
              <th className="font-medium">Model</th>
              <th className="font-medium">Scenarios</th>
              {SERIES.map((s) => (
                <th key={s.key} className="font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular text-body">
            {history.map((run, i) => (
              <tr key={run.run_id ?? i} className="border-t border-hairline-soft">
                <td className="py-xxs font-mono">{run.run_id ?? run.git_sha}</td>
                <td>{run.model}</td>
                <td>{run.scenario_count}</td>
                {SERIES.map((s) => {
                  const v = value(run, s.key);
                  return <td key={s.key}>{v === null ? 'n/a' : pct(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

const TABS = ['All', 'Passed', 'Failed'] as const;

function DrillDown({ details }: { details: Detail[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Failed');
  const [category, setCategory] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const categories = useMemo(() => Array.from(new Set(details.map((d) => d.category))).sort(), [details]);

  const rows = details.filter(
    (d) =>
      (tab === 'All' || (tab === 'Passed') === d.passed) && (category === 'all' || d.category === category),
  );
  const count = (t: (typeof TABS)[number]) => details.filter((d) => t === 'All' || (t === 'Passed') === d.passed).length;

  return (
    <section className="mt-xl">
      <div className="flex flex-wrap items-center gap-md">
        <h2 className="font-sans text-title-lg">Scenarios</h2>
        <div className="flex gap-xxs rounded-lg bg-surface-muted p-xxs" role="tablist" aria-label="Filter by outcome">
          {TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`tab ${tab === t ? 'tab-active' : ''}`}>
              {t}
              <span className="tabular ml-xs text-caption text-muted">{count(t)}</span>
            </button>
          ))}
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input ml-auto max-w-[220px]" aria-label="Filter by category">
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {title(c)}
            </option>
          ))}
        </select>
      </div>

      <div className="card mt-sm overflow-hidden">
        {rows.length ? (
          <ul className="divide-y divide-hairline-soft">
            {rows.map((d) => (
              <li key={d.scenario_id}>
                <button
                  type="button"
                  onClick={() => setOpen(open === d.scenario_id ? null : d.scenario_id)}
                  aria-expanded={open === d.scenario_id}
                  className="grid w-full grid-cols-[auto_90px_1fr_auto] items-center gap-md px-lg py-sm text-left text-body-md hover:bg-surface-rail"
                >
                  <span className={`badge ${d.passed ? '' : 'text-danger-text'}`}>{d.passed ? 'Pass' : 'Fail'}</span>
                  <span className="font-mono text-caption text-muted">{d.scenario_id}</span>
                  <span className="truncate text-ink">“{d.utterance}”</span>
                  <span className="text-caption capitalize text-muted">{title(d.category)}</span>
                </button>
                {open === d.scenario_id && (
                  <div className="grid gap-sm bg-surface-rail px-lg py-sm text-caption md:grid-cols-2">
                    <div>
                      <p className="text-muted">Expected</p>
                      <pre className="mt-xxs whitespace-pre-wrap break-words font-mono text-body">{JSON.stringify(d.expected, null, 2)}</pre>
                    </div>
                    <div>
                      <p className="text-muted">What the agent did</p>
                      {d.calls.length ? (
                        <ol className="mt-xxs space-y-xxs">
                          {d.calls.map((c, i) => (
                            <li key={i} className="font-mono text-body">
                              <span className={c.success ? 'text-ink' : 'text-danger-text'}>{c.tool}</span>{' '}
                              {c.success ? '✓' : `✗ ${c.error ?? ''}`}
                              <span className="block break-words text-muted">{JSON.stringify(c.args)}</span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-xxs text-body">No tool call.</p>
                      )}
                      <p className="mt-xs text-muted">Reply</p>
                      <p className="mt-xxs text-body">{d.reply || '—'}</p>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-lg py-md text-body-md text-muted">No scenarios match.</p>
        )}
      </div>
    </section>
  );
}

/** Runs written before 003 have no `details`; show their failures as before. */
function LegacyFailures({ failures }: { failures: EvalRun['failures'] }) {
  return (
    <>
      <h2 className="mt-xl font-sans text-title-lg">Failures ({failures.length})</h2>
      <ul className="mt-sm space-y-xs">
        {failures.map((f) => (
          <li key={f.scenario_id} className="card px-lg py-sm text-body-md">
            <span className="font-mono text-caption text-muted">{f.scenario_id}</span> “{f.utterance}”
            <p className="mt-xxs text-caption text-muted">
              {JSON.stringify(f.actual)} {f.note}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Reliability() {
  usePageCrumbs([{ label: 'Reliability' }]);
  const [data, setData] = useState<{ run: EvalRun; raw: string } | null | 'missing'>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    fetch('/metrics.json', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) return 'missing' as const;
        const raw = await r.text();
        return { run: JSON.parse(raw) as EvalRun, raw };
      })
      .then(setData)
      .catch(() => setData('missing'));
    fetch('/eval-history.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((h) => setHistory(Array.isArray(h) ? h : []))
      .catch(() => setHistory([]));
  }, []);

  if (data === null)
    return (
      <main id="main" className="page max-w-[960px]">
        <div className="skeleton h-9 w-64" />
        <div className="card mt-lg divide-y divide-hairline-soft">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="px-lg py-sm">
              <div className="skeleton h-4 w-48" />
            </div>
          ))}
        </div>
      </main>
    );

  if (data === 'missing')
    return (
      <main id="main" className="page max-w-[960px]">
        <h1 className="page-title animate-rise">Reliability</h1>
        {/* Never a placeholder figure that could be mistaken for a measurement. */}
        <p className="mt-sm max-w-[52ch] text-body-md text-muted">
          No evaluation has been run yet, so there are no numbers to show. Running the harness writes them here.
        </p>
        <p className="mt-md inline-block rounded-md border border-hairline bg-surface-rail px-sm py-xs font-mono text-body-md text-body">
          cd api && python -m eval.run
        </p>
      </main>
    );

  const { run, raw } = data;
  const name = run.run_id ?? `eval-${run.git_sha}`;

  return (
    <main id="main" className="page max-w-[960px]">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="page-title animate-rise">Reliability</h1>
          <RunBadge run={run} />
        </div>
        <div className="flex gap-xs">
          <button type="button" className="btn-secondary" onClick={() => download(`${name}.json`, raw, 'application/json')}>
            Download JSON
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!run.details}
            title={run.details ? undefined : 'This run predates per-scenario details'}
            onClick={() => run.details && download(`${name}.csv`, detailsToCsv(run.details), 'text/csv')}
          >
            Download CSV
          </button>
        </div>
      </div>

      <MetricList metrics={run.metrics} />
      <Trend history={history} />
      {run.by_category && <CategoryBars byCategory={run.by_category} />}
      {run.details ? <DrillDown details={run.details} /> : <LegacyFailures failures={run.failures} />}
    </main>
  );
}

