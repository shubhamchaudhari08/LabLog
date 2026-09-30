import { describe, expect, it } from 'vitest';
import { parseSampleCodes, samplesPayload } from '@/lib/samples';

describe('parseSampleCodes', () => {
  it('splits on commas, semicolons, spaces and newlines', () => {
    expect(parseSampleCodes('A1, A2 A3;\nCONTROL-01')).toEqual(['A1', 'A2', 'A3', 'CONTROL-01']);
  });
  it('is empty for blank input', () => {
    expect(parseSampleCodes('  , \n ')).toEqual([]);
  });
  it('keeps case; the server uppercases', () => {
    expect(parseSampleCodes('a17')).toEqual(['a17']);
  });
});

describe('samplesPayload', () => {
  it('is the old request when no type is picked', () => {
    expect(samplesPayload(['A17', 'a18'], {})).toEqual({ sample_codes: ['A17', 'a18'] });
    expect(samplesPayload(['A17'], { A17: '' })).toEqual({ sample_codes: ['A17'] });
  });
  it('sends codes with their types once any is picked; unpicked ones omit it', () => {
    expect(samplesPayload(['a17', 'A18', 'CONTROL-01'], { A17: 'test', 'CONTROL-01': 'control' })).toEqual({
      samples: [{ code: 'a17', sample_type: 'test' }, { code: 'A18' }, { code: 'CONTROL-01', sample_type: 'control' }],
    });
  });
});
