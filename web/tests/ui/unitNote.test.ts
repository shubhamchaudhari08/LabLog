import { describe, expect, it } from 'vitest';
import { unitNote } from '@/lib/ui/unitNote';

const temperature = {
  name: 'temperature',
  units: ['°C', '°F'],
  spoken_units: ['Celsius', 'Fahrenheit', 'degrees'],
};

describe('unitNote (contracts/ui-voice-surfaces.md §4)', () => {
  it('says nothing when the quote names a spoken unit', () => {
    expect(
      unitNote('Sample A, temperature thirty-seven point two Celsius', '°C', temperature),
    ).toBeNull();
    expect(unitNote('sample a temp 37.2 degrees', '°C', temperature)).toBeNull();
  });

  it('says nothing when the quote names the unit symbol', () => {
    expect(unitNote('Sample A 37.2 °C', '°C', temperature)).toBeNull();
  });

  it('explains the default when no unit was heard', () => {
    expect(unitNote('Sample A, temperature thirty-seven point two', '°C', temperature)).toBe(
      'No unit heard — used the protocol or starred unit, °C.',
    );
  });

  it('says nothing without a quote: absence of evidence is not evidence', () => {
    expect(unitNote(null, '°C', temperature)).toBeNull();
  });

  it('says nothing when no unit was stored', () => {
    expect(
      unitNote('pH seven point four', null, { name: 'ph', units: ['pH'], spoken_units: [] }),
    ).toBeNull();
  });

  it('matches whole words only', () => {
    // "Fahrenheitish" is not "Fahrenheit"
    expect(unitNote('thirty Fahrenheitish', '°F', temperature)).not.toBeNull();
  });

  it('works without vocabulary for an unlisted type, using the stored unit', () => {
    expect(unitNote('five kilopascals', 'kPa', undefined)).not.toBeNull();
    expect(unitNote('five kPa', 'kPa', undefined)).toBeNull();
  });
});
