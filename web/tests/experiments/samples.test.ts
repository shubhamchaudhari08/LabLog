import { describe, expect, it } from 'vitest';
import { parseSampleCodes } from '@/lib/samples';

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
