/**
 * The protocol form's state and its translation to and from the stored protocol
 * (specs/002 manual authoring, extended by specs/007).
 *
 * Kept out of the page so the edit round trip is testable: a protocol opened for
 * editing and saved unchanged must come back unchanged, including anything this
 * form does not show (a timed step's window, a requirement written by the API).
 * Those ride along in `kept` and are sent back as they were.
 *
 * Validation here is for fast feedback only. The server applies the same rules
 * (api/app/tools/requirements.py) and is the guarantee.
 */

import type { MeasurementType, ProtocolDraft, ReadingPayload, StoredRequirement } from '@/lib/api';
import type { ProtocolStep } from '@/lib/queries/useExperiment';
import { formatSeconds, windowText } from '@/lib/stepRequirements';

export type Expect = 'any' | 'exact' | 'range';

export interface ReadingDraft {
  key: string;
  type: string;
  unit: string;
  expect: Expect;
  /** Numbers as typed, so a half-typed "7." is not rewritten under the cursor. */
  exact: string;
  min: string;
  max: string;
}

/** The web forms offer these two; the backend accepts any lowercase word (voice, API). */
export const SAMPLE_TYPES = ['test', 'control'] as const;
export type SampleType = (typeof SAMPLE_TYPES)[number];

export interface SampleRuleDraft {
  key: string;
  sample_type: SampleType;
  count: string;
}

export interface KeptFields {
  requirements: StoredRequirement[];
  expected_duration_seconds?: number;
  min_duration_seconds?: number;
  max_duration_seconds?: number;
}

export interface StepDraft {
  key: string;
  name: string;
  readings: ReadingDraft[];
  observationPerSample: boolean;
  deviationReview: boolean;
  sampleRules: SampleRuleDraft[];
  /** Stored, not shown: sent back unchanged. */
  kept: KeptFields;
}

export interface FormState {
  protocol_code: string;
  name: string;
  version: string;
  steps: StepDraft[];
}

/**
 * Field keys for error messages: 'form', 'protocol_code', 'name', 'version',
 * `${stepKey}.name`, `${stepKey}.step`, `${readingKey}.type|unit|expect`, `${ruleKey}.type|count`.
 */
export type Errors = Record<string, string>;

const DURATIONS = ['expected_duration_seconds', 'min_duration_seconds', 'max_duration_seconds'] as const;

export const newKey = () => crypto.randomUUID();

export const emptyReading = (): ReadingDraft => ({
  key: newKey(),
  type: '',
  unit: '',
  expect: 'any',
  exact: '',
  min: '',
  max: '',
});

export const emptyStep = (): StepDraft => ({
  key: newKey(),
  name: '',
  readings: [],
  observationPerSample: false,
  deviationReview: false,
  sampleRules: [],
  kept: { requirements: [] },
});

export const emptyForm = (): FormState => ({ protocol_code: '', name: '', version: 'v1', steps: [emptyStep()] });

const same = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const shown = (v: unknown) => (isNum(v) ? String(v) : '');
const allSamples = (r: StoredRequirement) => (r.scope ?? 'all_samples') === 'all_samples';
const hasExpectation = (r: StoredRequirement) => isNum(r.exact) || isNum(r.min) || isNum(r.max);

/** One stored step into form state. Every requirement is either shown or kept. */
function stepFromStored(step: ProtocolStep): StepDraft {
  const requirements = step.requirements ?? [];
  const shownIndex = new Set<number>();

  const readings = (step.required_fields ?? [])
    .filter((field) => field !== 'sample_id')
    .map((type): ReadingDraft => {
      // The reading's expectation. A requirement that says more than the form can
      // show (another scope, a required unit without an expectation) stays in `kept`.
      const at = requirements.findIndex(
        (r, i) =>
          !shownIndex.has(i) &&
          r.type === 'measurement' &&
          same(r.measurement_type, type) &&
          allSamples(r) &&
          (hasExpectation(r) || !r.unit),
      );
      const r = at >= 0 ? requirements[at] : undefined;
      if (at >= 0) shownIndex.add(at);
      return {
        key: newKey(),
        type,
        unit: (typeof r?.unit === 'string' && r.unit) || step.default_unit?.[type] || '',
        expect: isNum(r?.exact) ? 'exact' : isNum(r?.min) || isNum(r?.max) ? 'range' : 'any',
        exact: shown(r?.exact),
        min: shown(r?.min),
        max: shown(r?.max),
      };
    });

  let observationPerSample = false;
  let deviationReview = false;
  const sampleRules: SampleRuleDraft[] = [];
  requirements.forEach((r, i) => {
    if (shownIndex.has(i)) return;
    if (r.type === 'observation' && allSamples(r)) {
      observationPerSample = true;
      shownIndex.add(i);
    } else if (r.type === 'deviation_review') {
      deviationReview = true;
      shownIndex.add(i);
    } else if (r.type === 'samples' && SAMPLE_TYPES.includes(r.sample_type as SampleType) && isNum(r.count)) {
      sampleRules.push({ key: newKey(), sample_type: r.sample_type as SampleType, count: String(r.count) });
      shownIndex.add(i);
    }
  });

  const kept: KeptFields = { requirements: requirements.filter((_, i) => !shownIndex.has(i)) };
  for (const field of DURATIONS) if (isNum(step[field])) kept[field] = step[field];

  return { key: newKey(), name: step.name, readings, observationPerSample, deviationReview, sampleRules, kept };
}

