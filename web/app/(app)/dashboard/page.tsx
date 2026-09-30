'use client';

/**
 * Overview (specs/005 US4, PDF frame 1): the running experiment, the week in
 * numbers, and the notebook behind it.
 *
 * The first four stat tiles filter Recent runs, using the same rule as the
 * count they show. "Try saying" offers only what a session started here can do
 * (DESIGN.md D-10): with no experiment open, voice can list protocols and
 * create, start or resume runs, not record readings.
 */

import Link from 'next/link';
import { useState } from 'react';

import { usePageCrumbs, useCurrentUser } from '@/components/shell/AppShell';
import { HeroRunCard, StartCard } from '@/components/overview/HeroRunCard';
import { StatusPill } from '@/components/ui/StatusPill';
import { StatTile } from '@/components/ui/StatTile';
import { ButtonLink } from '@/components/ui/Button';
import { IconTile } from '@/components/ui/bits';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import { IconArrow, IconMic, IconPlus, IconProtocol } from '@/components/icons';
import { useExperimentList, useHomeCounts, useProtocolList, type ExperimentSummary } from '@/lib/queries/useExperiment';
import { experimentHref } from '@/lib/history';
import { computeHomeStats } from '@/lib/stats';
import { overviewFilter, type OverviewTile } from '@/lib/ui/overviewFilter';
import { runProgress, type Segment } from '@/lib/ui/runProgress';
import { trySayingPhrases } from '@/lib/ui/trySaying';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });

// #4f9483 / #c8623f / #e3dbcf: DESIGN.md progress-dots.
const DOT: Record<Segment, string> = {
  done: 'bg-[#4f9483]',
  current: 'bg-[#c8623f]',
  upcoming: 'bg-[#e3dbcf]',
};

function ProgressDots({ experiment }: { experiment: ExperimentSummary }) {
  const { segments, currentLabel } = runProgress(experiment);
  if (!segments.length) return <span className="text-caption text-muted">No protocol</span>;
  return (
    <span className="flex gap-[4px]" aria-label={currentLabel}>
      {segments.map((s, i) => (
        <span key={i} className={`h-[5px] w-[12px] rounded-pill ${DOT[s]}`} />
      ))}
    </span>
  );
}

function RecentRow({ experiment }: { experiment: ExperimentSummary }) {
  const when = experiment.completed_at
    ? `Completed ${shortDate(experiment.completed_at)}`
    : experiment.started_at
      ? `Started ${shortDate(experiment.started_at)}`
      : experiment.created_at
        ? `Created ${shortDate(experiment.created_at)}`
        : '—';
  return (
    <li className="border-b border-hairline-soft last:border-0">
      <Link
        href={experimentHref(experiment)}
        className="group grid min-h-[58px] grid-cols-[minmax(0,1fr)_auto_24px] items-center gap-md px-[18px] py-xs transition-colors hover:bg-surface-rail md:grid-cols-[150px_minmax(0,1fr)_100px_140px_auto_24px]"
      >
        <span className="hidden truncate font-mono text-title-sm text-ink md:block">{experiment.experiment_code}</span>
        <span className="min-w-0 truncate" title={experiment.name}>
          <span className="font-mono text-code text-ink md:hidden">{experiment.experiment_code} · </span>
          <span className="text-body-md text-ink">{experiment.name}</span>
          {experiment.protocols?.name && <span className="ml-xs text-caption text-muted">{experiment.protocols.name}</span>}
        </span>
        <span className="hidden md:block">
          <ProgressDots experiment={experiment} />
        </span>
        <span className="hidden whitespace-nowrap text-caption text-muted md:block">{when}</span>
        <StatusPill status={experiment.status} />
        <IconArrow className="h-4 w-4 text-muted opacity-35 transition-all duration-150 group-hover:translate-x-[3px] group-hover:opacity-100" />
      </Link>
    </li>
  );
}

const TILE_NAME: Record<OverviewTile, string> = {
  week: 'This week',
  running: 'Running now',
  completed: 'Completed',
  deviations: 'With deviations',
};

