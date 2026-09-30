import { describe, expect, it } from 'vitest';
import { parseExample } from '@/lib/ui/parseExample';

const temperature = {
  name: 'temperature',
  units: ['°C', '°F'],
  default_unit: '°C',
  spoken_units: ['Celsius', 'Fahrenheit'],
  dimensionless: false,
};
const ph = { name: 'pH', units: ['pH'], default_unit: 'pH', spoken_units: [], dimensionless: true };
const pressure = {
  name: 'pressure',
  units: ['kPa'],
  default_unit: 'kPa',
  spoken_units: ['kilopascals'],
  dimensionless: false,
};

describe('parseExample (data-model §10)', () => {
  it('uses the starred unit when the phrase names no scale', () => {
    const ex = parseExample(temperature, 0);
    expect(ex.phrases[0]).toBe('thirty-seven point two degrees');
    expect(ex.tokens).toEqual([
      { text: 'thirty-seven point two', role: 'value' },
      { text: ' ', role: 'plain' },
      { text: 'degrees', role: 'unit' },
    ]);
    expect(ex.readout).toEqual({ type: 'Temperature', value: '37.2', unit: '°C' });
    expect(ex.note).toBe('No scale heard — used the starred unit, °C.');
    expect(ex.isExample).toBe(true);
  });

  it('uses the unit the phrase names', () => {
    const ex = parseExample(temperature, 1);
    expect(ex.phrases[1]).toBe('ninety-eight point six Fahrenheit');
    expect(ex.readout).toEqual({ type: 'Temperature', value: '98.6', unit: '°F' });
    expect(ex.note).toBeNull();
  });

  it('needs no scale for a dimensionless type', () => {
    const ex = parseExample(ph, 0);
    expect(ex.readout).toEqual({ type: 'pH', value: '7.4', unit: 'pH' });
    expect(ex.note).toBeNull();
  });

  it('falls back to a generic phrase for a type with no example', () => {
    const ex = parseExample(pressure, 0);
    expect(ex.phrases).toEqual(['ten kilopascals']);
    expect(ex.readout).toEqual({ type: 'Pressure', value: '10', unit: 'kPa' });
    expect(ex.isExample).toBe(true);
  });

  it('clamps an out-of-range phrase index', () => {
    expect(parseExample(ph, 5).phrases).toHaveLength(1);
  });
});
