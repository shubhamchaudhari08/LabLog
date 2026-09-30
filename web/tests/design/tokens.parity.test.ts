import { describe, expect, it } from 'vitest';
/**
 * DESIGN.md is the one declaration of the palette; tailwind.config.ts is its
 * transcription (specs/005 research R-502, Constitution Principle IV). This
 * test fails on any key missing from either side and on any value mismatch.
 */
import fs from 'node:fs';
import path from 'node:path';
import config from '../../tailwind.config';

const DESIGN_MD = path.resolve(__dirname, '../../../DESIGN.md');

/** The `colors:` block of DESIGN.md's front matter, as name → lowercase hex. */
function designColors(): Record<string, string> {
  const lines = fs.readFileSync(DESIGN_MD, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => line === 'colors:');
  if (start < 0) throw new Error('DESIGN.md has no `colors:` block');
  const out: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    if (/^[a-z]/.test(line)) break; // next top-level key
    const match = /^ {2}([a-z0-9-]+): "(#[0-9a-fA-F]{6})"$/.exec(line);
    if (match) out[match[1]] = match[2].toLowerCase();
  }
  return out;
}

function tailwindColors(): Record<string, string> {
  const colors = (config.theme?.extend?.colors ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(colors).map(([name, value]) => [name, String(value).toLowerCase()]),
  );
}

describe('design token parity (DESIGN.md ↔ tailwind.config.ts)', () => {
  const design = designColors();
  const tailwind = tailwindColors();

  it('parses the full DESIGN.md palette (63 design tokens + 4 danger extensions)', () => {
    expect(Object.keys(design)).toHaveLength(67);
  });

  it('has no colour in DESIGN.md that Tailwind is missing', () => {
    const missing = Object.keys(design).filter((name) => !(name in tailwind));
    expect(missing).toEqual([]);
  });

  it('has no colour in Tailwind that DESIGN.md does not declare', () => {
    const extra = Object.keys(tailwind).filter((name) => !(name in design));
    expect(extra).toEqual([]);
  });

  it('gives every colour the same value on both sides', () => {
    const mismatched = Object.keys(design)
      .filter((name) => name in tailwind && tailwind[name] !== design[name])
      .map((name) => `${name}: DESIGN.md ${design[name]} ≠ tailwind ${tailwind[name]}`);
    expect(mismatched).toEqual([]);
  });
});
