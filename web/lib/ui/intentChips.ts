/**
 * The "Understood" chips (specs/005 contracts/ui-voice-surfaces.md §2).
 *
 * Built only from a successful tool result and the bound run, never from the
 * transcript: the values shown are the values stored (Constitution
 * Principle I). A missing field drops its chip rather than being filled in.
 */

import { displayName } from './displayName';

export interface IntentChip {
  label: string;
  value: string;
  kind: 'intent' | 'value' | 'context';
}

export interface IntentContext {
  /** The bound experiment's step index at the moment the tool was called. */
  stepIndex?: number;
  totalSteps?: number;
  /** Vocabulary display name for a stored measurement_type. */
  typeName?: (raw: string) => string;
}

/** Tools that change the record: they get chips, a confirm card and a capture card. */
export const MUTATING_TOOLS = new Set([
  'record_measurement',
  'correct_measurement',
  'record_observation',
  'create_deviation',
  'complete_protocol_step',
  'step_timer',
  'complete_experiment',
  'create_experiment',
  'start_experiment',
  'write_protocol_step',
]);

const READ_ONLY = /^(get_|check_|list_)/;

const has = (v: unknown) => v !== undefined && v !== null && v !== '';
const str = (v: unknown) => String(v);
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const humanise = (tool: string) => titleCase(tool.replace(/_/g, ' ').trim());

function typeLabel(raw: unknown, ctx?: IntentContext): string | null {
  if (!has(raw)) return null;
  return displayName(ctx?.typeName?.(str(raw)) ?? str(raw));
}

export function intentChips(
  tool: string,
  data: Record<string, unknown>,
  bound: { code: string } | null,
  ctx?: IntentContext,
): IntentChip[] {
  if (READ_ONLY.test(tool)) return [];

  const chips: IntentChip[] = [];
  const intent = (value: string) => chips.push({ label: 'Intent', value, kind: 'intent' });
  const value = (label: string | null, v: unknown) => {
    if (label && has(v)) chips.push({ label, value: str(v), kind: 'value' });
  };
  const run = (code: unknown) => {
    if (has(code)) chips.push({ label: 'Run', value: str(code), kind: 'context' });
  };
  const withUnit = (v: unknown, unit: unknown) => (has(unit) ? `${str(v)} ${str(unit)}` : str(v));

  switch (tool) {
    case 'record_measurement':
      intent('Log reading');
      if (has(data.value))
        value(typeLabel(data.measurement_type, ctx), withUnit(data.value, data.unit));
      value('Sample', data.sample_code);
      run(bound?.code);
      break;
    case 'correct_measurement':
      intent('Correct reading');
      if (has(data.previous_value) && has(data.new_value)) {
        value(
          typeLabel(data.measurement_type, ctx),
          withUnit(`${str(data.previous_value)} → ${str(data.new_value)}`, data.unit),
        );
      }
      value('Sample', data.sample_code);
      run(bound?.code);
      break;
    case 'record_observation':
      intent('Add note');
      // "All samples" stores one note per sample and returns their codes.
      value('Sample', Array.isArray(data.sample_codes) ? data.sample_codes.join(', ') : data.sample_code);
      run(bound?.code);
      break;
    case 'create_deviation':
      intent('Flag deviation');
      value('Severity', data.severity);
      run(bound?.code);
      break;
    case 'complete_protocol_step': {
      intent('Advance step');
      const done = (data.completed_step as { name?: unknown } | null | undefined)?.name;
      value('Done', done);
      if (ctx?.stepIndex != null && ctx.totalSteps) {
        value('Now', `Step ${Math.min(ctx.stepIndex + 2, ctx.totalSteps)} of ${ctx.totalSteps}`);
      }
      break;
    }
    case 'step_timer': {
      const timer = data.timer as
        { state?: unknown; duration_spoken?: unknown; step_name?: unknown } | null | undefined;
      if (timer && timer.state === 'running') {
        intent('Start timer');
        value('Duration', timer.duration_spoken);
        value('Step', timer.step_name);
      } else {
        intent('Cancel timer');
      }
      break;
    }
    case 'complete_experiment':
      intent('Finish run');
      run(data.experiment_code ?? bound?.code);
      if (data.status === 'COMPLETED') value('Status', 'Completed');
      break;
    case 'create_experiment':
      intent('New experiment');
      run(data.experiment_code);
      value('Protocol', data.protocol_code);
      break;
    case 'start_experiment':
      intent('Start run');
      run(data.experiment_code);
      break;
    default:
      intent(humanise(tool));
  }
  return chips.slice(0, 4);
}