export default function Overview() {
  usePageCrumbs([{ label: 'Overview' }]);
  const user = useCurrentUser();
  const voice = useVoiceSession();
  const experiments = useExperimentList();
  const protocols = useProtocolList();
  const counts = useHomeCounts();
  const [tile, setTile] = useState<OverviewTile | null>(null);

  const list = experiments.data ?? [];
  const running = list.find((e) => e.status === 'RUNNING');
  const stats = computeHomeStats(list);
  const dash = (loading: boolean, value: number) => (loading ? '—' : value);
  const name = (user?.user_metadata?.display_name as string | undefined)?.split(' ')[0];
  const recent = overviewFilter(list, tile).slice(0, 6);
  const toggle = (t: OverviewTile) => setTile((current) => (current === t ? null : t));
  const phrases = trySayingPhrases({
    firstProtocolCode: protocols.data?.[0]?.protocol_code ?? null,
    runningCode: running?.experiment_code ?? null,
  });

  return (
    <main id="main" className="page">
      <header className="flex animate-rise flex-wrap items-end justify-between gap-md">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="mt-xs text-display-md sm:text-display-xl">
            {greeting()}
            {name ? `, ${name}` : ''}.
          </h1>
          <p className="mt-sm max-w-[60ch] text-body-lg text-body">
            {running
              ? `${running.experiment_code} is running. Pick up where you left off, or review the runs behind it.`
              : 'No experiment is running. Start one to record by voice, or open a finished run below to review it.'}
          </p>
        </div>
        <ButtonLink href="/experiments/new" variant="secondary">
          <IconPlus className="h-[18px] w-[18px]" />
          New experiment
        </ButtonLink>
      </header>

      <div className="mt-xl">
        {experiments.isLoading ? (
          <div className="h-[176px] rounded-feature bg-dark-surface" />
        ) : running ? (
          <HeroRunCard experiment={running} />
        ) : (
          <StartCard />
        )}
      </div>

      <div className="mt-lg grid grid-cols-2 gap-md md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="This week"
          value={dash(experiments.isLoading, stats.this_week)}
          hint={`${plural(list.length, 'experiment')} in all`}
          selected={tile === 'week'}
          onClick={() => toggle('week')}
        />
        <StatTile
          label="Running now"
          value={dash(experiments.isLoading, stats.running)}
          hint="tap to filter"
          selected={tile === 'running'}
          onClick={() => toggle('running')}
        />
        <StatTile
          label="Completed"
          value={dash(experiments.isLoading, stats.completed)}
          hint="tap to filter"
          selected={tile === 'completed'}
          onClick={() => toggle('completed')}
        />
        <StatTile
          label="With deviations"
          value={dash(experiments.isLoading, stats.with_deviations)}
          hint={stats.with_deviations ? 'needs review' : 'none this time'}
          hintClassName={stats.with_deviations ? 'text-deviation-text' : 'text-muted'}
          selected={tile === 'deviations'}
          onClick={() => toggle('deviations')}
        />
        <StatTile
          label="Measurements"
          value={dash(counts.isLoading, counts.data?.measurements ?? 0)}
          hint="current values"
          href="/settings/measurements"
        />
        <StatTile
          label="Voice-recorded"
          value={dash(counts.isLoading, counts.data?.voiceEvents ?? 0)}
          hint={
            <>
              <IconMic className="h-[14px] w-[14px] text-primary" />
              events by voice
            </>
          }
        />
      </div>

      <div className="mt-xxl grid gap-xl lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="recent-heading">
          <div className="flex items-baseline justify-between gap-md">
            <h2 id="recent-heading" className="font-sans text-title-lg text-ink">
              Recent runs
              <span className="ml-sm font-sans text-caption font-normal text-muted">
                {tile ? TILE_NAME[tile] : 'Most recent'}
              </span>
            </h2>
            <Link href="/experiments" className="link text-body-md">
              All experiments →
            </Link>
          </div>
          <div className="list-panel mt-md">
            {experiments.isLoading ? (
              <ul aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="list-row flex items-center gap-md">
                    <span className="skeleton h-4 w-24" />
                    <span className="skeleton h-4 flex-1" />
                  </li>
                ))}
              </ul>
            ) : recent.length ? (
              <ul>
                {recent.map((experiment) => (
                  <RecentRow key={experiment.id} experiment={experiment} />
                ))}
              </ul>
            ) : list.length ? (
              <div className="flex items-center justify-between gap-md px-[18px] py-lg">
                <p className="text-body-md text-muted">No runs match this filter.</p>
                <button type="button" className="btn-ghost" onClick={() => setTile(null)}>
                  Clear filter
                </button>
              </div>
            ) : (
              <div className="px-[18px] py-lg">
                <p className="text-body-md text-muted">No experiments yet. Start one above, or run the seed for the demo set.</p>
              </div>
            )}
          </div>
        </section>

        <div className="space-y-xl">
          <section aria-labelledby="try-heading" className="info-card">
            <div className="flex items-baseline justify-between gap-sm">
              <h2 id="try-heading" className="flex items-center gap-xs font-sans text-title-sm text-ink">
                <IconMic className="h-4 w-4 text-primary" />
                Try saying
              </h2>
              <span className="text-caption text-muted">tap to start voice</span>
            </div>
            <ul className="mt-sm space-y-xs">
              {phrases.map((phrase) => (
                <li key={phrase}>
                  <button
                    type="button"
                    disabled={voice.live}
                    onClick={() => {
                      voice.setHint(`Say: “${phrase}”`);
                      voice.startVoice();
                    }}
                    // #ebe3d8: DESIGN.md try-saying-chip border.
                    className="flex min-h-[44px] w-full items-center gap-xs rounded-lg border border-[#ebe3d8] bg-surface-chip px-[12px] py-[10px] text-left text-body-md text-ink transition-colors hover:border-primary-border-soft hover:bg-primary-tint-faint disabled:cursor-default disabled:opacity-60"
                  >
                    <span aria-hidden className="font-display text-[22px] leading-none text-primary">
                      “
                    </span>
                    {phrase}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="library-heading">
            <div className="flex items-baseline justify-between">
              <h2 id="library-heading" className="font-sans text-title-lg text-ink">
                Protocol library
                {protocols.data && <span className="tabular ml-xs font-sans text-caption text-muted">{protocols.data.length}</span>}
              </h2>
              <Link href="/protocols" className="link text-body-md">
                Open →
              </Link>
            </div>
            <ul className="mt-md space-y-xs">
              {protocols.isLoading
                ? [0, 1].map((i) => <li key={i} className="skeleton h-[64px] rounded-xl" />)
                : protocols.data?.map((protocol, i) => (
                    <li key={protocol.id} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
                      <Link
                        href={`/protocols?id=${protocol.id}`}
                        className="card-lift flex items-center gap-sm rounded-xl border border-hairline bg-surface-card px-[14px] py-[12px]"
                      >
                        <IconTile tone="tint">
                          <IconProtocol className="h-[18px] w-[18px]" />
                        </IconTile>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-title-sm text-ink" title={protocol.name}>
                            {protocol.name}
                          </span>
                          <span className="block truncate font-mono text-code text-muted">
                            {protocol.protocol_code} · {plural(protocol.steps.length, 'step')} ·{' '}
                            {plural(protocol.experiments?.[0]?.count ?? 0, 'run')}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
