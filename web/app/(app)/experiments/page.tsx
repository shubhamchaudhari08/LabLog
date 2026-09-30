'use client';

/**
 * Experiments (specs/005 US4, PDF frame 3; history filters from specs/003
 * FR-211): every run this account owns, filterable by status, protocol, date
 * and text, sortable by date or code. Clicking a row previews it in the
 * drawer; Enter or a double-click opens it. Finished runs open as a record,
 * live ones at the bench or the workspace (contracts/ui-routes.md §3).
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePageCrumbs } from '@/components/shell/AppShell';
import { StatusPill } from '@/components/ui/StatusPill';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { ButtonLink } from '@/components/ui/Button';
import { IconClose, IconMic, IconPlus, IconSearch } from '@/components/icons';
import { useExperimentList, useProtocolList, type ExperimentSummary } from '@/lib/queries/useExperiment';
import { filterAndSortExperiments, runDate, type HistorySort } from '@/lib/history';
import { runProgress } from '@/lib/ui/runProgress';

const FILTERS = ['ALL', 'RUNNING', 'COMPLETED', 'PAUSED', 'READY', 'DRAFT', 'CANCELLED'] as const;
type Filter = (typeof FILTERS)[number];
const CLOSED = new Set(['COMPLETED', 'CANCELLED']);

const longDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Where a run opens, and what the drawer's one action says (ui-routes §3). */
function primaryAction(e: ExperimentSummary): { label: string; href: string } {
  if (e.status === 'RUNNING') return { label: 'Resume at the bench', href: `/dashboard/experiments/${e.id}/bench` };
  if (CLOSED.has(e.status)) return { label: 'Open record', href: `/experiments/${e.id}` };
  return { label: 'Open workspace', href: `/dashboard/experiments/${e.id}` };
}

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
    <th scope="col" className="px-[18px] py-sm font-medium" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
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

function Drawer({ experiment, onClose }: { experiment: ExperimentSummary; onClose?: () => void }) {
  const router = useRouter();
  const progress = runProgress(experiment);
  const action = primaryAction(experiment);
  const deviations = experiment.deviations?.[0]?.count ?? 0;
  const protocol = experiment.protocols;

  return (
    <div className="p-[28px] lg:px-[28px] lg:py-[34px]">
      <div className="flex items-center gap-sm">
        <span className="font-mono text-code text-body">{experiment.experiment_code}</span>
        <StatusPill status={experiment.status} live />
        {onClose && (
          <button type="button" onClick={onClose} className="icon-btn ml-auto" aria-label="Close preview">
            <IconClose className="h-5 w-5" />
          </button>
        )}
      </div>
      <h2 className="mt-sm line-clamp-2 font-display text-display-sm text-ink" title={experiment.name}>
        {experiment.name}
      </h2>

      <div className="mt-lg">
        <div className="flex items-baseline justify-between text-body-md">
          <span className="text-body">Progress</span>
          <span className="text-muted">
            {progress.total ? (progress.currentLabel === 'Complete' ? 'Complete' : `On step ${progress.currentLabel.replace(' steps', '')}`) : 'No protocol'}
          </span>
        </div>
        {progress.segments.length > 0 && (
          <div className="mt-xs flex gap-[6px]">
            {progress.segments.map((s, i) => (
              <span
                key={i}
                className={`h-[5px] flex-1 rounded-pill ${s === 'done' ? 'bg-status-done-dot' : s === 'current' ? 'bg-primary' : 'bg-surface-muted-strong'}`}
              />
            ))}
          </div>
        )}
      </div>

      <dl className="mt-lg grid grid-cols-[110px_minmax(0,1fr)] gap-y-sm text-body-md">
        <dt className="text-body">Protocol</dt>
        <dd className="truncate font-mono text-code text-ink">
          {protocol?.protocol_code ? `${protocol.protocol_code} ${protocol.version ?? ''}` : 'None'}
        </dd>
        <dt className="text-body">Started</dt>
        <dd className="text-ink">{longDate(experiment.started_at)}</dd>
        {experiment.completed_at && (
          <>
            <dt className="text-body">Completed</dt>
            <dd className="text-ink">{longDate(experiment.completed_at)}</dd>
          </>
        )}
        <dt className="text-body">Deviations</dt>
        <dd className={deviations ? 'text-deviation-text' : 'text-ink'}>{deviations || 'None'}</dd>
      </dl>

      <ButtonLink href={action.href} size="lg" className="mt-lg w-full">
        {experiment.status === 'RUNNING' && <IconMic className="h-[18px] w-[18px]" />}
        {action.label}
      </ButtonLink>
      {!CLOSED.has(experiment.status) && (
        <button
          type="button"
          onClick={() => router.push(`/dashboard/experiments/${experiment.id}?voice=1`)}
          className="mt-sm flex h-[44px] w-full items-center justify-center gap-xs rounded-lg border border-dashed border-border-strong text-body-md text-body transition-colors hover:border-primary-border-soft hover:text-ink"
        >
          <IconMic className="h-4 w-4 text-primary" />
          Ask about this run by voice
        </button>
      )}
    </div>
  );
}

