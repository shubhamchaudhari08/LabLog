import { describe, expect, it } from 'vitest';
/**
 * The retired palette must not come back (specs/005 research R-502,
 * contracts/ui-components.md §2). Tailwind drops unknown classes silently,
 * so a leftover `bg-surface-soft` renders as no background at all and never
 * errors. This turns that silent failure into a failing test.
 *
 * The lookarounds use [\w-] rather than \b: `-` is a word boundary, so \b
 * would let `shadow-dark` match inside the valid `shadow-dark-feature`.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SCANNED = ['app', 'components', 'lib'];

const RETIRED_COLORS = [
  'primary-disabled',
  'accent-teal',
  'accent-amber',
  'body-strong',
  'muted-soft',
  'on-dark-soft',
  'surface-soft',
  'surface-cream-strong',
  'surface-dark',
  'surface-dark-elevated',
  'surface-dark-soft',
  'success',
  'warning',
  'error',
];
const PREFIXES =
  'bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|ring-offset|placeholder|decoration|caret|accent';

const RULES: { name: string; pattern: RegExp }[] = [
  {
    name: 'retired colour',
    pattern: new RegExp(`(?<![\\w-])(${PREFIXES})-(${RETIRED_COLORS.join('|')})(?![\\w-])`, 'g'),
  },
  { name: 'retired shadow', pattern: /(?<![\w-])shadow-(panel|lift|dark|inset)(?![\w-])/g },
  { name: 'retired type size', pattern: /(?<![\w-])text-(body-sm|caption-upper)(?![\w-])/g },
  {
    name: 'retired animation',
    pattern: /(?<![\w-])animate-(breathe|beacon|bar|shimmer|pulse-soft)(?![\w-])/g,
  },
  { name: 'retired utility', pattern: /(?<![\w-])(grain|bloom)(?![\w-])/g },
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css)$/.test(entry.name) ? [full] : [];
  });
}

describe('retired design tokens', () => {
  it('are used nowhere under web/app, web/components or web/lib', () => {
    const hits: string[] = [];
    for (const file of SCANNED.flatMap((dir) => sourceFiles(path.join(ROOT, dir)))) {
      fs.readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          for (const rule of RULES) {
            for (const match of line.matchAll(rule.pattern)) {
              hits.push(`${path.relative(ROOT, file)}:${i + 1}: ${rule.name} "${match[0]}"`);
            }
          }
        });
    }
    expect(hits).toEqual([]);
  });
});
