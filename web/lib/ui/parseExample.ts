/**
 * "Hear it parsed" on the Measurements page (specs/005 data-model §10, FR-512,
 * DESIGN.md D-11).
 *
 * ILLUSTRATION DATA. The voice agent's model interprets speech; there is no
 * fixed parser to call, so this is a worked example, always labelled as one.
 * The phrases are fixed per type; the type name, units and starred default are
 * the vocabulary's real ones.
 */
import type { MeasurementType } from '@/lib/api';
import { displayName } from './displayName';

const EXAMPLES: Record<string, string[]> = {
  temperature: ['thirty-seven point two degrees', 'ninety-eight point six Fahrenheit'],
  mass: ['five point eight four grams'],
  volume: ['two hundred fifty milliliters'],
  ph: ['pH seven point four'],
  concentration: ['ten millimolar'],
  duration: ['ten minutes'],
  rpm: ['three thousand rpm'],
};

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const isNumberWord = (w: string) => {
  const lower = w.toLowerCase();
  return (
    lower in ONES ||
    lower in TENS ||
    lower === 'hundred' ||
    lower === 'thousand' ||
    lower === 'point' ||
    lower.split('-').every((part) => part in ONES || part in TENS)
  );
};

/** Words to a numeral, covering only the forms the examples use. */
function wordsToNumber(words: string[]): string {
  let total = 0;
  let current = 0;
  let decimals = '';
  let afterPoint = false;
  for (const raw of words) {
    const w = raw.toLowerCase();
    if (w === 'point') {
      afterPoint = true;
      continue;
    }
    const value = w.split('-').reduce((sum, part) => sum + (ONES[part] ?? TENS[part] ?? 0), 0);
    if (afterPoint) decimals += String(ONES[w] ?? value);
    else if (w === 'hundred') current *= 100;
    else if (w === 'thousand') {
      total += current * 1000;
      current = 0;
    } else current += value;
  }
  const whole = String(total + current);
  return decimals ? `${whole}.${decimals}` : whole;
}

export interface ParseExample {
  phrases: string[];
  tokens: { text: string; role: 'value' | 'unit' | 'plain' }[];
  readout: { type: string; value: string; unit: string };
  note: string | null;
  isExample: true;
}

export function parseExample(type: MeasurementType, phraseIndex = 0): ParseExample {
  const spoken = type.spoken_units?.[0]?.toLowerCase() ?? type.default_unit;
  const phrases = EXAMPLES[type.name.toLowerCase()] ?? [`ten ${spoken}`];
  const phrase = phrases[Math.min(Math.max(phraseIndex, 0), phrases.length - 1)];

  const words = phrase.split(' ');
  const numberWords = words.filter(isNumberWord);
  const first = words.findIndex(isNumberWord);
  const last = first + numberWords.length - 1;
  const before = words.slice(0, Math.max(first, 0)).join(' ');
  const valueText = words.slice(first, last + 1).join(' ');
  const after = words.slice(last + 1).join(' ');

  // Which unit the phrase names, if any: a spoken form or a symbol, matched whole-word.
  const heard = [...(type.spoken_units ?? []), ...type.units].find((u) =>
    new RegExp(`(^|\\s)${u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i').test(
      ` ${after} ${before} `,
    ),
  );
  const heardUnit = heard
    ? (type.units[
        type.spoken_units?.findIndex((s) => s.toLowerCase() === heard.toLowerCase()) ?? -1
      ] ?? heard)
    : null;
  const unit = heardUnit && type.units.includes(heardUnit) ? heardUnit : type.default_unit;

  const tokens: ParseExample['tokens'] = [];
  if (before) tokens.push({ text: before, role: 'plain' }, { text: ' ', role: 'plain' });
  tokens.push({ text: valueText, role: 'value' });
  if (after)
    tokens.push(
      { text: ' ', role: 'plain' },
      { text: after, role: type.dimensionless ? 'plain' : 'unit' },
    );

  return {
    phrases,
    tokens,
    readout: { type: displayName(type.name), value: wordsToNumber(numberWords), unit },
    note:
      !type.dimensionless && !heardUnit
        ? `No scale heard — used the starred unit, ${type.default_unit}.`
        : null,
    isExample: true,
  };
}
