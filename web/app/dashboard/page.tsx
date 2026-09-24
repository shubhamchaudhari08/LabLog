'use client';

/**
 * The index: every experiment, and the protocols behind them.
 *
 * Guest mode signs in first, so reviewers reach this without a login form. The
 * running experiment is pulled to the top and given the only filled button on
 * the page — from here the demo is one click away, and the completed runs
 * behind it are what make the record look like a real notebook rather than a
 * single seeded row.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { TopNav } from '@/components/Chrome';
import { ensureSession } from '@/lib/supabase';
import {
  useExperimentList,
  useProtocolList,
  type ExperimentSummary,
  type ProtocolSummary,
} from '@/lib/queries/useExperiment';

const STATUS_TONE: Record<string, string> = {
  RUNNING: 'border-success/30 bg-success/10 text-success',
  COMPLETED: 'border-hairline bg-surface-card text-muted',
  PAUSED: 'border-accent-amber/30 bg-accent-amber/10 text-warning',
  CANCELLED: 'border-error/25 bg-error/10 text-error',
};

function when(experiment: ExperimentSummary) {
  const iso = experiment.completed_at ?? experiment.started_at;
  if (!iso) return 'not started';
  const date = new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
  return experiment.completed_at ? `completed ${date}` : `started ${date}`;
}

function ExperimentRow({ experiment }: { experiment: ExperimentSummary }) {
  const running = experiment.status === 'RUNNING';
  const steps = experiment.protocols?.steps ?? [];
  const measurements = experiment.measurements?.[0]?.count ?? 0;

  return (
    <li>
      <Link
        href={`/dashboard/experiments/${experiment.id}`}
        className={`group flex animate-rise flex-wrap items-center gap-md rounded-lg border px-lg py-md transition-all duration-200 ${
          running
            ? 'border-primary/30 bg-canvas shadow-panel hover:shadow-lift'
            : 'border-hairline bg-canvas/60 hover:border-muted-soft hover:bg-canvas'
        }`}
      >
        <span className="font-mono text-title-sm text-ink">{experiment.experiment_code}</span>

        <span
          className={`rounded-sm border px-xs py-[3px] text-caption-upper uppercase ${
            STATUS_TONE[experiment.status] ?? 'border-hairline bg-surface-card text-muted'
          }`}
        >
          {experiment.status.toLowerCase()}
        </span>

        <span className="min-w-0 flex-1 truncate text-body-sm text-body">{experiment.name}</span>

        <span className="tabular text-caption text-muted-soft">
          {measurements} {measurements === 1 ? 'measurement' : 'measurements'}
        </span>

        {steps.length > 0 && (
          <span className="tabular hidden text-caption text-muted-soft sm:inline">
            step {Math.min(experiment.current_step_index + 1, steps.length)}/{steps.length}
          </span>
        )}

        <span className="hidden w-28 text-right text-caption text-muted-soft md:inline">
          {when(experiment)}
        </span>

        <span
          aria-hidden
          className="text-caption text-muted-soft transition-transform duration-200 group-hover:translate-x-[2px] group-hover:text-primary"
        >
          →
        </span>
      </Link>
    </li>
  );
}

function ProtocolCard({ protocol }: { protocol: ProtocolSummary }) {
  const runs = protocol.experiments?.[0]?.count ?? 0;

  return (
    <article className="animate-rise rounded-lg border border-hairline bg-canvas p-lg shadow-panel">
      <header className="flex items-baseline justify-between gap-xs">
        <span className="font-mono text-caption uppercase tracking-[1.5px] text-muted">
          {protocol.protocol_code}
        </span>
        <span className="text-caption text-muted-soft">{protocol.version}</span>
      </header>

      <h3 className="mt-xs text-title-md text-ink">{protocol.name}</h3>

      <p className="mt-xxs text-caption text-muted-soft">
        {protocol.steps.length} steps · used by {runs} {runs === 1 ? 'run' : 'runs'}
      </p>

      <ol className="mt-md space-y-xxs border-t border-hairline-soft pt-sm">
        {protocol.steps.map((step) => (
          <li key={step.id} className="flex gap-xs text-body-sm text-muted">
            <span className="tabular w-4 shrink-0 text-muted-soft">{step.index + 1}</span>
            <span className="min-w-0">{step.name}</span>
            {step.required_fields && step.required_fields.length > 1 && (
              <span className="badge ml-auto shrink-0">required</span>
            )}
          </li>
        ))}
      </ol>
    </article>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [gated, setGated] = useState(false);

  useEffect(() => {
    void (async () => {
      // Guest mode signs in as the demo account; only a project without demo
      // credentials configured sends the visitor to the login form.
      if (!(await ensureSession())) router.replace('/login');
      else setGated(true);
    })();
  }, [router]);

  const experiments = useExperimentList();
  const protocols = useProtocolList();

  const running = experiments.data?.find((e) => e.status === 'RUNNING');
  const loading = !gated || experiments.isLoading;

  return (
    <>
      <TopNav />

      <main id="main" className="mx-auto max-w-[1080px] px-lg pb-section pt-xl">
        <header className="flex flex-wrap items-end justify-between gap-md">
          <div>
            <h1 className="text-display-lg">Experiments</h1>
            <p className="mt-xs max-w-[52ch] text-body-md text-muted">
              Every run and the protocols behind them. Open a running experiment to record by
              voice.
            </p>
          </div>
          {running && (
            <Link href={`/dashboard/experiments/${running.id}`} className="btn-primary">
              Resume {running.experiment_code}
            </Link>
          )}
        </header>

        <section className="mt-xxl" aria-labelledby="runs-heading">
          <h2 id="runs-heading" className="panel-label border-b border-hairline pb-xs">
            Runs
          </h2>

          {loading ? (
            <ul className="space-y-xs pt-md" aria-hidden>
              {[0, 1, 2].map((i) => (
                <li key={i} className="rounded-lg border border-hairline px-lg py-md">
                  <div className="skeleton h-5 w-2/3" />
                </li>
              ))}
            </ul>
          ) : experiments.data?.length ? (
            <ul className="space-y-xs pt-md">
              {experiments.data.map((experiment) => (
                <ExperimentRow key={experiment.id} experiment={experiment} />
              ))}
            </ul>
          ) : (
            <div className="py-xl">
              <p className="text-body-md text-muted">No experiments yet.</p>
              <p className="mt-xs inline-block rounded-md border border-dashed border-hairline bg-surface-soft px-sm py-xs font-mono text-body-sm text-body">
                psql &lt;url&gt; -f supabase/seed.sql
              </p>
            </div>
          )}
        </section>

        <section className="mt-xxl" aria-labelledby="protocols-heading">
          <h2 id="protocols-heading" className="panel-label border-b border-hairline pb-xs">
            Protocols
          </h2>

          {protocols.isLoading ? (
            <div className="grid gap-md pt-md sm:grid-cols-2" aria-hidden>
              {[0, 1].map((i) => (
                <div key={i} className="rounded-lg border border-hairline p-lg">
                  <div className="skeleton h-4 w-20" />
                  <div className="skeleton mt-sm h-6 w-2/3" />
                  <div className="skeleton mt-lg h-20" />
                </div>
              ))}
            </div>
          ) : protocols.data?.length ? (
            <div className="grid gap-md pt-md sm:grid-cols-2">
              {protocols.data.map((protocol) => (
                <ProtocolCard key={protocol.id} protocol={protocol} />
              ))}
            </div>
          ) : (
            <p className="py-xl text-body-sm text-muted-soft">
              No protocols are readable by this account.
            </p>
          )}
        </section>
      </main>
    </>
  );
}
