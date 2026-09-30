import { describe, expect, it } from 'vitest';
import { abbrev } from '@/lib/ui/abbrev';
import { trySayingPhrases } from '@/lib/ui/trySaying';
import { displayName } from '@/lib/ui/displayName';

describe('abbrev (research R-519)', () => {
  it.each([
    ['Temperature', 'te'],
    ['pH', 'pH'],
    ['RPM', 'rp'],
    ['', '?'],
  ])('%s → %s', (name, expected) => {
    expect(abbrev(name)).toBe(expected);
  });
});

describe('trySayingPhrases (FR-511, DESIGN.md D-10)', () => {
  it('offers desk phrases: start, resume, list, create', () => {
    expect(trySayingPhrases({ firstProtocolCode: 'PCR-01', runningCode: 'STAB-105' })).toEqual([
      'Start a new run of PCR-01',
      'Resume STAB-105',
      'What protocols can I run?',
      'Create an experiment called …',
    ]);
  });

  it('omits Resume when nothing is running, and Start without a protocol', () => {
    expect(trySayingPhrases({ firstProtocolCode: 'PCR-01', runningCode: null })).not.toContain(
      'Resume STAB-105',
    );
    expect(trySayingPhrases({ firstProtocolCode: null, runningCode: null })).toEqual([
      'What protocols can I run?',
      'Create an experiment called …',
    ]);
  });

  it('never offers a recording phrase, which a desk session cannot act on', () => {
    const all = trySayingPhrases({ firstProtocolCode: 'PCR-01', runningCode: 'STAB-105' })
      .join(' ')
      .toLowerCase();
    expect(all).not.toMatch(/log|temperature|sample|next step|deviation/);
  });
});

describe('displayName', () => {
  it.each([
    ['temperature', 'Temperature'],
    ['pH', 'pH'],
    ['RPM', 'RPM'],
    ['rpm', 'RPM'],
    ['', ''],
  ])('%s → %s', (name, expected) => {
    expect(displayName(name)).toBe(expected);
  });
});
