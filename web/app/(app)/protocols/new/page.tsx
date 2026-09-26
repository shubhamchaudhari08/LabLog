'use client';

/**
 * New protocol, written by hand (specs/002-manual-protocol-authoring).
 *
 * The form only collects the user's words and their order. Step indexes, ids,
 * owner and timestamps are the server's to assign (POST /protocols), so nothing
 * here sends them. Reading types come from the same vocabulary the voice agent
 * uses; an unlisted type is still allowed, with a free-text unit.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { usePageCrumbs } from '@/components/shell/AppShell';
import { IconChevron, IconClose, IconPlus, IconTrash } from '@/components/icons';
import { createProtocol, fetchMeasurementTypes, type MeasurementType, type ProtocolDraft } from '@/lib/api';

interface ReadingDraft {
  key: string;
  type: string;
  unit: string;
}

interface StepDraft {
  key: string;
  name: string;
  readings: ReadingDraft[];
}

interface FormState {
  protocol_code: string;
  name: string;
  version: string;
  steps: StepDraft[];
}

/** Field keys for error messages: 'protocol_code', 'name', 'version', `${stepKey}.name`, `${readingKey}.type|unit`. */
type Errors = Record<string, string>;

const newKey = () => crypto.randomUUID();
const emptyStep = (): StepDraft => ({ key: newKey(), name: '', readings: [] });

/** What gets sent, and what "dirty" is measured against: the words and their order, never the keys. */
function toDraft(form: FormState): ProtocolDraft {
  return {
    protocol_code: form.protocol_code.trim(),
    name: form.name.trim(),
    version: form.version.trim(),
    steps: form.steps.map((step) => ({
      name: step.name.trim(),
      readings: step.readings
        .filter((r) => r.type.trim())
        .map((r) => (r.unit.trim() ? { type: r.type.trim(), unit: r.unit.trim() } : { type: r.type.trim() })),
    })),
  };
}

function listedType(types: MeasurementType[], name: string): MeasurementType | undefined {
  const wanted = name.trim().toLowerCase();
  return types.find((t) => t.name.toLowerCase() === wanted);
}

function validate(form: FormState): Errors {
  const errors: Errors = {};
  if (!form.protocol_code.trim()) errors.protocol_code = 'Give the protocol a code.';
  else if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/.test(form.protocol_code.trim()))
    errors.protocol_code = '2–32 letters, digits, dots, dashes or underscores, starting with a letter or digit.';
  if (!form.name.trim()) errors.name = 'Give the protocol a name.';
  if (!form.version.trim()) errors.version = 'Give the protocol a version.';
  form.steps.forEach((step, i) => {
    if (!step.name.trim()) errors[`${step.key}.name`] = `Step ${i + 1} needs a name.`;
  });
  return errors;
}

/** Map a server rejection onto the field it is about (contracts/protocols-api.md). */
function serverErrors(form: FormState, error: string, message: string, detail?: Record<string, unknown>): Errors {
  if (error === 'PROTOCOL_CODE_TAKEN') return { protocol_code: message };
  if (error === 'INVALID_UNIT') {
    const step = form.steps[Number(detail?.step_index)];
    const reading = step?.readings.find((r) => r.type.trim().toLowerCase() === String(detail?.type).toLowerCase());
    return reading ? { [`${reading.key}.unit`]: message } : { form: message };
  }
  if (error === 'INVALID_ARGS' && Array.isArray(detail?.errors)) {
    const errors: Errors = {};
    for (const e of detail.errors as { loc?: (string | number)[]; msg?: string }[]) {
      const [head, i, field, j, sub] = e.loc ?? [];
      const msg = e.msg ?? 'Invalid value.';
      if (head === 'steps' && typeof i === 'number') {
        const step = form.steps[i];
        const reading = field === 'readings' && typeof j === 'number' ? step?.readings.filter((r) => r.type.trim())[j] : undefined;
        if (reading) errors[`${reading.key}.${sub === 'unit' ? 'unit' : 'type'}`] = msg;
        else if (step && field === 'name') errors[`${step.key}.name`] = msg;
        else errors.form = msg;
      } else if (head === 'steps') errors.form = 'Add at least one step, and no more than 200.';
      else if (typeof head === 'string' && ['protocol_code', 'name', 'version'].includes(head)) errors[head] = msg;
      else errors.form = msg;
    }
    return Object.keys(errors).length ? errors : { form: message };
  }
  return { form: message };
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-xxs text-[12px] text-error">
      {message}
    </p>
  );
}

export default function NewProtocolPage() {
  usePageCrumbs([{ label: 'Protocols', href: '/protocols' }, { label: 'New protocol' }]);

  const router = useRouter();
  const queryClient = useQueryClient();
  const types = useQuery({ queryKey: ['measurement-types'], queryFn: fetchMeasurementTypes, staleTime: Infinity });
  const vocabulary = types.data ?? [];

  const [form, setForm] = useState<FormState>(() => ({ protocol_code: '', name: '', version: 'v1', steps: [emptyStep()] }));
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
    if (dirty && !window.confirm('Discard this protocol draft?')) event.preventDefault();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) {
      setFocusKey(Object.keys(found)[0]);
      return;
    }

    setSaving(true);
    try {
      const result = await createProtocol(toDraft(form));
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

  const fieldClass = (key: string) => `input ${errors[key] ? 'border-error focus:border-error' : ''}`;
  const describe = (key: string) => (errors[key] ? { 'aria-invalid': true, 'aria-describedby': `${key}-error` } : {});

  return (
    <main id="main" className="page">
      <header className="animate-rise">
        <h1 className="page-title">New protocol</h1>
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
              <label htmlFor="name" className="mb-xxs block text-body-sm font-medium text-ink">
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
              <label htmlFor="protocol_code" className="mb-xxs block text-body-sm font-medium text-ink">
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
              <label htmlFor="version" className="mb-xxs block text-body-sm font-medium text-ink">
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
            <span className="text-caption text-muted-soft">
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
                  <span className="mt-[26px] grid h-7 w-7 shrink-0 place-items-center rounded-pill border-[1.5px] border-muted-soft/60 text-[12px] font-medium text-body">
                    {n}
                  </span>

                  <div className="min-w-0 flex-1">
                    <label htmlFor={nameKey} className="mb-xxs block text-body-sm font-medium text-ink">
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
                      <legend className="text-caption text-muted-soft">
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
                                  placeholder="temperature"
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
                                  <p className="flex h-10 items-center px-sm text-body-sm text-muted">
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
                                    <option value="">No default unit</option>
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
                          const reading = { key: newKey(), type: '', unit: '' };
                          updateStep(step.key, (s) => ({ ...s, readings: [...s.readings, reading] }));
                          setFocusKey(`${reading.key}.type`);
                        }}
                      >
                        <IconPlus className="h-4 w-4" /> Add reading
                      </button>
                    </fieldset>
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
                      className="icon-btn hover:text-error disabled:opacity-30"
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
          <p aria-live="polite" className="mr-auto text-body-sm text-error">
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
