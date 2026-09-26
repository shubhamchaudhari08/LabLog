'use client';

/**
 * New experiment: the quick create/resume path (specs/003-post-mvp-features FR-214).
 *
 * Voice records only into a RUNNING experiment, and it lives in the workspace.
 * This form gets you there: name it, pick a protocol, list the samples, and
 * "Create and start" lands on the bench with the microphone one click away.
 * Without a protocol it is created as a draft, and on the bench you can say
 * "create a new protocol and start this experiment" to dictate one.
 *
 * The server generates the code, owner, status and every timestamp; nothing
 * here is trusted for them.
 */

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { usePageCrumbs } from '@/components/shell/AppShell';
import { IconArrow, IconMic } from '@/components/icons';
import { createExperiment } from '@/lib/api';
import { useProtocolList } from '@/lib/queries/useExperiment';
import { parseSampleCodes } from '@/lib/samples';

export default function NewExperimentPage() {
  usePageCrumbs([{ label: 'Experiments', href: '/experiments' }, { label: 'New experiment' }]);
  const router = useRouter();
  const client = useQueryClient();
  const protocols = useProtocolList();

  const [name, setName] = useState('');
  const [protocolId, setProtocolId] = useState('');
  const [samples, setSamples] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = protocols.data?.find((p) => p.id === protocolId);
  const codes = parseSampleCodes(samples);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Give the experiment a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await createExperiment({
        name: name.trim(),
        description: description.trim() || undefined,
        protocol_id: protocolId || undefined,
        sample_codes: codes,
        start: Boolean(protocolId),
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      await client.invalidateQueries({ queryKey: ['experiments'] });
      router.push(`/dashboard/experiments/${result.experiment.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The experiment was not created.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main id="main" className="page max-w-[720px]">
      <header className="animate-rise">
        <h1 className="page-title">New experiment</h1>
        <p className="mt-xs max-w-[56ch] text-body-md text-muted">
          Name the run, choose its protocol and list its samples. It opens at the bench, where the microphone records
          into it.
        </p>
      </header>

      <form onSubmit={submit} className="card mt-xl space-y-lg p-lg" noValidate>
        <label className="block">
          <span className="text-body-sm font-medium text-ink">Name</span>
          <input
            className="input mt-xs w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="Enzyme Stability Trial 12"
            autoFocus
            required
          />
        </label>

        <label className="block">
          <span className="text-body-sm font-medium text-ink">Protocol</span>
          <select className="input mt-xs w-full" value={protocolId} onChange={(e) => setProtocolId(e.target.value)}>
            <option value="">None: I&apos;ll dictate it by voice</option>
            {protocols.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.protocol_code} · {p.name} {p.version ?? ''} ({p.steps.length} steps)
              </option>
            ))}
          </select>
          <span className="mt-xxs block text-caption text-muted-soft">
            {chosen
              ? `The code will be ${chosen.protocol_code.toUpperCase()}-<next number>. It starts running as soon as it is created.`
              : 'Created as a draft. On the bench, say "create a new protocol and start this experiment", then dictate the steps.'}
          </span>
        </label>

        <label className="block">
          <span className="text-body-sm font-medium text-ink">Samples</span>
          <textarea
            className="input mt-xs min-h-[72px] w-full font-mono"
            value={samples}
            onChange={(e) => setSamples(e.target.value)}
            placeholder="A1, A2, CONTROL-01"
          />
          <span className="mt-xxs block text-caption text-muted-soft">
            {codes.length
              ? `${codes.length} sample${codes.length === 1 ? '' : 's'}: ${codes.map((c) => c.toUpperCase()).join(', ')}`
              : 'Separate codes with commas or spaces. Voice can only record against samples listed here.'}
          </span>
        </label>

        <label className="block">
          <span className="text-body-sm font-medium text-ink">
            Description <span className="font-normal text-muted-soft">(optional)</span>
          </span>
          <textarea
            className="input mt-xs min-h-[64px] w-full"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-md border border-error/30 bg-error/5 px-sm py-xs text-body-sm text-error">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-sm">
          <Link href="/experiments" className="btn-ghost">
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={saving}>
            {protocolId ? <IconMic className="h-4 w-4" /> : null}
            {saving ? 'Creating…' : protocolId ? 'Create and start' : 'Create draft'}
            <IconArrow className="h-4 w-4" />
          </button>
        </div>
      </form>
    </main>
  );
}
