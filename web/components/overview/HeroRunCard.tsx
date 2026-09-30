'use client';

/**
 * Overview's hero (DESIGN.md hero-run-card): the running experiment on a dark
 * surface, with its progress ring, the step it is on, and the way back to the
 * bench. The waveform moves only while a session is live on this run (D-8).
 */
import Link from 'next/link';
import { IconArrow, IconMic, IconPlus } from '@/components/icons';
import { ButtonLink } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { Waveform } from '@/components/ui/voiceVisuals';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import type { ExperimentSummary } from '@/lib/queries/useExperiment';
import { runProgress, type Segment } from '@/lib/ui/runProgress';
import { voiceStatusView } from '@/lib/ui/voiceStatus';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The 120px progress ring (DESIGN.md progress-ring). The number is the step you are on. */
function ProgressRing({ current, total }: { current: number; total: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const fraction = total ? current / total : 0;
  return (
    <div className="relative h-[120px] w-[120px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        {/* #302b25 track and #e07b5a stroke: DESIGN.md progress-ring. */}
        <circle cx="60" cy="60" r={r} fill="none" stroke="#302b25" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#e07b5a"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center leading-none">
        <span>
          <span className="tabular block font-display text-numeral text-on-dark">
            {total ? current : '—'}
          </span>
          <span className="mt-[2px] block text-caption text-on-dark-muted">
            {total ? `of ${total} steps` : 'no protocol'}
          </span>
        </span>
      </span>
    </div>
  );
}

const SEGMENT: Record<Segment, string> = {
  done: 'bg-status-done-dot',
  current: 'bg-primary-glow',
  upcoming: 'bg-dark-border',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="dark-surface relative animate-slide-up overflow-hidden rounded-feature p-lg shadow-dark-feature sm:px-[32px] sm:py-[28px]">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-glow-clay"
      />
      <div className="relative grid items-center gap-lg md:grid-cols-[120px_minmax(0,1fr)] xl:grid-cols-[120px_minmax(0,1fr)_300px]">
        {children}
      </div>
    </section>
  );
}

export function HeroRunCard({ experiment }: { experiment: ExperimentSummary }) {
  const voice = useVoiceSession();
  const progress = runProgress(experiment);
  const steps = experiment.protocols?.steps ?? [];
  const current = steps[Math.min(experiment.current_step_index, Math.max(steps.length - 1, 0))];
  const readings = experiment.measurements?.[0]?.count ?? 0;
  const liveHere = voice.live && voice.bound?.id === experiment.id;
  const wave = liveHere && voiceStatusView(voice, voice.understoodAt, Date.now()).wave;

  return (
    <Shell>
      <ProgressRing
        current={progress.total ? Math.min(progress.done + 1, progress.total) : 0}
        total={progress.total}
      />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-sm">
          <StatusPill status={experiment.status} onDark live />
          <span className="font-mono text-code text-on-dark-muted">
            {experiment.experiment_code}
          </span>
          {experiment.protocols?.name && (
            <span className="truncate text-body-md text-on-dark-muted">
              {experiment.protocols.name}
            </span>
          )}
        </div>
        <h2
          className="mt-xs truncate font-display text-display-md text-on-dark"
          title={experiment.name}
        >
          {experiment.name}
        </h2>
        <p className="mt-xs text-body-md text-on-dark-body">
          Now on <span className="text-on-dark">{current?.name ?? 'the first step'}</span> ·{' '}
          {plural(readings, 'reading')} so far
        </p>
        {progress.segments.length > 0 && (
          <div className="mt-md flex max-w-[360px] gap-[6px]" aria-label={progress.currentLabel}>
            {progress.segments.map((s, i) => (
              <span key={i} className={`h-[5px] flex-1 rounded-pill ${SEGMENT[s]}`} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col items-start gap-sm md:col-span-2 xl:col-span-1 xl:items-end">
        <Waveform running={wave} className="hidden xl:flex" />
        <ButtonLink
          href={`/dashboard/experiments/${experiment.id}/bench`}
          size="lg"
          className="w-full sm:w-auto"
        >
          <IconMic className="h-[18px] w-[18px]" />
          Resume at the bench
          <IconArrow className="h-4 w-4" />
        </ButtonLink>
        <p className="text-caption text-on-dark-muted">
          or just say “resume {experiment.experiment_code}”
        </p>
      </div>
    </Shell>
  );
}

/** In the hero slot when nothing is running: voice needs a RUNNING experiment to record into. */
export function StartCard() {
  return (
    <Shell>
      <span className="grid h-[120px] w-[120px] shrink-0 place-items-center rounded-full border border-dark-border text-primary-on-dark">
        <IconMic className="h-10 w-10" />
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-display-md text-on-dark">Start an experiment</h2>
        <p className="mt-xs max-w-[60ch] text-body-md text-on-dark-body">
          Fill in a short form, or press <span className="text-on-dark">Start voice</span> and say
          “create an experiment called … using sample stability”. Either way it opens at the bench,
          and the microphone records every reading you say.
        </p>
      </div>
      <div className="md:col-span-2 xl:col-span-1 xl:justify-self-end">
        <Link href="/experiments/new" className="btn-primary h-[52px]">
          <IconPlus className="h-[18px] w-[18px]" />
          New experiment
        </Link>
      </div>
    </Shell>
  );
}
