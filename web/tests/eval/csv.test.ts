import { describe, expect, it } from 'vitest';
import { csvField, detailsToCsv, type Detail } from '@/lib/evalReport';

const detail = (over: Partial<Detail> = {}): Detail => ({
  scenario_id: 'norm_01',
  category: 'normal_capture',
  profile: 'bench',
  utterance: 'A17 is 4.2 Celsius.',
  expected: {},
  passed: true,
  calls: [{ tool: 'record_measurement', args: {}, success: true, error: null }],
  reply: 'Recorded. A17 temperature is 4.2 degrees Celsius.',
  ...over,
});

describe('csvField', () => {
  it('leaves plain text alone', () => expect(csvField('abc')).toBe('abc'));
  it('quotes commas, quotes and newlines', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('a\nb')).toBe('"a\nb"');
  });
  it('renders null as empty', () => expect(csvField(null)).toBe(''));
});

describe('detailsToCsv', () => {
  it('has the contract header and one row per detail', () => {
    const csv = detailsToCsv([detail(), detail({ scenario_id: 'inv_01', passed: false })]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('scenario_id,category,profile,utterance,passed,tools,errors,reply');
    expect(lines).toHaveLength(3);
    expect(lines[2].startsWith('inv_01,normal_capture,bench,')).toBe(true);
  });

  it('joins tools and non-null errors', () => {
    const csv = detailsToCsv([
      detail({
        calls: [
          { tool: 'record_measurement', args: {}, success: false, error: 'SAMPLE_NOT_FOUND' },
          { tool: 'get_active_experiment', args: {}, success: true, error: null },
        ],
      }),
    ]);
    expect(csv).toContain(',record_measurement get_active_experiment,SAMPLE_NOT_FOUND,');
  });
});
