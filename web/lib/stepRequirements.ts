/**
 * A protocol step's requirements in words, for the views that show a protocol
 * (specs/007). Read-only: the stored step is the source, and nothing here
 * decides completeness — the server does (api/app/tools/completeness.py).
 *
 * Readings come from `required_fields`, as they always have; what a reading
 * should be (exact value or range) and everything else comes from the
 * structured `requirements` and duration fields.
 */

import type { StoredRequirement } from '@/lib/api';
import type { ProtocolStep } from '@/lib/queries/useExperiment';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const same = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const allSamples = (r: StoredRequirement) => (r.scope ?? 'all_samples') === 'all_samples';

export function formatSeconds(value: number): string {
  return value % 60 === 0 ? `${value / 60} min` : `${value} s`;
}

/** "14 min–17 min", "at least 14 min", "at most 17 min", or null when neither end is set. */
export function windowText(low?: number, high?: number): string | null {
  if (low !== undefined && high !== undefined) return `${formatSeconds(low)}–${formatSeconds(high)}`;
  if (low !== undefined) return `at least ${formatSeconds(low)}`;
  if (high !== undefined) return `at most ${formatSeconds(high)}`;
  return null;
}

/** "exactly 7", "2 to 8", "at least 2", "at most 8", or null when the requirement expects no value. */
export function expectationText(r: StoredRequirement | undefined): string | null {
  if (!r) return null;
  if (isNum(r.exact)) return `exactly ${r.exact}`;
  if (isNum(r.min) && isNum(r.max)) return `${r.min} to ${r.max}`;
  if (isNum(r.min)) return `at least ${r.min}`;
  if (isNum(r.max)) return `at most ${r.max}`;
  return null;
}

function measurementFor(step: ProtocolStep, type: string): StoredRequirement | undefined {
  return (step.requirements ?? []).find((r) => r.type === 'measurement' && same(r.measurement_type, type) && allSamples(r));
}

/** What a required reading should be at this step, e.g. "2 to 8", or null. */
export function expectationFor(step: ProtocolStep, type: string): string | null {
  return expectationText(measurementFor(step, type));
}

/** The unit a reading is recorded in: the requirement's, else the step's default. */
export function unitForReading(step: ProtocolStep, type: string): string | undefined {
  const required = measurementFor(step, type)?.unit;
  return (typeof required === 'string' && required) || step.default_unit?.[type];
}

/** Everything a step requires beyond its listed readings, one line each. */
export function requirementLines(step: ProtocolStep): string[] {
  const requirements = step.requirements ?? [];
  const readings = new Set((step.required_fields ?? []).filter((f) => f !== 'sample_id').map((f) => f.toLowerCase()));
  const lines: string[] = [];

  // A measurement not listed as a reading (written through the API) is still required.
  for (const r of requirements) {
    if (r.type !== 'measurement' || (allSamples(r) && readings.has(String(r.measurement_type).toLowerCase()))) continue;
    const detail = [r.unit, expectationText(r)].filter(Boolean).join(', ');
    lines.push(`${r.measurement_type}${detail ? ` (${detail})` : ''} ${allSamples(r) ? 'for every sample' : 'once for the run'}`);
  }
  if (requirements.some((r) => r.type === 'observation' && allSamples(r))) lines.push('An observation for every sample');
  if (requirements.some((r) => r.type === 'observation' && !allSamples(r))) lines.push('One observation for the run');

  const rules = requirements.filter((r) => r.type === 'samples' && isNum(r.count));
  if (rules.length) {
    const one = rules.length === 1 && rules[0].count === 1;
    lines.push(`At least ${rules.map((r) => `${r.count} ${r.sample_type}`).join(' and ')} sample${one ? '' : 's'}`);
  }

  const { expected_duration_seconds: expected, min_duration_seconds: low, max_duration_seconds: high } = step;
  if (expected !== undefined || low !== undefined || high !== undefined) {
    const window = windowText(low, high);
    lines.push(['Timed', expected !== undefined ? formatSeconds(expected) : null, window && `(allowed ${window})`].filter(Boolean).join(' '));
  }
  if (requirements.some((r) => r.type === 'step_execution')) lines.push('Must be started and completed');
  if (requirements.some((r) => r.type === 'deviation_review')) lines.push('Deviation review sign-off');
  return lines;
}

/**
 * What a protocol needs in samples before a run can be created, in one sentence,
 * or null when it needs nothing. Mirrors the server's check
 * (api/app/lifecycle.py sample_shortfall, specs/007 FR-713), which stays the
 * authority: per type the LARGEST count any step asks for, and at least one
 * sample when anything is recorded "for every sample".
 */
export function sampleCompositionText(steps: ProtocolStep[]): string | null {
  const needed = new Map<string, number>();
  let everySample = false;
  for (const step of steps) {
    const requirements = step.requirements ?? [];
    for (const r of requirements) {
      if (r.type === 'samples' && isNum(r.count)) {
        const type = String(r.sample_type).toLowerCase();
        needed.set(type, Math.max(needed.get(type) ?? 0, r.count));
      } else if ((r.type === 'measurement' || r.type === 'observation') && allSamples(r)) {
        everySample = true;
      }
    }
    if ((step.required_fields ?? []).some((f) => f && f !== 'sample_id')) everySample = true;
  }
  if (needed.size) {
    const parts = [...needed].map(([type, n]) => `${n} ${type} sample${n === 1 ? '' : 's'}`);
    return `This protocol needs at least ${parts.join(' and ')}.`;
  }
  return everySample ? 'This protocol records readings for every sample, so list at least one.' : null;
}