/** A stored protocol back into form state. */
export function fromStored(protocol: {
  protocol_code: string;
  name: string;
  version: string | null;
  steps: ProtocolStep[];
}): FormState {
  return {
    protocol_code: protocol.protocol_code,
    name: protocol.name,
    version: protocol.version ?? 'v1',
    steps: protocol.steps.map(stepFromStored),
  };
}

function readingPayload(r: ReadingDraft): ReadingPayload {
  const out: ReadingPayload = { type: r.type.trim() };
  if (r.unit.trim()) out.unit = r.unit.trim();
  if (r.expect === 'exact' && r.exact.trim()) out.exact = Number(r.exact);
  if (r.expect === 'range') {
    if (r.min.trim()) out.min = Number(r.min);
    if (r.max.trim()) out.max = Number(r.max);
  }
  return out;
}

/** What gets sent, and what "dirty" is measured against: the words and their order, never the keys. */
export function toDraft(form: FormState): ProtocolDraft {
  return {
    protocol_code: form.protocol_code.trim(),
    name: form.name.trim(),
    version: form.version.trim(),
    steps: form.steps.map((step) => {
      const requirements: StoredRequirement[] = [
        ...(step.observationPerSample ? [{ type: 'observation', scope: 'all_samples' }] : []),
        ...(step.deviationReview ? [{ type: 'deviation_review' }] : []),
        ...step.sampleRules.map((rule) => ({ type: 'samples', sample_type: rule.sample_type, count: Number(rule.count) })),
        ...step.kept.requirements,
      ];
      const durations = Object.fromEntries(DURATIONS.filter((f) => step.kept[f] !== undefined).map((f) => [f, step.kept[f]]));
      return {
        name: step.name.trim(),
        readings: step.readings.filter((r) => r.type.trim()).map(readingPayload),
        ...(requirements.length ? { requirements } : {}),
        ...durations,
      };
    }),
  };
}

export function listedType(types: MeasurementType[], name: string): MeasurementType | undefined {
  return types.find((t) => same(t.name, name));
}

/** A unit is needed once a reading has an expected value, except for a type with one unit (pH). */
export function needsUnit(reading: ReadingDraft, types: MeasurementType[]): boolean {
  return reading.expect !== 'any' && !reading.unit.trim() && !listedType(types, reading.type)?.dimensionless;
}

function number(text: string): number | null {
  const n = Number(text.trim());
  return text.trim() && Number.isFinite(n) ? n : null;
}

