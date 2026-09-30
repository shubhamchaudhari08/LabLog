/**
 * The committed contract fixtures (specs/005 contracts/fixtures). Tests read
 * shapes from here rather than defining their own (Constitution Principle IV).
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(__dirname, '../../../specs/005-warm-notebook-redesign/contracts/fixtures');

export function fixture<T = Record<string, unknown>>(
  name: 'tool-outcomes' | 'events' | 'voice-state',
): T {
  return JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8')) as T;
}
