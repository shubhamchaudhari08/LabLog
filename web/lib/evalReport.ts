/**
 * Types and exports for the eval run files (specs/003-post-mvp-features/contracts/eval-runs.md).
 *
 * The page renders these files; it never computes a figure beyond formatting a
 * pass/total pair already in them.
 */

export interface Metric {
  value: number | null;
  passed: number;
  total: number;
  lower_is_better?: boolean;
}

export interface DetailCall {
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  error: string | null;
}

export interface Detail {
  scenario_id: string;
  category: string;
  profile: string;
  utterance: string;
  expected: unknown;
  passed: boolean;
  calls: DetailCall[];
  reply: string;
}

export interface EvalRun {
  run_id?: string;
  generated_at: string;
  scenario_count: number;
  model: string;
  git_sha: string;
  metrics: Record<string, Metric>;
  by_category?: Record<string, { total: number; passed: number }>;
  profile_counts?: Record<string, number>;
  failures: { scenario_id: string; utterance: string; actual: unknown; note: string }[];
  details?: Detail[];
}

export type HistoryEntry = Pick<
  EvalRun,
  'run_id' | 'generated_at' | 'git_sha' | 'model' | 'scenario_count' | 'metrics' | 'by_category'
>;

export const CSV_COLUMNS = ['scenario_id', 'category', 'profile', 'utterance', 'passed', 'tools', 'errors', 'reply'] as const;

/** RFC 4180: quote every field that needs it, double embedded quotes. */
export function csvField(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function detailsToCsv(details: Detail[]): string {
  const rows = details.map((d) =>
    [
      d.scenario_id,
      d.category,
      d.profile,
      d.utterance,
      d.passed,
      d.calls.map((c) => c.tool).join(' '),
      d.calls.map((c) => c.error).filter(Boolean).join(' '),
      d.reply,
    ]
      .map(csvField)
      .join(','),
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}

export function download(filename: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
