/**
 * "Captured this session" (specs/005 data-model §7, contracts/ui-voice-surfaces.md §3).
 *
 * Built from stored audit events, never from what was heard: an entry exists
 * only because the record system wrote it (Constitution Principle V), and a
 * refused request has no event, so it has no card. The quoted words are a
 * display-only decoration, filed at dispatch time by the voice session.
 */
import { toLocalMs } from '@/components/timer/clock';
import { displayName } from './displayName';

export interface EventRow {
  id: string;
  experiment_id?: string;
  event_type: string;
  entity_type?: string | null;
  entity_id?: string | null;
  payload?: Record<string, unknown> | null;
  voice_session_id?: string | null;
  created_at: string;
}

export type CaptureKind =
  'reading' | 'correction' | 'note' | 'deviation' | 'step' | 'timer' | 'run';

export interface CaptureEntry {
  id: string;
  kind: CaptureKind;
  at: string;
  label: string;
  value: string | null;
  meta: string | null;
  quote: string | null;
}

const two = (n: number) => String(n).padStart(2, '0');

export function formatElapsed(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

function wallClock(iso: string): string {
  const d = new Date(iso);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

const has = (v: unknown) => v !== undefined && v !== null && v !== '';
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const humanise = (eventType: string) => titleCase(eventType.toLowerCase().replace(/_/g, ' '));

export function captureEntries(
  events: EventRow[],
  sessionId: string | null,
  sessionStartedAt: number | null,
  offsetMs: number,
  quotes: ReadonlyMap<string, string>,
  deviationsById: Record<string, { protocol_step_index: number | null }>,
  typeName?: (raw: string) => string,
): CaptureEntry[] {
  if (!sessionId) return [];

  const type = (raw: unknown) =>
    has(raw) ? displayName(typeName?.(String(raw)) ?? String(raw)) : 'Reading';

  return events
    .filter((e) => e.voice_session_id === sessionId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((e) => {
      const p = e.payload ?? {};
      const at =
        sessionStartedAt != null
          ? formatElapsed(toLocalMs(e.created_at, offsetMs) - sessionStartedAt)
          : wallClock(e.created_at);
      const quoteOf = (key: string | null | undefined) => (key ? (quotes.get(key) ?? null) : null);
      const base = { id: e.id, at };

      switch (e.event_type) {
        case 'MEASUREMENT_CREATED':
          return {
            ...base,
            kind: 'reading' as const,
            label: type(p.measurement_type),
            value: has(p.value) ? `${p.value}${has(p.unit) ? ` ${p.unit}` : ''}` : null,
            meta: has(p.sample_code) ? `Sample ${p.sample_code}` : null,
            quote: quoteOf(e.entity_id),
          };
        case 'MEASUREMENT_CORRECTED':
          return {
            ...base,
            kind: 'correction' as const,
            label: type(p.measurement_type),
            value: has(p.from) && has(p.to) ? `${p.from} → ${p.to}` : null,
            meta: has(p.sample_code) ? `Sample ${p.sample_code}` : null,
            quote: quoteOf(e.entity_id),
          };
        case 'OBSERVATION_CREATED':
          return {
            ...base,
            kind: 'note' as const,
            label: 'Note',
            value: null,
            meta: has(p.observation) ? String(p.observation) : null,
            quote: quoteOf(e.entity_id),
          };
        case 'DEVIATION_CREATED': {
          const step = e.entity_id ? deviationsById[e.entity_id]?.protocol_step_index : null;
          return {
            ...base,
            kind: 'deviation' as const,
            label: 'Deviation',
            value: has(p.description) ? String(p.description) : null,
            meta: step != null ? `on step ${step + 1}` : null,
            quote: quoteOf(e.entity_id),
          };
        }
        case 'PROTOCOL_STEP_COMPLETED': {
          const index = typeof p.step_index === 'number' ? p.step_index : null;
          return {
            ...base,
            kind: 'step' as const,
            label: 'Step complete',
            value: has(p.step_name)
              ? String(p.step_name)
              : index != null
                ? `Step ${index + 1}`
                : null,
            meta: null,
            quote: index != null ? quoteOf(`step:${index}`) : null,
          };
        }
        case 'PROTOCOL_STEP_STARTED':
          return {
            ...base,
            kind: 'step' as const,
            label: 'Step started',
            value: has(p.step_name) ? String(p.step_name) : null,
            meta: null,
            quote: null,
          };
        case 'DEVIATIONS_REVIEWED':
          return {
            ...base,
            kind: 'run' as const,
            label: 'Deviations reviewed',
            value: typeof p.deviation_count === 'number' ? `${p.deviation_count} deviation${p.deviation_count === 1 ? '' : 's'}` : null,
            meta: null,
            quote: null,
          };
        case 'TIMER_STARTED':
        case 'TIMER_CANCELLED':
          return {
            ...base,
            kind: 'timer' as const,
            label: e.event_type === 'TIMER_STARTED' ? 'Timer started' : 'Timer cancelled',
            value: has(p.duration_spoken) ? String(p.duration_spoken) : null,
            meta: null,
            quote: null,
          };
        case 'EXPERIMENT_COMPLETED':
          return {
            ...base,
            kind: 'run' as const,
            label: 'Run finished',
            value: null,
            meta: null,
            quote: null,
          };
        default:
          return {
            ...base,
            kind: 'run' as const,
            label: humanise(e.event_type),
            value: null,
            meta: null,
            quote: null,
          };
      }
    });
}