export default function ExperimentsPage() {
  usePageCrumbs([{ label: 'Experiments' }]);
  const router = useRouter();
  const experiments = useExperimentList();
  const protocols = useProtocolList();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [protocolId, setProtocolId] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<HistorySort>({ key: 'date', dir: 'desc' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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

  // The drawer shows the selected row; by default the first running run, else the first row.
  const selected =
    rows.find((e) => e.id === selectedId) ?? rows.find((e) => e.status === 'RUNNING') ?? rows[0] ?? null;
  useEffect(() => {
    if (selectedId && !rows.some((e) => e.id === selectedId)) setSelectedId(null);
  }, [rows, selectedId]);

  function select(e: ExperimentSummary) {
    setSelectedId(e.id);
    setSheetOpen(true);
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
      <main id="main" className="page min-w-0">
        <header className="flex animate-rise flex-wrap items-end justify-between gap-md">
          <div>
            <h1 className="page-title">Experiments</h1>
            <p className="mt-xs max-w-[60ch] text-body-lg text-body">
              Every run and the protocol behind it. Finished runs open as a record; running ones open at the bench.
            </p>
          </div>
          <ButtonLink href="/experiments/new">
            <IconPlus className="h-[18px] w-[18px]" />
            New experiment
          </ButtonLink>
        </header>

        <div className="mt-xl flex flex-wrap items-center gap-sm">
          <SegmentedTabs<Filter>
            label="Filter by status"
            value={filter}
            onChange={setFilter}
            tabs={FILTERS.filter((f) => f === 'ALL' || counts[f]).map((f) => ({
              value: f,
              label: f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase(),
              count: counts[f] ?? 0,
            }))}
          />
          <label className="flex h-[44px] items-center gap-xs rounded-lg border border-border-strong bg-surface-white pl-sm text-body-md">
            <span className="text-muted">Protocol</span>
            <select
              value={protocolId}
              onChange={(e) => setProtocolId(e.target.value)}
              className="h-full max-w-[220px] rounded-lg bg-transparent pr-sm text-ink focus:outline-none"
            >
              <option value="ALL">All protocols</option>
              {protocols.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.protocol_code} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <details className="relative">
            <summary className="btn-secondary cursor-pointer list-none text-body-md font-normal">
              {from || to ? `${from || '…'} – ${to || '…'}` : 'Dates'}
            </summary>
            <div className="absolute left-0 z-header mt-xs w-[280px] space-y-sm rounded-card border border-hairline bg-surface-card p-md shadow-tile-lift">
              <label className="block">
                <span className="mb-xxs block text-caption text-body">From</span>
                <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="input" />
              </label>
              <label className="block">
                <span className="mb-xxs block text-caption text-body">To</span>
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="input" />
              </label>
              {(from || to) && (
                <button type="button" className="btn-ghost w-full" onClick={() => { setFrom(''); setTo(''); }}>
                  Clear dates
                </button>
              )}
            </div>
          </details>
          <label className="relative ml-auto w-full max-w-[280px]">
            <span className="sr-only">Search experiments</span>
            <IconSearch className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code or name"
              className="input pl-[36px]"
            />
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

        <div className="list-panel mt-md overflow-x-auto">
          {experiments.isLoading ? (
            <ul aria-hidden>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <li key={i} className="list-row flex items-center gap-md">
                  <span className="skeleton h-4 w-28" />
                  <span className="skeleton h-4 flex-1" />
                </li>
              ))}
            </ul>
          ) : experiments.isError ? (
            <p className="px-[18px] py-xl text-body-md text-danger-text">Could not load experiments. Refresh to try again.</p>
          ) : rows.length ? (
            <table className="w-full min-w-[720px] text-left text-body-md">
              <thead className="border-b border-hairline text-caption text-muted">
                <tr>
                  <SortHeader label="Code" column="code" sort={sort} onSort={setSort} />
                  <th scope="col" className="px-[18px] py-sm font-medium">Name</th>
                  <th scope="col" className="px-[18px] py-sm font-medium">Protocol</th>
                  <SortHeader label="Date" column="date" sort={sort} onSort={setSort} />
                  <th scope="col" className="px-[18px] py-sm font-medium">Status</th>
                  <th scope="col" className="px-[18px] py-sm text-right font-medium">
                    <abbr title="Deviations" className="no-underline">Dev.</abbr>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const deviations = e.deviations?.[0]?.count ?? 0;
                  const isSelected = selected?.id === e.id;
                  return (
                    <tr
                      key={e.id}
                      tabIndex={0}
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => select(e)}
                      onDoubleClick={() => router.push(primaryAction(e).href)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') router.push(primaryAction(e).href);
                        if (event.key === ' ') {
                          event.preventDefault();
                          select(e);
                        }
                      }}
                      className={`h-[54px] cursor-pointer border-b border-hairline-soft transition-colors last:border-0 ${
                        isSelected ? 'list-row-selected' : 'hover:bg-surface-rail'
                      }`}
                    >
                      <td className="px-[18px] font-mono text-title-sm text-ink">{e.experiment_code}</td>
                      <td className="max-w-[240px] truncate px-[18px] text-ink" title={e.name}>
                        {e.name}
                      </td>
                      <td className="whitespace-nowrap px-[18px] font-mono text-code text-body">
                        {e.protocols ? `${e.protocols.protocol_code} ${e.protocols.version ?? ''}` : <span className="text-muted">None</span>}
                      </td>
                      <td className="tabular whitespace-nowrap px-[18px] text-body">{longDate(runDate(e))}</td>
                      <td className="px-[18px]">
                        <StatusPill status={e.status} />
                      </td>
                      <td className={`tabular px-[18px] text-right ${deviations ? 'text-deviation-text' : 'text-body'}`}>{deviations}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="px-[18px] py-xl text-body-md text-muted">
              {experiments.data?.length ? 'No experiments match these filters.' : 'No experiments yet. Run the seed to create the demo set.'}
            </p>
          )}
        </div>
        <p className="mt-sm text-caption text-muted">Click a row to preview it. Press Enter or double-click to open it.</p>
      </main>

      {/* The preview drawer: a right rail on desktop, a full-screen sheet below lg. */}
      {selected && (
        <>
          <aside
            aria-label="Run preview"
            className="sticky top-[68px] hidden h-[calc(100dvh-68px)] overflow-y-auto border-l border-hairline bg-surface-rail lg:block"
          >
            <Drawer experiment={selected} />
          </aside>
          {sheetOpen && (
            <div role="dialog" aria-modal aria-label="Run preview" className="fixed inset-0 z-overlay overflow-y-auto bg-surface-rail lg:hidden">
              <Drawer experiment={selected} onClose={() => setSheetOpen(false)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
