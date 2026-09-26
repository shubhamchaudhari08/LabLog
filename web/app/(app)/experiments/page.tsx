'use client';

/** Every experiment this account owns, filterable by state and searchable by code or name. */

import { useMemo, useState } from 'react';
import { usePageCrumbs } from '@/components/shell/AppShell';
import { ExperimentListSkeleton, ExperimentRow } from '@/components/workspace/ExperimentList';
import { useExperimentList } from '@/lib/queries/useExperiment';

const FILTERS = ['ALL', 'RUNNING', 'COMPLETED', 'PAUSED', 'DRAFT', 'CANCELLED'] as const;

export default function ExperimentsPage() {
  usePageCrumbs([{ label: 'Experiments' }]);
  const experiments = useExperimentList();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const out: Record<string, number> = { ALL: experiments.data?.length ?? 0 };
    for (const e of experiments.data ?? []) out[e.status] = (out[e.status] ?? 0) + 1;
    return out;
  }, [experiments.data]);

  const rows = (experiments.data ?? []).filter((e) => {
    if (filter !== 'ALL' && e.status !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || e.experiment_code.toLowerCase().includes(q) || e.name.toLowerCase().includes(q);
  });

  return (
    <main id="main" className="page">
      <header className="animate-rise">
        <h1 className="page-title">Experiments</h1>
        <p className="mt-xs max-w-[56ch] text-body-md text-muted">
          Every run and the protocol behind it. Open a running experiment to record by voice.
        </p>
      </header>

      <div className="mt-xl flex flex-wrap items-center gap-md">
        <div className="flex flex-wrap gap-xxs rounded-lg bg-surface-card p-xxs" role="tablist" aria-label="Filter by status">
          {FILTERS.filter((f) => f === 'ALL' || counts[f]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`tab ${filter === f ? 'tab-active' : ''}`}
            >
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
              <span className="tabular ml-xs text-caption text-muted-soft">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by code or name"
          aria-label="Search experiments"
          className="input ml-auto max-w-[280px]"
        />
      </div>

      <div className="card mt-md overflow-hidden">
        {experiments.isLoading ? (
          <ExperimentListSkeleton rows={6} />
        ) : experiments.isError ? (
          <p className="px-lg py-xl text-body-sm text-error">Could not load experiments. Refresh to try again.</p>
        ) : rows.length ? (
          <ul className="divide-y divide-hairline-soft">
            {rows.map((experiment, i) => (
              <ExperimentRow key={experiment.id} experiment={experiment} index={i} />
            ))}
          </ul>
        ) : (
          <p className="px-lg py-xl text-body-sm text-muted">
            {experiments.data?.length ? 'No experiments match that filter.' : 'No experiments yet. Run the seed to create the demo set.'}
          </p>
        )}
      </div>
    </main>
  );
}
