'use client';

/**
 * The protocol library, master and detail.
 *
 * A protocol is created here (New protocol → POST /protocols) or dictated during
 * a run (write_protocol_step). Once it exists its steps change only by voice:
 * there is no form editor, because a second way to change a step would be a
 * second write path (specs/002-manual-protocol-authoring).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { usePageCrumbs } from '@/components/shell/AppShell';
import { ProtocolSteps, readingsRequired } from '@/components/protocol/ProtocolSteps';
import { StatusBadge } from '@/components/workspace/StatusBadge';
import { IconPlus, IconProtocol } from '@/components/icons';
import { useExperimentList, useProtocolList } from '@/lib/queries/useExperiment';

function ProtocolLibrary() {
  const router = useRouter();
  const params = useSearchParams();
  const protocols = useProtocolList();
  const experiments = useExperimentList();

  const list = protocols.data ?? [];
  const selected = list.find((p) => p.id === params.get('id')) ?? list[0];
  usePageCrumbs(
    selected
      ? [{ label: 'Protocols', href: '/protocols' }, { label: selected.name }]
      : [{ label: 'Protocols' }],
  );

  const runs = (experiments.data ?? []).filter((e) => e.protocol_id === selected?.id);
  const types = Array.from(new Set((selected?.steps ?? []).flatMap(readingsRequired)));

  return (
    <main id="main" className="page">
      <header className="flex animate-rise flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="page-title">Protocols</h1>
          <p className="mt-xs max-w-[60ch] text-body-md text-muted">
            The steps each experiment follows. Create one here or dictate it during a run. After
            that, its steps change only by voice.
          </p>
        </div>
        <Link href="/protocols/new" className="btn-primary">
          <IconPlus className="h-4 w-4" /> New protocol
        </Link>
      </header>

      <div className="mt-xl grid gap-lg lg:grid-cols-[300px_minmax(0,1fr)]">
        <nav aria-label="Protocol list">
          <ul className="space-y-xs">
            {protocols.isLoading
              ? [0, 1, 2].map((i) => <li key={i} className="skeleton h-[68px] rounded-lg" />)
              : list.map((protocol, i) => {
                  const active = protocol.id === selected?.id;
                  return (
                    <li key={protocol.id} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
                      <button
                        type="button"
                        onClick={() => router.replace(`/protocols?id=${protocol.id}`, { scroll: false })}
                        aria-current={active ? 'true' : undefined}
                        className={`flex w-full items-center gap-sm rounded-lg border p-sm text-left transition-all duration-200 ${
                          active
                            ? 'border-primary/35 bg-canvas shadow-panel'
                            : 'border-transparent hover:border-hairline hover:bg-canvas/70'
                        }`}
                      >
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors ${
                            active ? 'bg-primary text-on-primary' : 'bg-surface-card text-muted'
                          }`}
                        >
                          <IconProtocol className="h-[18px] w-[18px]" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-body-sm font-medium text-ink">{protocol.name}</span>
                          <span className="block text-caption text-muted-soft">
                            <span className="font-mono">{protocol.protocol_code}</span> {protocol.version} ·{' '}
                            {protocol.steps.length} {protocol.steps.length === 1 ? 'step' : 'steps'}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
            {!protocols.isLoading && list.length === 0 && (
              <li className="rounded-lg border border-dashed border-hairline p-md text-body-sm text-muted-soft">
                No protocols yet. Use New protocol to write one.
              </li>
            )}
          </ul>
        </nav>

        {selected && (
          <article key={selected.id} className="card animate-slide-up overflow-hidden">
            <header className="bloom border-b border-hairline px-lg pb-lg pt-lg">
              <p className="eyebrow">
                <span className="font-mono">{selected.protocol_code}</span> · {selected.version ?? 'unversioned'}
              </p>
              <h2 className="mt-xs text-display-sm">{selected.name}</h2>
              <dl className="mt-md flex flex-wrap gap-x-xl gap-y-sm text-body-sm">
                <div>
                  <dt className="text-caption text-muted-soft">Steps</dt>
                  <dd className="tabular text-title-sm text-ink">{selected.steps.length}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-soft">Runs</dt>
                  <dd className="tabular text-title-sm text-ink">{selected.experiments?.[0]?.count ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-soft">Readings taken</dt>
                  <dd className="flex flex-wrap gap-xxs pt-[2px]">
                    {types.length ? (
                      types.map((t) => (
                        <span key={t} className="badge capitalize">
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted">None</span>
                    )}
                  </dd>
                </div>
              </dl>
            </header>

            <div className="grid gap-xl p-lg xl:grid-cols-[minmax(0,1fr)_240px]">
              <section aria-label="Steps">
                <h3 className="panel-label mb-sm">Steps</h3>
                <ProtocolSteps steps={selected.steps} />
              </section>
              <section aria-label="Runs using this protocol">
                <h3 className="panel-label mb-sm">Used by</h3>
                {runs.length ? (
                  <ul className="space-y-xxs">
                    {runs.map((run) => (
                      <li key={run.id}>
                        <Link
                          href={`/dashboard/experiments/${run.id}`}
                          className="flex items-center justify-between gap-xs rounded-md px-xs py-xs transition-colors hover:bg-surface-soft"
                        >
                          <span className="font-mono text-body-sm text-ink">{run.experiment_code}</span>
                          <StatusBadge status={run.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-body-sm text-muted-soft">No runs yet.</p>
                )}
              </section>
            </div>
          </article>
        )}
      </div>
    </main>
  );
}

export default function ProtocolsPage() {
  return (
    <Suspense fallback={<main className="page" />}>
      <ProtocolLibrary />
    </Suspense>
  );
}
