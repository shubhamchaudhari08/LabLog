'use client';

/**
 * The protocol library, master and detail.
 *
 * A protocol is created here (New protocol → POST /protocols) or dictated during
 * a run (write_protocol_step). Its creator can edit or delete it here until an
 * experiment uses it (PUT/DELETE /protocols/{id}); after that its steps are the
 * procedure a run was recorded against, and are fixed. Library protocols
 * (no owner) are read-only for everyone.
 */

import { Suspense, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { useCurrentUser, usePageCrumbs } from '@/components/shell/AppShell';
import { deleteProtocol } from '@/lib/api';
import { ProtocolSteps, readingsRequired } from '@/components/protocol/ProtocolSteps';
import { StatusPill } from '@/components/ui/StatusPill';
import { ButtonLink } from '@/components/ui/Button';
import { IconTile, LockPill } from '@/components/ui/bits';
import { experimentHref } from '@/lib/history';
import { displayName } from '@/lib/ui/displayName';
import { IconPencil, IconPlus, IconProtocol, IconTrash } from '@/components/icons';
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
  const user = useCurrentUser();
  const client = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const mine = Boolean(selected && user && selected.owner_id === user.id);
  const inUse = (selected?.experiments?.[0]?.count ?? runs.length) > 0;

  async function remove() {
    if (!selected || !window.confirm(`Delete ${selected.protocol_code} · ${selected.name}? This cannot be undone.`)) return;
    setDeleting(true);
    setActionError(null);
    try {
      const result = await deleteProtocol(selected.id);
      if (!result.success) {
        setActionError(result.message);
        return;
      }
      await client.invalidateQueries({ queryKey: ['protocols'] });
      router.replace('/protocols', { scroll: false });
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'The protocol was not deleted.');
    } finally {
      setDeleting(false);
    }
  }
  const types = Array.from(new Set((selected?.steps ?? []).flatMap(readingsRequired)));

  return (
    <main id="main" className="page">
      <header className="flex animate-rise flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="page-title">Protocols</h1>
          <p className="mt-xs max-w-[64ch] text-body-lg text-body">
            The steps each experiment follows. Create one here or dictate it during a run. You can edit or delete a
            protocol you created until an experiment uses it.
          </p>
        </div>
        <ButtonLink href="/protocols/new">
          <IconPlus className="h-[18px] w-[18px]" /> New protocol
        </ButtonLink>
      </header>

      <div className="mt-xl grid gap-xl lg:grid-cols-[330px_minmax(0,1fr)]">
        <nav aria-label="Protocol list">
          <ul className="space-y-xs">
            {protocols.isLoading
              ? [0, 1, 2].map((i) => <li key={i} className="skeleton h-[68px] rounded-card" />)
              : list.map((protocol, i) => {
                  const active = protocol.id === selected?.id;
                  return (
                    <li key={protocol.id} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
                      <button
                        type="button"
                        onClick={() => router.replace(`/protocols?id=${protocol.id}`, { scroll: false })}
                        aria-current={active ? 'true' : undefined}
                        className={`flex w-full items-center gap-sm rounded-card border px-[14px] py-[12px] text-left transition-colors duration-200 ${
                          active
                            ? 'border-primary-border-soft bg-surface-white shadow-segment'
                            : 'border-transparent hover:border-hairline hover:bg-surface-card'
                        }`}
                      >
                        <IconTile tone={active ? 'clay' : 'muted'}>
                          <IconProtocol className="h-[18px] w-[18px]" />
                        </IconTile>
                        <span className="min-w-0">
                          <span className="block truncate text-title-sm text-ink" title={protocol.name}>
                            {protocol.name}
                          </span>
                          <span className="block truncate font-mono text-code text-muted">
                            {protocol.protocol_code} {protocol.version} · {protocol.steps.length}{' '}
                            {protocol.steps.length === 1 ? 'step' : 'steps'}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
            {!protocols.isLoading && list.length === 0 && (
              <li className="info-card text-body-md text-muted">No protocols yet. Use New protocol to write one.</li>
            )}
          </ul>
        </nav>

        {selected && (
          <article
            key={selected.id}
            className="animate-slide-up overflow-hidden rounded-hero border border-hairline bg-surface-card"
          >
            <header className="bg-protocol-fade px-lg pb-lg pt-lg sm:px-[28px]">
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <p className="font-mono text-code tracking-[0.1em] text-muted">
                  {selected.protocol_code} · {selected.version ?? 'unversioned'}
                </p>
                {inUse ? (
                  <span title="Its steps are what those runs were recorded against.">
                    <LockPill>In use by a run — locked</LockPill>
                  </span>
                ) : selected.owner_id == null ? (
                  <LockPill>Library — read-only</LockPill>
                ) : mine ? (
                  <div className="flex gap-xs">
                    <ButtonLink href={`/protocols/new?edit=${selected.id}`} variant="secondary">
                      <IconPencil className="h-4 w-4" /> Edit
                    </ButtonLink>
                    <button type="button" className="btn-danger" onClick={remove} disabled={deleting}>
                      <IconTrash className="h-4 w-4" /> {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                ) : null}
              </div>
              {actionError && (
                <p role="alert" className="mt-xs text-body-md text-danger-text">
                  {actionError}
                </p>
              )}
              <h2 className="mt-sm line-clamp-2 text-display-sm" title={selected.name}>
                {selected.name}
              </h2>
              <dl className="mt-md flex flex-wrap gap-x-xl gap-y-sm">
                <div>
                  <dt className="text-caption text-body">Steps</dt>
                  <dd className="tabular font-display text-numeral-sm text-ink">{selected.steps.length}</dd>
                </div>
                <div>
                  <dt className="text-caption text-body">Runs</dt>
                  <dd className="tabular font-display text-numeral-sm text-ink">{selected.experiments?.[0]?.count ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-caption text-body">Readings required</dt>
                  <dd className="font-display text-numeral-sm text-ink">{types.length || 'None'}</dd>
                  {types.length > 0 && (
                    <dd className="mt-xxs flex flex-wrap gap-xxs">
                      {types.map((t) => (
                        <span key={t} className="badge">
                          {displayName(t)}
                        </span>
                      ))}
                    </dd>
                  )}
                </div>
              </dl>
            </header>

            <div className="grid border-t border-hairline md:grid-cols-[minmax(0,1fr)_260px]">
              <section aria-label="Steps" className="p-lg sm:px-[28px]">
                <h3 className="eyebrow mb-sm">Steps</h3>
                <ProtocolSteps steps={selected.steps} />
              </section>
              <section
                aria-label="Runs using this protocol"
                className="border-t border-hairline p-lg md:border-l md:border-t-0"
              >
                <h3 className="eyebrow mb-sm">Used by</h3>
                {runs.length ? (
                  <ul className="space-y-xs">
                    {runs.map((run) => (
                      <li key={run.id}>
                        <Link
                          href={experimentHref(run)}
                          className="flex h-[44px] items-center justify-between gap-xs rounded-lg border border-hairline bg-surface-white px-sm transition-colors hover:border-border-hover"
                        >
                          <span className="font-mono text-code text-ink">{run.experiment_code}</span>
                          <StatusPill status={run.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-body-md text-muted">No runs yet.</p>
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
