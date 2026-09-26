'use client';

/**
 * History: every experiment this account owns, as a table you can filter by
 * state, protocol and date and sort by date or code (specs/003-post-mvp-features
 * FR-211). Finished runs open as a read-only record; live ones open the bench.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { usePageCrumbs } from '@/components/shell/AppShell';
import { ExperimentListSkeleton } from '@/components/workspace/ExperimentList';
import { StatusBadge } from '@/components/workspace/StatusBadge';
import { IconPlus } from '@/components/icons';
import { useExperimentList, useProtocolList } from '@/lib/queries/useExperiment';
import { experimentHref, filterAndSortExperiments, runDate, type HistorySort } from '@/lib/history';

const FILTERS = ['ALL', 'RUNNING', 'COMPLETED', 'PAUSED', 'READY', 'DRAFT', 'CANCELLED'] as const;

function SortHeader({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: HistorySort['key'];
  sort: HistorySort;
  onSort: (s: HistorySort) => void;
}) {
  const active = sort.key === column;
  return (
    <th
      scope="col"
      className="px-md py-xs font-medium"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort({ key: column, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })}
        className={`inline-flex items-center gap-xxs transition-colors hover:text-ink ${active ? 'text-ink' : ''}`}
      >
        {label}
        <span aria-hidden className="text-[10px]">
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

export default function ExperimentsPage() {
  usePageCrumbs([{ label: 'Experiments' }]);
  const experiments = useExperimentList();
  const protocols = useProtocolList();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL');
  const [protocolId, setProtocolId] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<HistorySort>({ key: 'date', dir: 'desc' });

  const counts = useMemo(() => {
    const out: Record<string, number> = { ALL: experiments.data?.length ?? 0 };
    for (const e of experiments.data ?? []) out[e.status] = (out[e.status] ?? 0) + 1;
    return out;
  }, [experiments.data]);

  const q = query.trim().toLowerCase();
  const rows = filterAndSortExperiments(
    (experiments.data ?? []).filter(
      (e) => !q || e.experiment_code.toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
    ),
    { status: filter, protocolId, from: from || undefined, to: to || undefined },
    sort,
  );
  const filtered = filter !== 'ALL' || protocolId !== 'ALL' || from || to || q;

  return (
    <main id="main" className="page">
      <header className="flex flex-wrap items-end justify-between gap-md animate-rise">
        <div>
          <h1 className="page-title">Experiments</h1>
          <p className="mt-xs max-w-[56ch] text-body-md text-muted">
            Every run and the protocol behind it. Finished runs open as a record; running ones open at the bench.
          </p>
        </div>
        <Link href="/experiments/new" className="btn-primary">
          <IconPlus className="h-4 w-4" />
          New experiment
        </Link>
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

      <div className="mt-sm flex flex-wrap items-end gap-md text-body-sm">
        <label className="flex flex-col gap-xxs">
          <span className="text-caption text-muted">Protocol</span>
          <select value={protocolId} onChange={(e) => setProtocolId(e.target.value)} className="input min-w-[200px]">
            <option value="ALL">All protocols</option>
            {protocols.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.protocol_code} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xxs">
          <span className="text-caption text-muted">From</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-xxs">
          <span className="text-caption text-muted">To</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="input" />
        </label>
        {filtered && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setFilter('ALL');
              setProtocolId('ALL');
              setFrom('');
              setTo('');
              setQuery('');
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="card mt-md overflow-x-auto">
        {experiments.isLoading ? (
          <ExperimentListSkeleton rows={6} />
        ) : experiments.isError ? (
          <p className="px-lg py-xl text-body-sm text-error">Could not load experiments. Refresh to try again.</p>
        ) : rows.length ? (
          <table className="w-full min-w-[720px] text-left text-body-sm">
            <thead className="border-b border-hairline text-caption text-muted">
              <tr>
                <SortHeader label="Code" column="code" sort={sort} onSort={setSort} />
                <th scope="col" className="px-md py-xs font-medium">
                  Name
                </th>
                <th scope="col" className="px-md py-xs font-medium">
                  Protocol
                </th>
                <SortHeader label="Date" column="date" sort={sort} onSort={setSort} />
                <th scope="col" className="px-md py-xs font-medium">
                  Status
                </th>
                <th scope="col" className="px-md py-xs text-right font-medium">
                  Deviations
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {rows.map((e) => {
                const date = runDate(e);
                const deviations = e.deviations?.[0]?.count ?? 0;
                const href = experimentHref(e);
                return (
                  <tr key={e.id} className="group transition-colors hover:bg-surface-soft">
                    <td className="px-md py-sm">
                      <Link href={href} className="font-mono font-medium text-ink group-hover:text-primary">
                        {e.experiment_code}
                      </Link>
                    </td>
                    <td className="max-w-[280px] truncate px-md py-sm text-body">
                      <Link href={href} tabIndex={-1}>
                        {e.name}
                      </Link>
                    </td>
                    <td className="px-md py-sm text-muted">
                      {e.protocols ? (
                        <>
                          <span className="font-mono">{e.protocols.protocol_code}</span> {e.protocols.version}
                        </>
                      ) : (
                        <span className="text-muted-soft">None</span>
                      )}
                    </td>
                    <td className="tabular whitespace-nowrap px-md py-sm text-muted">
                      {date ? new Date(date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-md py-sm">
                      <StatusBadge status={e.status} />
                    </td>
                    <td className={`tabular px-md py-sm text-right ${deviations ? 'text-warning' : 'text-muted-soft'}`}>
                      {deviations}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="px-lg py-xl text-body-sm text-muted">
            {experiments.data?.length ? 'No experiments match these filters.' : 'No experiments yet. Run the seed to create the demo set.'}
          </p>
        )}
      </div>
    </main>
  );
}
