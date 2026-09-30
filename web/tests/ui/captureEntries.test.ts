import { describe, expect, it } from 'vitest';
import { captureEntries, formatElapsed, type EventRow } from '@/lib/ui/captureEntries';
import { fixture } from './fixtures';

const events = fixture<{
  rows: EventRow[];
  deviations: { id: string; protocol_step_index: number | null }[];
  quotes_sess_A: Record<string, string>;
  expected_sess_A_order: string[];
}>('events');
const voice = fixture<{
  cases: Record<string, { sessionStartedAt: number | null; offsetMs: number }>;
}>('voice-state');

const START = voice.cases.bench_listening.sessionStartedAt; // 09:10:00.000Z
const quotes = new Map(Object.entries(events.quotes_sess_A));
const deviationsById = Object.fromEntries(events.deviations.map((d) => [d.id, d]));
const entries = (sessionId: string | null = 'sess-A', start = START, offsetMs = 0) =>
  captureEntries(events.rows, sessionId, start, offsetMs, quotes, deviationsById);
const byId = (id: string) => entries().find((e) => e.id === id)!;

describe('captureEntries (data-model §7, ui-voice-surfaces §3)', () => {
  it('includes only this session, newest first', () => {
    const list = entries();
    expect(list.map((e) => e.id)).toEqual(events.expected_sess_A_order);
    expect(list.some((e) => e.id === 'e-10' || e.id === 'e-11')).toBe(false);
  });

  it('is empty with no live session', () => {
    expect(entries(null)).toEqual([]);
  });

  it('shows a stored reading', () => {
    expect(byId('e-01')).toMatchObject({
      kind: 'reading',
      label: 'Temperature',
      value: '37.2 °C',
      meta: 'Sample A',
      quote: 'Sample A, temperature thirty-seven point two Celsius',
    });
  });

  it('shows a correction as from → to', () => {
    expect(byId('e-02')).toMatchObject({
      kind: 'correction',
      label: 'Temperature',
      value: '37.2 → 37.4',
      meta: 'Sample A',
    });
  });

  it('shows a note with its text as the meta', () => {
    expect(byId('e-03')).toMatchObject({
      kind: 'note',
      label: 'Note',
      value: null,
      meta: 'Slight turbidity in the supernatant',
    });
  });

  it('shows a deviation with the step it happened on', () => {
    expect(byId('e-04')).toMatchObject({
      kind: 'deviation',
      label: 'Deviation',
      value: 'Incubator door open for two minutes',
      meta: 'on step 6',
      quote: 'Flag a deviation: incubator door open for two minutes',
    });
  });

  it('shows a step completion by name, or by number when the name is missing', () => {
    expect(byId('e-05')).toMatchObject({
      kind: 'step',
      label: 'Step complete',
      value: 'Incubate',
      quote: 'Next step',
    });
    expect(byId('e-06')).toMatchObject({ kind: 'step', value: 'Step 5', quote: null });
  });

  it('shows timers and the finished run', () => {
    expect(byId('e-07')).toMatchObject({
      kind: 'timer',
      label: 'Timer started',
      value: '10 minutes',
    });
    expect(byId('e-08')).toMatchObject({ kind: 'run', label: 'Run finished', value: null });
  });

  it('keeps an unknown event type rather than dropping it', () => {
    expect(byId('e-09')).toMatchObject({ kind: 'run', label: 'Sample created' });
  });

  it('times entries from the start of the session', () => {
    expect(byId('e-01').at).toBe('00:05:45');
    expect(byId('e-09').at).toBe('00:04:00');
  });

  it('corrects for device clock skew and never shows a negative time', () => {
    const skew = voice.cases.clock_skew;
    const row: EventRow = { ...events.rows[0], id: 'skew', created_at: '2026-09-28T09:09:57.000Z' };
    const [entry] = captureEntries(
      [row],
      'sess-A',
      skew.sessionStartedAt,
      skew.offsetMs,
      quotes,
      deviationsById,
    );
    expect(entry.at).toBe('00:00:01');
    const [early] = captureEntries(
      [row],
      'sess-A',
      skew.sessionStartedAt,
      0,
      quotes,
      deviationsById,
    );
    expect(early.at).toBe('00:00:00');
  });

  it('falls back to the server wall clock when the session start is unknown', () => {
    const d = new Date(events.rows[0].created_at);
    const expected = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
    expect(entries('sess-A', null).find((e) => e.id === 'e-01')!.at).toBe(expected);
  });

  it('shows missing payload fields as null, never inventing a value', () => {
    const bare: EventRow = { ...events.rows[0], id: 'bare', entity_id: 'x', payload: {} };
    expect(captureEntries([bare], 'sess-A', START, 0, quotes, deviationsById)[0]).toMatchObject({
      kind: 'reading',
      label: 'Reading',
      value: null,
      meta: null,
      quote: null,
    });
  });

  it('formats elapsed time', () => {
    expect(formatElapsed(0)).toBe('00:00:00');
    expect(formatElapsed(3_723_000)).toBe('01:02:03');
    expect(formatElapsed(-5)).toBe('00:00:00');
  });
});
