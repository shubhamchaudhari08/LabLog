import { describe, expect, it } from 'vitest';
/**
 * Every text/background pair the UI uses meets WCAG 2.x 4.5:1 (specs/005
 * FR-514, research R-523). DESIGN.md asserted "≈ 4.7:1" for white on clay;
 * measured, it is 4.88. Claims need evidence (Constitution Principle V), so
 * the ratios are computed here and pinned, and a token change that moves
 * one shows up in review.
 */
import config from '../../tailwind.config';

const colors = (config.theme?.extend?.colors ?? {}) as Record<string, string>;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A token name, or a literal hex where DESIGN.md gives one inside a component. */
function resolve(ref: string): string {
  if (ref.startsWith('#')) return ref;
  const hex = colors[ref];
  if (!hex) throw new Error(`Unknown colour token: ${ref}`);
  return hex;
}

// [text, background, measured ratio] — contracts/ui-components.md §5.
const PAIRS: [string, string, number][] = [
  ['on-primary', 'primary', 4.88],
  ['on-primary', 'primary-active', 6.91],
  ['ink', 'canvas', 15.66],
  ['body', 'canvas', 6.56],
  ['muted', 'canvas', 5.22],
  ['muted', 'surface-card', 5.68],
  ['muted', 'surface-muted', 4.87],
  ['primary-text', 'canvas', 5.24],
  ['primary-text', 'primary-tint-soft', 5.11],
  ['status-running-text', 'status-running-bg', 5.16],
  ['status-running-text', 'canvas', 5.51],
  ['status-done-text', 'status-done-bg', 6.01],
  ['deviation-text', 'canvas', 4.93],
  ['deviation-text', 'surface-card', 5.37],
  ['danger-text', 'canvas', 6.05],
  ['danger-text', 'danger-bg', 5.43],
  ['#3d3832', '#f4efe7', 10.14], // unit-chip
  ['on-dark', 'dark-panel', 15.31],
  ['on-dark-body', 'dark-panel', 10.56],
  ['on-dark-muted', 'dark-panel', 6.44],
  ['on-dark-muted', 'dark-raised', 6.02],
  ['primary-on-dark', 'dark-panel', 6.83],
  ['status-running-on-dark', 'dark-panel', 9.73],
  ['status-running-on-dark', 'status-running-bg-dark', 7.92],
  ['deviation-on-dark', 'deviation-bg-dark', 7.46],
  ['danger-on-dark', 'danger-bg-dark', 7.0],
  ['sidebar-text', 'sidebar', 10.97],
  ['sidebar-muted', 'sidebar', 6.22],
  ['sidebar-label', 'sidebar', 4.86],
];

describe('text contrast', () => {
  it.each(PAIRS)('%s on %s meets 4.5:1 (measured %s)', (text, background, measured) => {
    const ratio = contrast(resolve(text), resolve(background));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(Number(ratio.toFixed(2))).toBe(measured);
  });
});
