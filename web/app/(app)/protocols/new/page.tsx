'use client';

/**
 * New protocol, written by hand (specs/002-manual-protocol-authoring).
 *
 * The form only collects the user's words and their order. Step indexes, ids,
 * owner and timestamps are the server's to assign (POST /protocols), so nothing
 * here sends them. Reading types come from the same vocabulary the voice agent
 * uses; an unlisted type is still allowed, with a free-text unit.
 */

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { usePageCrumbs } from '@/components/shell/AppShell';
import { IconChevron, IconClose, IconPlus, IconTrash } from '@/components/icons';
import { createProtocol, fetchMeasurementTypes, updateProtocol } from '@/lib/api';
import {
  SAMPLE_TYPES,
  emptyForm,
  emptyReading,
  emptyStep,
  fromStored,
  keptSummary,
  listedType,
  needsUnit,
  newKey,
  serverErrors,
  toDraft,
  validate,
  type Errors,
  type Expect,
  type FormState,
  type ReadingDraft,
  type SampleType,
  type StepDraft,
} from '@/lib/protocolForm';
import { useProtocolList, type ProtocolSummary } from '@/lib/queries/useExperiment';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-xxs text-[12px] text-danger-text">
      {message}
    </p>
  );
}

/** New protocol, or (with `source`) edit one the user created that no experiment uses yet. */
function ProtocolEditor({ source }: { source?: ProtocolSummary }) {
  usePageCrumbs([{ label: 'Protocols', href: '/protocols' }, { label: source ? `Edit ${source.protocol_code}` : 'New protocol' }]);

  const router = useRouter();
  const queryClient = useQueryClient();
  const types = useQuery({ queryKey: ['measurement-types'], queryFn: fetchMeasurementTypes, staleTime: Infinity });
  const vocabulary = types.data ?? [];

  const [form, setForm] = useState<FormState>(() =>
    source ? fromStored(source) : emptyForm(),
  );
  const [initial] = useState(() => JSON.stringify(toDraft(form)));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const saved = useRef(false);

  const dirty = useMemo(() => JSON.stringify(toDraft(form)) !== initial, [form, initial]);

  // Protect a draft from a closed tab or a reload. In-app links go through confirmLeave.
  useEffect(() => {
    if (!dirty || saving) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, saving]);

  // Focus follows a newly added step, and the first invalid field after a failed save.
  const inputs = useRef(new Map<string, HTMLInputElement | HTMLSelectElement>());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  useEffect(() => {
    if (!focusKey) return;
    inputs.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey]);
  const bind = (key: string) => (node: HTMLInputElement | HTMLSelectElement | null) => {
    if (node) inputs.current.set(key, node);
    else inputs.current.delete(key);
  };

  function update(change: (form: FormState) => FormState, clear?: string) {
    setForm(change);
    if (clear && errors[clear])
      setErrors((current) => {
        const next = { ...current };
        delete next[clear];
        return next;
      });
  }

  function updateStep(key: string, change: (step: StepDraft) => StepDraft, clear?: string) {
    update((f) => ({ ...f, steps: f.steps.map((s) => (s.key === key ? change(s) : s)) }), clear);
  }

  function updateReading(stepKey: string, readingKey: string, change: (r: ReadingDraft) => ReadingDraft, clear?: string) {
    updateStep(stepKey, (s) => ({ ...s, readings: s.readings.map((x) => (x.key === readingKey ? change(x) : x)) }), clear);
  }

  function insertStep(at: number) {
    const step = emptyStep();
    update((f) => ({ ...f, steps: [...f.steps.slice(0, at), step, ...f.steps.slice(at)] }));
    setFocusKey(`${step.key}.name`);
  }

  function moveStep(from: number, to: number) {
    update((f) => {
      const steps = [...f.steps];
      const [step] = steps.splice(from, 1);
      steps.splice(to, 0, step);
      return { ...f, steps };
    });
  }

  function confirmLeave(event: MouseEvent) {
    if (dirty && !window.confirm(source ? 'Discard your changes?' : 'Discard this protocol draft?')) event.preventDefault();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    const found = validate(form, vocabulary);
    setErrors(found);
    if (Object.keys(found).length) {
      setFocusKey(Object.keys(found)[0]);
      return;
    }

    setSaving(true);
    try {
      const result = source ? await updateProtocol(source.id, toDraft(form)) : await createProtocol(toDraft(form));
      if (result.success) {
        saved.current = true;
        await queryClient.invalidateQueries({ queryKey: ['protocols'] });
        router.push(`/protocols?id=${result.protocol.id}`);
        return;
      }
      const mapped = serverErrors(form, result.error, result.message, result.detail);
      setErrors(mapped);
      const first = Object.keys(mapped).find((k) => k !== 'form');
      if (first) setFocusKey(first);
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : 'The protocol was not saved.' });
    } finally {
      if (!saved.current) setSaving(false);
    }
  }

  const fieldClass = (key: string) => `input ${errors[key] ? 'border-danger-text focus:border-danger-text' : ''}`;
  const describe = (key: string) => (errors[key] ? { 'aria-invalid': true, 'aria-describedby': `${key}-error` } : {});

  return (
    <main id="main" className="page">
      <header className="animate-rise">
        <h1 className="page-title">{source ? `Edit ${source.protocol_code}` : 'New protocol'}</h1>
        <p className="mt-xs max-w-[60ch] text-body-md text-muted">
          Write the steps in the order they are done. The agent reads them back word for word during a run and never
          fills in a missing step.
        </p>
      </header>

      <form onSubmit={save} noValidate className="mt-xl grid max-w-[880px] gap-lg">
        <section aria-labelledby="details-heading" className="card p-lg">
          <h2 id="details-heading" className="panel-label mb-md">
            Details
          </h2>
          <div className="grid gap-md sm:grid-cols-[minmax(0,1fr)_160px_120px]">
            <div>
              <label htmlFor="name" className="mb-xxs block text-body-md font-medium text-ink">
                Name
              </label>
              <input
                id="name"
                ref={bind('name')}
                className={fieldClass('name')}
                value={form.name}
                maxLength={200}
                placeholder="Colony PCR screen"
                onChange={(e) => update((f) => ({ ...f, name: e.target.value }), 'name')}
                {...describe('name')}
              />
              <FieldError id="name-error" message={errors.name} />
            </div>
            <div>
              <label htmlFor="protocol_code" className="mb-xxs block text-body-md font-medium text-ink">
                Code
              </label>
              <input
                id="protocol_code"
                ref={bind('protocol_code')}
                className={`${fieldClass('protocol_code')} font-mono`}
                value={form.protocol_code}
                maxLength={32}
                placeholder="PCR-02"
                autoComplete="off"
                onChange={(e) => update((f) => ({ ...f, protocol_code: e.target.value }), 'protocol_code')}
                {...describe('protocol_code')}
              />
              <FieldError id="protocol_code-error" message={errors.protocol_code} />
            </div>
            <div>
              <label htmlFor="version" className="mb-xxs block text-body-md font-medium text-ink">
                Version
              </label>
              <input
                id="version"
                ref={bind('version')}
                className={fieldClass('version')}
                value={form.version}
                maxLength={20}
                onChange={(e) => update((f) => ({ ...f, version: e.target.value }), 'version')}
                {...describe('version')}
              />
              <FieldError id="version-error" message={errors.version} />
            </div>
          </div>
        </section>

        <section aria-labelledby="steps-heading">
          <div className="mb-sm flex items-baseline justify-between">
            <h2 id="steps-heading" className="panel-label">
              Steps
            </h2>
            <span className="text-caption text-muted">
              {form.steps.length} {form.steps.length === 1 ? 'step' : 'steps'}
            </span>
          </div>

          <datalist id="measurement-types">
            {vocabulary.map((t) => (
              <option key={t.name} value={t.name} />
            ))}
          </datalist>

          <ol className="space-y-sm">
            {form.steps.map((step, i) => {
              const n = i + 1;
              const nameKey = `${step.key}.name`;
              return (
                <li key={step.key} className="card flex gap-sm p-md">
                  <span className="mt-[26px] grid h-7 w-7 shrink-0 place-items-center rounded-pill border-[1.5px] border-muted/60 text-[12px] font-medium text-body">
                    {n}
                  </span>

                  <div className="min-w-0 flex-1">
                    <label htmlFor={nameKey} className="mb-xxs block text-body-md font-medium text-ink">
                      Step {n}
                    </label>
                    <input
                      id={nameKey}
                      ref={bind(nameKey)}
                      className={fieldClass(nameKey)}
                      value={step.name}
                      maxLength={200}
                      placeholder="What is done at this step"
                      onChange={(e) => updateStep(step.key, (s) => ({ ...s, name: e.target.value }), nameKey)}
                      {...describe(nameKey)}
                    />
                    <FieldError id={`${nameKey}-error`} message={errors[nameKey]} />

                    <fieldset className="mt-sm">
                      <legend className="text-caption text-muted">
                        Readings for every sample {step.readings.length === 0 && '(none: a confirmation step)'}
                      </legend>
                      <ul className="mt-xxs space-y-xs">
                        {step.readings.map((reading, r) => {
                          const typeKey = `${reading.key}.type`;
                          const unitKey = `${reading.key}.unit`;
                          const listed = listedType(vocabulary, reading.type);
                          return (
                            <li key={reading.key} className="flex flex-wrap items-start gap-xs">
                              <div className="min-w-[160px] flex-1">
                                <label htmlFor={typeKey} className="sr-only">
                                  Step {n} reading {r + 1} type
                                </label>
                                <input
                                  id={typeKey}
                                  ref={bind(typeKey)}
                                  list="measurement-types"
                                  className={fieldClass(typeKey)}
                                  value={reading.type}
                                  maxLength={40}
                                  placeholder="What is measured"
                                  onChange={(e) =>
                                    updateStep(
                                      step.key,
                                      (s) => ({
                                        ...s,
                                        readings: s.readings.map((x) =>
                                          x.key === reading.key ? { ...x, type: e.target.value, unit: '' } : x,
                                        ),
                                      }),
                                      typeKey,
                                    )
                                  }
                                  {...describe(typeKey)}
                                />
                                <FieldError id={`${typeKey}-error`} message={errors[typeKey]} />
                              </div>
                              <div className="w-[140px]">
                                {!listed?.dimensionless && (
                                  <label htmlFor={unitKey} className="sr-only">
                                    Step {n} reading {r + 1} default unit
                                  </label>
                                )}
                                {listed?.dimensionless ? (
                                  <p className="flex h-10 items-center px-sm text-body-md text-muted">
                                    {listed.default_unit}
                                  </p>
                                ) : listed ? (
                                  <select
                                    id={unitKey}
                                    ref={bind(unitKey)}
                                    className={fieldClass(unitKey)}
                                    value={reading.unit}
                                    onChange={(e) =>
                                      updateStep(
                                        step.key,
                                        (s) => ({
                                          ...s,
                                          readings: s.readings.map((x) =>
                                            x.key === reading.key ? { ...x, unit: e.target.value } : x,
                                          ),
                                        }),
                                        unitKey,
                                      )
                                    }
                                    {...describe(unitKey)}
                                  >
                                    <option value="">{reading.expect === 'any' ? 'No default unit' : 'Choose a unit'}</option>
                                    {listed.units.map((u) => (
                                      <option key={u} value={u}>
                                        {u}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    id={unitKey}
                                    ref={bind(unitKey)}
                                    className={fieldClass(unitKey)}
                                    value={reading.unit}
                                    maxLength={20}
                                    placeholder="Unit"
                                    onChange={(e) =>
                                      updateStep(
                                        step.key,
                                        (s) => ({
                                          ...s,
                                          readings: s.readings.map((x) =>
                                            x.key === reading.key ? { ...x, unit: e.target.value } : x,
                                          ),
                                        }),
                                        unitKey,
                                      )
                                    }
                                    {...describe(unitKey)}
                                  />
                                )}
                                <FieldError id={`${unitKey}-error`} message={errors[unitKey]} />
                              </div>
                              <ExpectedValue
                                reading={reading}
                                label={`Step ${n} reading ${r + 1}`}
                                error={errors[`${reading.key}.expect`]}
                                bind={bind}
                                onChange={(change) => updateReading(step.key, reading.key, change, `${reading.key}.expect`)}
                              />
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={`Remove reading ${r + 1} from step ${n}`}
                                onClick={() =>
                                  updateStep(step.key, (s) => ({
                                    ...s,
                                    readings: s.readings.filter((x) => x.key !== reading.key),
                                  }))
                                }
                              >
                                <IconClose className="h-4 w-4" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <button
                        type="button"
                        className="btn-ghost mt-xxs h-8 px-xs text-[13px]"
                        disabled={step.readings.length >= 20}
                        onClick={() => {
                          const reading = emptyReading();
                          updateStep(step.key, (s) => ({ ...s, readings: [...s.readings, reading] }));
                          setFocusKey(`${reading.key}.type`);
                        }}
                      >
                        <IconPlus className="h-4 w-4" /> Add reading
                      </button>
                    </fieldset>

                    <AlsoRequired
                      step={step}
                      n={n}
                      errors={errors}
                      bind={bind}
                      onChange={(change, clear) => updateStep(step.key, change, clear)}
                      onAddRule={(key) => setFocusKey(`${key}.count`)}
                    />
                    <FieldError id={`${step.key}.step-error`} message={errors[`${step.key}.step`]} />
                  </div>

                  <div className="flex shrink-0 flex-col gap-xxs pt-[22px]">
                    <button
                      type="button"
                      className="icon-btn disabled:opacity-30"
                      aria-label={`Move step ${n} up`}
                      disabled={i === 0}
                      onClick={() => moveStep(i, i - 1)}
                    >
                      <IconChevron className="h-4 w-4 -rotate-90" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn disabled:opacity-30"
                      aria-label={`Move step ${n} down`}
                      disabled={i === form.steps.length - 1}
                      onClick={() => moveStep(i, i + 1)}
                    >
                      <IconChevron className="h-4 w-4 rotate-90" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn disabled:opacity-30"
                      aria-label={`Insert a step after step ${n}`}
                      disabled={form.steps.length >= 200}
                      onClick={() => insertStep(i + 1)}
                    >
                      <IconPlus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn hover:text-danger-text disabled:opacity-30"
                      aria-label={`Remove step ${n}`}
                      disabled={form.steps.length === 1}
                      onClick={() => update((f) => ({ ...f, steps: f.steps.filter((s) => s.key !== step.key) }))}
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>

          <button
            type="button"
            className="btn-secondary mt-sm w-full justify-center border-dashed"
            disabled={form.steps.length >= 200}
            onClick={() => insertStep(form.steps.length)}
          >
            <IconPlus className="h-4 w-4" /> Add step
          </button>
        </section>

        <div className="sticky bottom-0 -mx-md flex flex-wrap items-center justify-end gap-sm border-t border-hairline bg-canvas/95 px-md py-sm backdrop-blur">
          <p aria-live="polite" className="mr-auto text-body-md text-danger-text">
            {errors.form}
          </p>
          <Link href="/protocols" className="btn-ghost" onClick={confirmLeave}>
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save protocol'}
          </button>
        </div>
      </form>
    </main>
  );
}

type Bind = (key: string) => (node: HTMLInputElement | HTMLSelectElement | null) => void;

const EXPECT_LABEL: Record<Expect, string> = { any: 'Any value', exact: 'Exact value', range: 'Range' };

const invalidProps = (key: string, error?: string) =>
  error ? { 'aria-invalid': true as const, 'aria-describedby': `${key}-error` } : {};

/**
 * What a reading should be: anything, one exact value, or a range open at either
 * end. A recorded value that misses it is saved and logged as a deviation.
 */
function ExpectedValue({
  reading,
  label,
  error,
  bind,
  onChange,
}: {
  reading: ReadingDraft;
  label: string;
  error?: string;
  bind: Bind;
  onChange: (change: (r: ReadingDraft) => ReadingDraft) => void;
}) {
  const key = `${reading.key}.expect`;
  const numberInput = (field: 'exact' | 'min' | 'max', placeholder: string, text: string) => (
    <div className="w-[96px]">
      <label htmlFor={`${reading.key}.${field}`} className="sr-only">
        {label} {text}
      </label>
      <input
        id={`${reading.key}.${field}`}
        // Focus after a failed save lands on the first number of the expectation.
        ref={field === (reading.expect === 'exact' ? 'exact' : 'min') ? bind(key) : undefined}
        className={`input ${error ? 'border-danger-text focus:border-danger-text' : ''}`}
        inputMode="decimal"
        value={reading[field]}
        placeholder={placeholder}
        onChange={(e) => onChange((r) => ({ ...r, [field]: e.target.value }))}
        {...invalidProps(key, error)}
      />
    </div>
  );
  return (
    <div className="flex flex-wrap items-start gap-xs">
      <div className="w-[128px]">
        <label htmlFor={`${reading.key}.mode`} className="sr-only">
          {label} expected value
        </label>
        <select
          id={`${reading.key}.mode`}
          className="input"
          value={reading.expect}
          onChange={(e) => onChange((r) => ({ ...r, expect: e.target.value as Expect }))}
        >
          {(Object.keys(EXPECT_LABEL) as Expect[]).map((mode) => (
            <option key={mode} value={mode}>
              {EXPECT_LABEL[mode]}
            </option>
          ))}
        </select>
      </div>
      {reading.expect === 'exact' && numberInput('exact', 'Value', 'exact value')}
      {reading.expect === 'range' && (
        <>
          {numberInput('min', 'Min', 'minimum')}
          <span className="flex h-[44px] items-center text-body-md text-muted">to</span>
          {numberInput('max', 'Max', 'maximum')}
        </>
      )}
      {error && (
        <p id={`${key}-error`} className="basis-full text-[12px] text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

/** Requirements beyond readings: an observation per sample, deviation review, and required samples. */
function AlsoRequired({
  step,
  n,
  errors,
  bind,
  onChange,
  onAddRule,
}: {
  step: StepDraft;
  n: number;
  errors: Errors;
  bind: Bind;
  onChange: (change: (s: StepDraft) => StepDraft, clear?: string) => void;
  onAddRule: (key: string) => void;
}) {
  const kept = keptSummary(step.kept);
  const setRule = (key: string, change: Partial<StepDraft['sampleRules'][number]>, clear: string) =>
    onChange((s) => ({ ...s, sampleRules: s.sampleRules.map((x) => (x.key === key ? { ...x, ...change } : x)) }), clear);

  return (
    <fieldset className="mt-sm">
      <legend className="text-caption text-muted">Also required at this step</legend>
      <div className="mt-xxs flex flex-wrap gap-x-lg gap-y-xs">
        <label className="flex items-center gap-xs text-body-md text-ink">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={step.observationPerSample}
            onChange={(e) => onChange((s) => ({ ...s, observationPerSample: e.target.checked }))}
          />
          An observation for every sample
        </label>
        <label className="flex items-center gap-xs text-body-md text-ink">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={step.deviationReview}
            onChange={(e) => onChange((s) => ({ ...s, deviationReview: e.target.checked }))}
          />
          Deviation review sign-off
        </label>
      </div>
      {step.deviationReview && (
        <p className="mt-xxs max-w-[64ch] text-caption text-muted">
          Someone confirms at this step that every deviation so far was reviewed. Readings outside their expected
          value or range are flagged as deviations automatically; this box is not needed for that.
        </p>
      )}

      <ul className="mt-xs space-y-xs">
        {step.sampleRules.map((rule, r) => {
          const countKey = `${rule.key}.count`;
          const typeKey = `${rule.key}.type`;
          return (
            <li key={rule.key} className="flex flex-wrap items-start gap-xs">
              <span className="flex h-[44px] items-center text-body-md text-body">At least</span>
              <div className="w-[80px]">
                <label htmlFor={countKey} className="sr-only">
                  Step {n} required samples {r + 1} count
                </label>
                <input
                  id={countKey}
                  ref={bind(countKey)}
                  className={`input ${errors[countKey] ? 'border-danger-text focus:border-danger-text' : ''}`}
                  inputMode="numeric"
                  value={rule.count}
                  onChange={(e) => setRule(rule.key, { count: e.target.value }, countKey)}
                  {...invalidProps(countKey, errors[countKey])}
                />
              </div>
              <div className="w-[120px]">
                <label htmlFor={typeKey} className="sr-only">
                  Step {n} required samples {r + 1} type
                </label>
                <select
                  id={typeKey}
                  ref={bind(typeKey)}
                  className={`input ${errors[typeKey] ? 'border-danger-text focus:border-danger-text' : ''}`}
                  value={rule.sample_type}
                  onChange={(e) => setRule(rule.key, { sample_type: e.target.value as SampleType }, typeKey)}
                  {...invalidProps(typeKey, errors[typeKey])}
                >
                  {SAMPLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <span className="flex h-[44px] items-center text-body-md text-body">
                sample{rule.count.trim() === '1' ? '' : 's'}
              </span>
              <button
                type="button"
                className="icon-btn mt-[6px]"
                aria-label={`Remove required samples ${r + 1} from step ${n}`}
                onClick={() => onChange((s) => ({ ...s, sampleRules: s.sampleRules.filter((x) => x.key !== rule.key) }))}
              >
                <IconClose className="h-4 w-4" />
              </button>
              <div className="basis-full">
                <FieldError id={`${countKey}-error`} message={errors[countKey]} />
                <FieldError id={`${typeKey}-error`} message={errors[typeKey]} />
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="btn-ghost mt-xxs h-8 px-xs text-[13px]"
        disabled={step.sampleRules.length >= SAMPLE_TYPES.length}
        onClick={() => {
          const used = new Set(step.sampleRules.map((x) => x.sample_type));
          const rule = { key: newKey(), sample_type: SAMPLE_TYPES.find((t) => !used.has(t)) ?? SAMPLE_TYPES[0], count: '1' };
          onChange((s) => ({ ...s, sampleRules: [...s.sampleRules, rule] }));
          onAddRule(rule.key);
        }}
      >
        <IconPlus className="h-4 w-4" /> Add required samples
      </button>
      {kept && <p className="mt-xxs text-caption text-muted">{kept}</p>}
    </fieldset>
  );
}

function ProtocolFormPage() {
  const editId = useSearchParams().get('edit');
  const protocols = useProtocolList();
  if (!editId) return <ProtocolEditor />;
  if (protocols.isLoading) return <main className="page"><div className="skeleton h-9 w-64" /></main>;

  const source = protocols.data?.find((p) => p.id === editId);
  if (!source)
    return (
      <main id="main" className="page">
        <h1 className="page-title">Protocol unavailable</h1>
        <p className="mt-sm text-body-md text-muted">It may have been deleted, or it is not one you can read.</p>
      </main>
    );
  // The server is the guarantee (PUT /protocols refuses); this just avoids offering a form that cannot save.
  const inUse = (source.experiments?.[0]?.count ?? 0) > 0;
  if (source.owner_id == null || inUse)
    return (
      <main id="main" className="page">
        <h1 className="page-title">{source.protocol_code} can&apos;t be edited</h1>
        <p className="mt-sm max-w-[60ch] text-body-md text-muted">
          {inUse
            ? 'An experiment uses it, so its steps are the procedure that run was recorded against. Create a new protocol or version instead.'
            : 'It is a shared library protocol.'}
        </p>
        <Link href={`/protocols?id=${source.id}`} className="btn-secondary mt-md inline-flex">
          Back to the protocol
        </Link>
      </main>
    );
  return <ProtocolEditor key={source.id} source={source} />;
}

export default function ProtocolFormRoute() {
  return (
    <Suspense fallback={<main className="page" />}>
      <ProtocolFormPage />
    </Suspense>
  );
}
