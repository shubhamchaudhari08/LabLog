const TONE: Record<string, string> = {
  RUNNING: 'border-success/30 bg-success/10 text-[#3f8a52]',
  COMPLETED: 'border-hairline bg-surface-card text-muted',
  PAUSED: 'border-accent-amber/30 bg-accent-amber/10 text-warning',
  CANCELLED: 'border-error/25 bg-error/10 text-error',
  DRAFT: 'border-hairline bg-canvas text-muted-soft',
  READY: 'border-accent-teal/30 bg-accent-teal/10 text-[#3c8a7b]',
};

/** Experiment status. Square-cornered on purpose: a state, not a tag. */
export function StatusBadge({ status }: { status: string }) {
  const running = status === 'RUNNING';
  return (
    <span
      className={`inline-flex items-center gap-[6px] rounded-sm border px-xs py-[3px] text-[12px] font-medium ${
        TONE[status] ?? TONE.DRAFT
      }`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {running && <span aria-hidden className="absolute inset-0 animate-beacon rounded-pill bg-success" />}
        <span aria-hidden className="relative h-1.5 w-1.5 rounded-pill bg-current" />
      </span>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
