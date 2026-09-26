import { describe, expect, it } from 'vitest';
import { filterAndSortExperiments, type HistoryRow } from '@/lib/history';

const day = (d: number) => new Date(2026, 8, d, 10).toISOString();

const rows: HistoryRow[] = [
  { experiment_code: 'STAB-100', status: 'COMPLETED', protocol_id: 'p1', started_at: day(11) },
  { experiment_code: 'STAB-101', status: 'COMPLETED', protocol_id: 'p1', started_at: day(15) },
  { experiment_code: 'STAB-102', status: 'COMPLETED', protocol_id: 'p1', started_at: day(19) },
  { experiment_code: 'STAB-104', status: 'RUNNING', protocol_id: 'p1', started_at: day(25) },
  { experiment_code: 'PCR-9', status: 'DRAFT', protocol_id: null, started_at: null, created_at: day(24) },
  { experiment_code: 'EXP-1', status: 'DRAFT', protocol_id: null, started_at: null, created_at: null },
];
const codes = (list: HistoryRow[]) => list.map((r) => r.experiment_code);
const byDateDesc = { key: 'date', dir: 'desc' } as const;

describe('filterAndSortExperiments', () => {
  it('filters by status', () => {
    expect(codes(filterAndSortExperiments(rows, { status: 'COMPLETED' }, byDateDesc))).toEqual([
      'STAB-102',
      'STAB-101',
      'STAB-100',
    ]);
  });

  it('filters by protocol, keeping rows with no protocol out', () => {
    expect(filterAndSortExperiments(rows, { protocolId: 'p1' }, byDateDesc)).toHaveLength(4);
  });

  it('filters by an inclusive local date range on the run date', () => {
    expect(codes(filterAndSortExperiments(rows, { from: '2026-09-15', to: '2026-09-24' }, byDateDesc))).toEqual([
      'PCR-9',
      'STAB-102',
      'STAB-101',
    ]);
  });

  it('combines filters', () => {
    const got = filterAndSortExperiments(rows, { status: 'COMPLETED', protocolId: 'p1', from: '2026-09-12' }, byDateDesc);
    expect(codes(got)).toEqual(['STAB-102', 'STAB-101']);
  });

  it('sorts by date ascending with undated rows last', () => {
    expect(codes(filterAndSortExperiments(rows, {}, { key: 'date', dir: 'asc' }))).toEqual([
      'STAB-100',
      'STAB-101',
      'STAB-102',
      'PCR-9',
      'STAB-104',
      'EXP-1',
    ]);
  });

  it('sorts codes naturally in both directions', () => {
    const asc = codes(filterAndSortExperiments(rows, { status: 'COMPLETED' }, { key: 'code', dir: 'asc' }));
    expect(asc).toEqual(['STAB-100', 'STAB-101', 'STAB-102']);
    const desc = codes(filterAndSortExperiments(rows, { status: 'COMPLETED' }, { key: 'code', dir: 'desc' }));
    expect(desc).toEqual(['STAB-102', 'STAB-101', 'STAB-100']);
  });

  it('treats ALL as no filter', () => {
    expect(filterAndSortExperiments(rows, { status: 'ALL', protocolId: 'ALL' }, byDateDesc)).toHaveLength(rows.length);
  });
});

describe('experimentHref', () => {
  it('opens finished runs read-only and live ones at the bench', async () => {
    const { experimentHref } = await import('@/lib/history');
    expect(experimentHref({ id: 'x', status: 'COMPLETED' })).toBe('/experiments/x');
    expect(experimentHref({ id: 'x', status: 'CANCELLED' })).toBe('/experiments/x');
    expect(experimentHref({ id: 'x', status: 'RUNNING' })).toBe('/dashboard/experiments/x');
    expect(experimentHref({ id: 'x', status: 'DRAFT' })).toBe('/dashboard/experiments/x');
  });
});