export function validate(form: FormState, types: MeasurementType[] = []): Errors {
  const errors: Errors = {};
  if (!form.protocol_code.trim()) errors.protocol_code = 'Give the protocol a code.';
  else if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/.test(form.protocol_code.trim()))
    errors.protocol_code = '2–32 letters, digits, dots, dashes or underscores, starting with a letter or digit.';
  if (!form.name.trim()) errors.name = 'Give the protocol a name.';
  if (!form.version.trim()) errors.version = 'Give the protocol a version.';

  form.steps.forEach((step, i) => {
    if (!step.name.trim()) errors[`${step.key}.name`] = `Step ${i + 1} needs a name.`;

    const expectedTypes = new Set<string>();
    for (const reading of step.readings) {
      const type = reading.type.trim().toLowerCase();
      if (!type) {
        // A blank row is dropped on save (toDraft), which is fine when nothing
        // is in it; a unit or expected value without a type would vanish silently.
        const filled = reading.unit.trim() || (reading.expect !== 'any' && (reading.exact.trim() || reading.min.trim() || reading.max.trim()));
        if (filled) errors[`${reading.key}.type`] = 'Say what is measured, or remove this reading.';
        continue;
      }
      if (reading.expect !== 'any') {
        if (expectedTypes.has(type)) errors[`${reading.key}.type`] = `${reading.type.trim()} already has an expected value at this step.`;
        expectedTypes.add(type);
      }
      if (needsUnit(reading, types)) errors[`${reading.key}.unit`] = 'Choose a unit: the expected value is compared in it.';

      if (reading.expect === 'exact' && number(reading.exact) === null) {
        errors[`${reading.key}.expect`] = 'Enter the exact value as a number.';
      } else if (reading.expect === 'range') {
        const low = number(reading.min);
        const high = number(reading.max);
        if (!reading.min.trim() && !reading.max.trim()) errors[`${reading.key}.expect`] = 'Enter a minimum, a maximum, or both.';
        else if ((reading.min.trim() && low === null) || (reading.max.trim() && high === null))
          errors[`${reading.key}.expect`] = 'Minimum and maximum must be numbers.';
        else if (low !== null && high !== null && low > high) errors[`${reading.key}.expect`] = 'The minimum is above the maximum.';
      }
    }

    const ruleTypes = new Set<string>();
    for (const rule of step.sampleRules) {
      const count = Number(rule.count);
      if (!Number.isInteger(count) || count < 1 || count > 50) errors[`${rule.key}.count`] = 'A whole number from 1 to 50.';
      if (ruleTypes.has(rule.sample_type)) errors[`${rule.key}.type`] = `${rule.sample_type} is already listed at this step.`;
      ruleTypes.add(rule.sample_type);
    }
  });
  return errors;
}

/** Map a server rejection onto the field it is about (contracts/protocols-api.md). */
export function serverErrors(form: FormState, error: string, message: string, detail?: Record<string, unknown>): Errors {
  if (error === 'PROTOCOL_CODE_TAKEN') return { protocol_code: message };
  if (error === 'INVALID_UNIT') {
    const step = form.steps[Number(detail?.step_index)];
    const reading = step?.readings.find((r) => same(r.type, detail?.type));
    return reading ? { [`${reading.key}.unit`]: message } : { form: message };
  }
  if (error === 'INVALID_ARGS' && Array.isArray(detail?.errors)) {
    const errors: Errors = {};
    for (const e of detail.errors as { loc?: (string | number)[]; msg?: string }[]) {
      const [head, i, field, j, sub] = e.loc ?? [];
      const msg = (e.msg ?? 'Invalid value.').replace(/^Value error, /, '');
      if (head === 'steps' && typeof i === 'number') {
        const step = form.steps[i];
        const reading = field === 'readings' && typeof j === 'number' ? step?.readings.filter((r) => r.type.trim())[j] : undefined;
        if (reading) errors[`${reading.key}.${sub === 'unit' ? 'unit' : sub === 'type' ? 'type' : 'expect'}`] = msg;
        else if (step && field === 'name') errors[`${step.key}.name`] = msg;
        else if (step) errors[`${step.key}.step`] = msg;
        else errors.form = msg;
      } else if (head === 'steps') errors.form = 'Add at least one step, and no more than 200.';
      else if (typeof head === 'string' && ['protocol_code', 'name', 'version'].includes(head)) errors[head] = msg;
      else errors.form = msg;
    }
    return Object.keys(errors).length ? errors : { form: message };
  }
  return { form: message };
}

/** One line naming what is kept but not editable here, or null when nothing is. */
export function keptSummary(kept: KeptFields): string | null {
  const parts: string[] = [];
  const { expected_duration_seconds: expected, min_duration_seconds: low, max_duration_seconds: high } = kept;
  if (expected !== undefined || low !== undefined || high !== undefined) {
    const window = windowText(low, high);
    parts.push(['timed', expected !== undefined ? formatSeconds(expected) : null, window && `(allowed ${window})`].filter(Boolean).join(' '));
  }
  const other = kept.requirements.filter((r) => r.type !== 'step_execution').length;
  if (kept.requirements.some((r) => r.type === 'step_execution')) parts.push('must be started and completed');
  if (other) parts.push(`${other} other requirement${other === 1 ? '' : 's'}`);
  return parts.length ? `Kept as set elsewhere: ${parts.join('; ')}.` : null;
}
