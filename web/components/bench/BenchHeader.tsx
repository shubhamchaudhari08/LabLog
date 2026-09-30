'use client';

/**
 * Bench mode's header (DESIGN.md Bench Frame, ui-voice-surfaces §6): the run,
 * how long this session has been going, how much it has captured, any step
 * timer, and the way out.
 */
import { useEffect, useState } from 'react';
import { IconExit, Logo } from '@/components/icons';
import { ButtonLink } from '@/components/ui/Button';
import { HeaderTimerChip } from '@/components/timer/TimerChip';
import { formatElapsed } from '@/lib/ui/captureEntries';

function SessionClock({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return (
    <span className="tabular font-mono text-[22px] leading-none text-on-dark-strong">
      {startedAt == null ? '--:--:--' : formatElapsed(now - startedAt)}
    </span>
  );
}

export function BenchHeader({
  experimentId,
  code,
  name,
  protocol,
  sessionStartedAt,
  captured,
}: {
  experimentId: string;
  code: string;
  name: string;
  protocol: string | null;
  sessionStartedAt: number | null;
  captured: number;
}) {
  return (
    <header className="flex h-[76px] items-center gap-md border-b border-dark-line bg-dark-bench px-md lg:px-[24px]">
      <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-md border border-sidebar-border bg-sidebar-card text-sidebar-icon-active">
        <Logo className="h-[22px] w-[22px]" />
      </span>
      <span className="hidden font-display text-wordmark text-on-dark md:inline">LabLog</span>
      <span className="hidden whitespace-nowrap rounded-pill border border-primary-border-soft/40 px-sm py-[4px] text-eyebrow uppercase text-primary-on-dark sm:inline">
        Bench mode · hands-free
      </span>
      <span className="hidden h-6 w-px bg-dark-line lg:block" aria-hidden />
      <span className="flex min-w-0 items-baseline gap-sm">
        <span className="font-mono text-code text-on-dark">{code}</span>
        <span className="truncate text-body-md text-on-dark">{name}</span>
        {protocol && (
          <span className="hidden truncate text-body-md text-on-dark-muted xl:inline">
            {protocol}
          </span>
        )}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-lg">
        <div className="hidden text-right sm:block">
          <p className="text-eyebrow uppercase text-on-dark-muted">This session</p>
          <SessionClock startedAt={sessionStartedAt} />
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-eyebrow uppercase text-on-dark-muted">Captured</p>
          <span className="tabular font-mono text-[22px] leading-none text-on-dark-strong">
            {captured}
          </span>
        </div>
        <HeaderTimerChip onDark />
        <ButtonLink href={`/dashboard/experiments/${experimentId}`} variant="secondary-dark">
          <IconExit className="h-[18px] w-[18px]" />
          Exit bench
        </ButtonLink>
      </div>
    </header>
  );
}
