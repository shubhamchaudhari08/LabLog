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
import { parseSampleCodes, samplesPayload, type PickedType } from '@/lib/samples';
import { sampleCompositionText } from '@/lib/stepRequirements';

export default function NewExperimentPage() {
  usePageCrumbs([{ label: 'Experiments', href: '/experiments' }, { label: 'New experiment' }]);
  const router = useRouter();
  const client = useQueryClient();
  const protocols = useProtocolList();

  const [name, setName] = useState('');
  const [protocolId, setProtocolId] = useState('');
  const [samples, setSamples] = useState('');
  // Keyed by uppercased code, so retyping "a17" as "A17" keeps its type.
  const [types, setTypes] = useState<Record<string, PickedType>>({});
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = protocols.data?.find((p) => p.id === protocolId);
  // Samples can only be added here, so say up front what the protocol needs (specs/007 FR-713).
  const composition = chosen ? sampleCompositionText(chosen.steps ?? []) : null;
  const codes = parseSampleCodes(samples);
  const listed = [...new Set(codes.map((c) => c.toUpperCase()))];

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
        ...samplesPayload(codes, types),
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
          <span className="text-body-md font-medium text-ink">Name</span>
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
          <span className="text-body-md font-medium text-ink">Protocol</span>
          <select className="input mt-xs w-full" value={protocolId} onChange={(e) => setProtocolId(e.target.value)}>
            <option value="">None: I&apos;ll dictate it by voice</option>
            {protocols.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.protocol_code} · {p.name} {p.version ?? ''} ({p.steps.length} steps)
              </option>
            ))}
          </select>
          <span className="mt-xxs block text-caption text-muted">
            {chosen
              ? `The code will be ${chosen.protocol_code.toUpperCase()}-<next number>. It starts running as soon as it is created.`
              : 'Created as a draft. On the bench, say "create a new protocol and start this experiment", then dictate the steps.'}
          </span>
        </label>

        <label className="block">
          <span className="text-body-md font-medium text-ink">Samples</span>
          <textarea
            className="input mt-xs min-h-[72px] w-full font-mono"
            value={samples}
            onChange={(e) => setSamples(e.target.value)}
            placeholder="A1, A2, CONTROL-01"
          />
          <span className="mt-xxs block text-caption text-muted">
            {codes.length
              ? `${codes.length} sample${codes.length === 1 ? '' : 's'}: ${codes.map((c) => c.toUpperCase()).join(', ')}`
              : 'Separate codes with commas or spaces. Voice can only record against samples listed here.'}
          </span>
          {composition && (
            <span className="mt-xxs block text-caption text-ink">
              {composition} Samples can&apos;t be added after the experiment is created.
            </span>
          )}
        </label>

        {listed.length > 0 && (
          <fieldset>
            <legend className="text-body-md font-medium text-ink">
              Sample types <span className="font-normal text-muted">(optional)</span>
            </legend>
            <span className="mt-xxs block text-caption text-muted">
              Needed when the protocol requires test or control samples. Unset samples are stored as before.
            </span>
            <ul className="mt-xs grid gap-xs sm:grid-cols-2">
              {listed.map((code) => (
                <li key={code} className="flex items-center gap-sm">
                  <label htmlFor={`type-${code}`} className="w-[120px] truncate font-mono text-body-md text-ink">
                    {code}
                  </label>
                  <select
                    id={`type-${code}`}
                    className="input"
                    value={types[code] ?? ''}
                    onChange={(e) => setTypes((t) => ({ ...t, [code]: e.target.value as PickedType }))}
                  >
                    <option value="">—</option>
                    <option value="test">test</option>
                    <option value="control">control</option>
                  </select>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <label className="block">
          <span className="text-body-md font-medium text-ink">
            Description <span className="font-normal text-muted">(optional)</span>
          </span>
          <textarea
            className="input mt-xs min-h-[64px] w-full"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-md border border-danger-text/30 bg-danger-bg/5 px-sm py-xs text-body-md text-danger-text">
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
