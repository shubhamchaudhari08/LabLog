'use client';

/**
 * The bench's centre column (DESIGN.md Bench Mode, ui-voice-surfaces §6): the
 * current step in serif, the microphone, what is being heard, and either what
 * was just saved or the commands to say or tap.
 */
import { useEffect, useState } from 'react';
import { StepTimerSlot } from '@/components/timer/TimerChip';
import { Caret, Orb, Waveform } from '@/components/ui/voiceVisuals';
import { useVoiceSession } from '@/components/voice/VoiceSession';
import { StartBar } from '@/components/workspace/StartBar';
import { TONE_ON_DARK, voiceStatusView } from '@/lib/ui/voiceStatus';
import { BenchCommands } from './BenchCommands';
import { ConfirmCard, useConfirmVisible } from './ConfirmCard';

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function BenchCenter({
  experimentId,
  code,
  status,
  steps,
  currentIndex,
  hasProtocol,
  timersHere,
}: {
  experimentId: string;
  code: string;
  status: string;
  steps: { name: string; required_fields?: string[] }[];
  currentIndex: number;
  hasProtocol: boolean;
  /** The 004 step-timer provider is watching this run. */
  timersHere: boolean;
}) {
  const voice = useVoiceSession();
  const now = useNow(voice.understoodAt != null);
  const confirmVisible = useConfirmVisible();
  const running = status === 'RUNNING';
  const liveHere = voice.live && voice.bound?.id === experimentId;
  const view = voiceStatusView({ ...voice, stepIndex: currentIndex }, voice.understoodAt, now);
  // Idle and the microphone cannot be used: the orb goes grey and says what to fix.
  const micProblem = !voice.live && !voice.mic.ready && voice.mic.issue !== 'checking';
  const step = steps[currentIndex];
  const lastUser = [...voice.turns].reverse().find((t) => t.role === 'user');
  const heard = voice.partial || lastUser?.text || voice.hint || 'Say a reading, or “next step”.';
  const expects = step?.required_fields?.filter(Boolean) ?? [];

  return (
    <main id="main" className="mx-auto w-full max-w-[680px] px-md py-[36px] lg:px-[40px]">
      {steps.length > 0 && step ? (
        <>
          <p className="text-eyebrow uppercase text-primary-on-dark">
            Step {currentIndex + 1} of {steps.length}
          </p>
          <h1 className="mt-xs font-display text-display-md text-on-dark sm:text-display-bench">
            {step.name}
          </h1>
          <p className="mt-sm text-body-lg text-on-dark-body">
            Speak readings as you take them. LabLog writes them to {code} and reads back anything it
            isn’t sure of.
            {expects.length > 0 && (
              <span className="text-on-dark-muted"> This step expects {expects.join(', ')}.</span>
            )}
          </p>
          {running && timersHere && (
            <div className="mt-sm">
              <StepTimerSlot stepIndex={currentIndex} currentIndex={currentIndex} onDark />
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-eyebrow uppercase text-primary-on-dark">No protocol</p>
          <h1 className="mt-xs font-display text-display-md text-on-dark">
            Dictate the steps as you go
          </h1>
          <p className="mt-sm text-body-lg text-on-dark-body">
            Say “add a step called …” and LabLog writes it to this run’s protocol.
          </p>
        </>
      )}

      {!running ? (
        <StartBar experimentId={experimentId} status={status} hasProtocol={hasProtocol} onDark />
      ) : (
        <>
          <div className="mt-lg flex flex-col items-center">
            <Orb
              size="bench"
              state={liveHere ? view.orb : micProblem ? 'grey' : 'calm'}
              paused={liveHere && voice.muted}
              onClick={liveHere ? voice.toggleMute : voice.startVoice}
              label={
                liveHere
                  ? voice.muted
                    ? 'Resume listening'
                    : 'Pause listening'
                  : micProblem
                    ? `${voice.mic.title}. ${voice.mic.action}`
                    : 'Start voice'
              }
            />
            <div className="mt-sm flex items-center gap-md" aria-live="polite">
              <span
                className={`text-eyebrow uppercase ${
                  liveHere
                    ? TONE_ON_DARK[view.tone]
                    : micProblem
                      ? 'text-danger-on-dark'
                      : 'text-on-dark-muted'
                }`}
              >
                {liveHere
                  ? view.label
                  : voice.live
                    ? `Voice is on ${voice.bound?.code ?? 'another screen'}`
                    : micProblem
                      ? `${voice.mic.title} · ${voice.mic.action}`
                      : 'Tap to start'}
              </span>
              <Waveform running={liveHere && view.wave} />
            </div>
          </div>

          {voice.micNotice && !voice.live && (
            <p
              role="alert"
              className="mt-md rounded-lg bg-danger-bg-dark px-[14px] py-xs text-body-md text-danger-on-dark"
            >
              <span className="font-semibold">{voice.mic.title}.</span> {voice.micNotice} Tap the
              microphone to try again.
            </p>
          )}

          {liveHere && view.tone === 'danger' && (
            <p
              role="alert"
              className="mt-md rounded-lg bg-danger-bg-dark px-[14px] py-xs text-body-md text-danger-on-dark"
            >
              {voice.error}
            </p>
          )}

          <div className="mt-lg rounded-card border border-dark-line bg-dark-panel px-[20px] py-[16px]">
            <p className="text-eyebrow uppercase text-on-dark-muted">Live transcript</p>
            <p aria-live="polite" className="mt-xs text-transcript-bench text-on-dark">
              “{heard}”{liveHere && view.wave && voice.partial && <Caret />}
            </p>
          </div>

          <div className="mt-lg">
            {confirmVisible ? <ConfirmCard /> : <BenchCommands experimentId={experimentId} />}
          </div>
        </>
      )}
    </main>
  );
}
