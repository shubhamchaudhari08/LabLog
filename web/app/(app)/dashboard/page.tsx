'use client';

/**
 * Overview: the running experiment, and the notebook behind it.
 *
 * The running experiment gets the only filled button on the page. From here the
 * demo is one click away, and the completed runs below are what make the record
 * read as a real notebook rather than a single seeded row.
 */

import Link from 'next/link';

import { usePageCrumbs, useCurrentUser } from '@/components/shell/AppShell';
import { ExperimentListSkeleton, ExperimentRow } from '@/components/workspace/ExperimentList';
import { StatusBadge } from '@/components/workspace/StatusBadge';
import { IconArrow, IconMic, IconPlus, IconProtocol } from '@/components/icons';
import { useExperimentList, useHomeCounts, useProtocolList, type ExperimentSummary } from '@/lib/queries/useExperiment';
import { computeHomeStats } from '@/lib/stats';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** Step progress as a ring. The number inside is the step you are on, not a percentage. */
function Ring({ done, total }: { done: number; total: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const fraction = total ? done / total : 0;
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="url(#ring)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="ring" x1="0" x2="1">
            <stop offset="0" stopColor="#5db8a6" />
            <stop offset="1" stopColor="#cc785c" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center leading-none">
        <span>
          <span className="tabular block font-display text-[28px] text-on-dark">{Math.min(done + 1, total)}</span>
          <span className="text-[11px] text-on-dark-soft">of {total}</span>
        </span>
      </span>
    </div>
  );
}

function RunningHero({ experiment }: { experiment: ExperimentSummary }) {
  const steps = experiment.protocols?.steps ?? [];
  const current = steps[experiment.current_step_index];
  const readings = experiment.measurements?.[0]?.count ?? 0;

  return (
    <Link
      href={`/dashboard/experiments/${experiment.id}`}
      className="panel-dark group relative block animate-slide-up overflow-hidden rounded-xl p-lg transition-transform duration-300 hover:-translate-y-[2px] sm:p-xl"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-pill bg-primary/20 blur-3xl transition-opacity duration-500 group-hover:opacity-80"
      />
      <div className="relative flex flex-wrap items-center gap-x-xl gap-y-lg">
        <Ring done={experiment.current_step_index} total={steps.length} />
        <div className="min-w-[min(100%,260px)] flex-1">
          <div className="flex flex-wrap items-center gap-sm">
            <StatusBadge status={experiment.status} />
            <span className="font-mono text-caption text-on-dark-soft">{experiment.experiment_code}</span>
          </div>
          <h2 className="mt-xs text-display-sm text-on-dark">{experiment.name}</h2>
          <p className="mt-xs text-body-sm text-on-dark-soft">
            Now on <span className="text-on-dark">{current?.name ?? 'the final step'}</span> ·{' '}
            {plural(readings, 'reading')} so far
          </p>
        </div>
        <span className="btn-primary pointer-events-none">
          <IconMic className="h-4 w-4" />
          Resume at the bench
          <IconArrow className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-[3px]" />
        </span>
      </div>
    </Link>
  );
}

/** In the hero slot when nothing is running: voice needs a RUNNING experiment to record into. */
function StartCard() {
  return (
    <Link
      href="/experiments/new"
      className="panel-dark group relative block animate-slide-up overflow-hidden rounded-xl p-lg transition-transform duration-300 hover:-translate-y-[2px] sm:p-xl"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-pill bg-primary/20 blur-3xl"
      />
      <div className="relative flex flex-wrap items-center gap-x-xl gap-y-lg">
        <span className="grid h-[88px] w-[88px] shrink-0 place-items-center rounded-pill border border-white/10 text-primary">
          <IconMic className="h-8 w-8" />
        </span>
        <div className="min-w-[min(100%,260px)] flex-1">
          <h2 className="text-display-sm text-on-dark">Start an experiment</h2>
          <p className="mt-xs text-body-sm text-on-dark-soft">
            Name it, pick a protocol and list the samples. It opens at the bench, and the microphone records every
            reading you say.
          </p>
        </div>
        <span className="btn-primary pointer-events-none">
          <IconPlus className="h-4 w-4" />
          New experiment
          <IconArrow className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-[3px]" />
        </span>
      </div>
    </Link>
  );
}

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card animate-rise p-lg">
      <p className="text-caption text-muted">{label}</p>
      <p className="tabular mt-xs font-display text-[40px] leading-none text-ink">{value}</p>
      {hint && <p className="mt-xs text-caption text-muted-soft">{hint}</p>}
    </div>
  );
}

