'use client';

/**
 * The header's command pill (DESIGN.md command-bar, D-9). A button, not a text
 * field: it starts voice. The example phrase is one the session started from
 * this page can act on. No `Space` hint, because no shortcut is wired.
 */
import { usePathname } from 'next/navigation';
import { IconMic } from '@/components/icons';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import { useExperimentList, useProtocolList } from '@/lib/queries/useExperiment';
import { commandExample } from '@/lib/ui/commandExample';

export function CommandBar() {
  const pathname = usePathname();
  const voice = useVoiceSession();
  const protocols = useProtocolList();
  const experiments = useExperimentList();

  const example = commandExample(pathname, {
    firstProtocolCode: protocols.data?.[0]?.protocol_code ?? null,
    runningCode: experiments.data?.find((e) => e.status === 'RUNNING')?.experiment_code ?? null,
  });

  return (
    <button
      type="button"
      onClick={voice.startVoice}
      disabled={voice.live}
      className="hidden h-[42px] w-[440px] min-w-0 items-center gap-sm rounded-pill border border-border-control bg-surface-card px-md text-left text-body-md text-muted transition-colors hover:border-border-hover disabled:cursor-default disabled:opacity-60 xl:flex"
    >
      <IconMic className="h-[18px] w-[18px] shrink-0 text-primary" />
      <span className="truncate">Say a command — “{example}”</span>
    </button>
  );
}
