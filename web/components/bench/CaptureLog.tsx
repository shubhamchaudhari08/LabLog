'use client';

/**
 * "Captured this session" (DESIGN.md capture-log-card, D-6). Every card is a
 * stored audit event from the live session; the quoted words are shown when
 * the session remembered them.
 */
import { IconMic } from '@/components/icons';
import { ButtonLink } from '@/components/ui/Button';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import type { CaptureEntry, CaptureKind } from '@/lib/ui/captureEntries';

const TAG: Record<CaptureKind, { label: string; className: string }> = {
  reading: { label: 'Reading', className: 'bg-primary/15 text-primary-on-dark' },
  correction: { label: 'Correction', className: 'bg-primary/15 text-primary-on-dark' },
  note: { label: 'Note', className: 'bg-dark-muted-fill text-on-dark-body' },
  deviation: {
    label: 'Deviation',
    className: 'border border-deviation-border-dark bg-deviation-bg-dark text-deviation-on-dark',
  },
  step: { label: 'Step', className: 'bg-status-running-bg-dark text-status-running-on-dark' },
  timer: { label: 'Timer', className: 'bg-dark-muted-fill text-on-dark-body' },
  run: { label: 'Event', className: 'bg-dark-muted-fill text-on-dark-body' },
};

function FinishRun({ experimentId, completed }: { experimentId: string; completed: boolean }) {
  const voice = useVoiceSession();
  if (completed) {
    return (
      <ButtonLink href={`/experiments/${experimentId}`} variant="secondary-dark">
        Open record
      </ButtonLink>
    );
  }
  // complete_experiment needs the completeness check and a spoken yes, so the
  // run is finished by voice, never by a button that bypasses that (D-13).
  if (voice.live) {
    return (
      <span className="inline-flex items-center gap-xs text-caption text-on-dark-body">
        <IconMic className="h-4 w-4 text-primary-on-dark" />
        Say “finish the run”
      </span>
    );
  }
  return (
    <button
      type="button"
      className="btn-secondary-dark"
      onClick={() => {
        voice.setHint('Say “finish the run”');
        voice.startVoice();
      }}
    >
      Finish run
    </button>
  );
}

export function CaptureLog({
  entries,
  experimentId,
  completed,
}: {
  entries: CaptureEntry[];
  experimentId: string;
  completed: boolean;
}) {
  return (
    <aside
      aria-label="Captured this session"
      className="flex min-h-0 flex-col border-t border-dark-line bg-dark-bench xl:border-l xl:border-t-0"
    >
      <div className="flex items-baseline gap-xs px-[20px] pb-sm pt-[24px]">
        <h2 className="font-sans text-title-md text-on-dark">Captured this session</h2>
        <span className="tabular font-mono text-code text-on-dark-muted">{entries.length}</span>
      </div>

      <ol
        aria-live="polite"
        className="min-h-[160px] flex-1 space-y-sm overflow-y-auto px-[20px] pb-md"
      >
        {entries.length === 0 && (
          <li className="rounded-xl border border-dashed border-dark-line px-[16px] py-[14px] text-body-md text-on-dark-muted">
            Nothing captured yet. Speak a reading, or tap a command.
          </li>
        )}
        {entries.map((e) => (
          <li
            key={e.id}
            className="animate-rise rounded-xl border border-dark-line bg-dark-panel px-[16px] py-[14px]"
          >
            <div className="flex items-center justify-between gap-sm">
              <span
                className={`rounded-pill px-[8px] py-[2px] text-caption font-semibold ${TAG[e.kind].className}`}
              >
                {e.kind === 'run' && e.label !== 'Run finished' ? TAG.run.label : TAG[e.kind].label}
              </span>
              <span className="tabular font-mono text-code text-on-dark-muted">{e.at}</span>
            </div>
            <p className="mt-xs flex flex-wrap items-baseline gap-x-sm gap-y-[2px]">
              <span className="text-body-md text-on-dark-body">{e.label}</span>
              {e.value && (
                <span className="font-mono text-[18px] text-on-dark-strong">{e.value}</span>
              )}
              {e.meta && <span className="text-caption text-on-dark-muted">{e.meta}</span>}
            </p>
            {e.quote && (
              <p className="mt-xs flex items-start gap-xs text-caption italic text-on-dark-muted">
                <IconMic className="mt-[2px] h-[14px] w-[14px] shrink-0 not-italic" />
                <span>“{e.quote}”</span>
              </p>
            )}
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between gap-md border-t border-dark-line px-[20px] py-md">
        <p className="text-caption text-on-dark-muted">
          Every entry is written to the run record as you speak.
        </p>
        <FinishRun experimentId={experimentId} completed={completed} />
      </div>
    </aside>
  );
}