export default function Overview() {
  usePageCrumbs([{ label: 'Overview' }]);
  const user = useCurrentUser();
  const experiments = useExperimentList();
  const protocols = useProtocolList();
  const counts = useHomeCounts();

  const list = experiments.data ?? [];
  const running = list.find((e) => e.status === 'RUNNING');
  const stats = computeHomeStats(list);
  const dash = (loading: boolean, value: number) => (loading ? '—' : value);
  const name = (user?.user_metadata?.display_name as string | undefined)?.split(' ')[0];

  return (
    <main id="main" className="page">
      <header className="animate-rise">
        <p className="eyebrow">
          {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="page-title mt-xs">
          {greeting()}
          {name ? `, ${name}` : ''}.
        </h1>
        <p className="mt-xs max-w-[56ch] text-body-md text-muted">
          {running
            ? `${running.experiment_code} is running. Pick up where you left off, or review the runs behind it.`
            : 'No experiment is running. Start one to record by voice, or open a finished run below to review it.'}
        </p>
        <Link href="/experiments/new" className="btn-secondary mt-md inline-flex">
          <IconPlus className="h-4 w-4" />
          New experiment
        </Link>
      </header>

      <div className="mt-xl">
        {experiments.isLoading ? (
          <div className="skeleton h-[168px] rounded-xl" />
        ) : running ? (
          <RunningHero experiment={running} />
        ) : (
          <StartCard />
        )}
      </div>

      <div className="mt-lg grid grid-cols-2 gap-md md:grid-cols-3 xl:grid-cols-6">
        <Tile label="This week" value={dash(experiments.isLoading, stats.this_week)} hint={`${list.length} experiments in all`} />
        <Tile label="Running now" value={dash(experiments.isLoading, stats.running)} />
        <Tile label="Completed" value={dash(experiments.isLoading, stats.completed)} />
        <Tile label="With deviations" value={dash(experiments.isLoading, stats.with_deviations)} />
        <Tile label="Measurements" value={dash(counts.isLoading, counts.data?.measurements ?? 0)} hint="current values" />
        <Tile label="Voice-recorded" value={dash(counts.isLoading, counts.data?.voiceEvents ?? 0)} hint="events by voice" />
      </div>

      <div className="mt-xxl grid gap-xl lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="recent-heading">
          <div className="flex items-baseline justify-between">
            <h2 id="recent-heading" className="text-title-lg font-sans text-ink">
              Recent runs
            </h2>
            <Link href="/experiments" className="text-body-sm text-muted transition-colors hover:text-primary">
              All experiments →
            </Link>
          </div>
          <div className="card mt-md overflow-hidden">
            {experiments.isLoading ? (
              <ExperimentListSkeleton />
            ) : list.length ? (
              <ul className="divide-y divide-hairline-soft">
                {list.slice(0, 6).map((experiment, i) => (
                  <ExperimentRow key={experiment.id} experiment={experiment} index={i} />
                ))}
              </ul>
            ) : (
              <div className="px-lg py-xl">
                <p className="text-body-md text-muted">No experiments yet.</p>
                <p className="mt-xs inline-block rounded-md border border-dashed border-hairline bg-surface-soft px-sm py-xs font-mono text-body-sm text-body">
                  psql &lt;url&gt; -f supabase/seed.sql
                </p>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="library-heading">
          <div className="flex items-baseline justify-between">
            <h2 id="library-heading" className="text-title-lg font-sans text-ink">
              Protocol library
              {protocols.data && (
                <span className="tabular ml-xs text-caption text-muted-soft">{protocols.data.length}</span>
              )}
            </h2>
            <Link href="/protocols" className="text-body-sm text-muted transition-colors hover:text-primary">
              Open →
            </Link>
          </div>
          <ul className="mt-md space-y-xs">
            {protocols.isLoading
              ? [0, 1].map((i) => <li key={i} className="skeleton h-[76px] rounded-lg" />)
              : protocols.data?.map((protocol, i) => (
                  <li key={protocol.id} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
                    <Link
                      href={`/protocols?id=${protocol.id}`}
                      className="card card-interactive flex items-center gap-md p-md"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                        <IconProtocol className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-sm font-medium text-ink">{protocol.name}</span>
                        <span className="block text-caption text-muted-soft">
                          <span className="font-mono">{protocol.protocol_code}</span> · {plural(protocol.steps.length, 'step')} ·{' '}
                          {plural(protocol.experiments?.[0]?.count ?? 0, 'run')}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
