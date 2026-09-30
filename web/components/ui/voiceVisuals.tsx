/**
 * The voice visuals: orb, waveform and caret (DESIGN.md voice-orb,
 * bench-mic-orb, Motion). Each renders a still form unless told it is
 * running, because motion here means "the microphone is hearing you"
 * (DESIGN.md D-8). All motion is CSS, so reduce-motion stops it.
 */
import { IconMic, IconPause } from '@/components/icons';

export type OrbState = 'active' | 'calm' | 'grey';

export function Orb({
  size,
  state,
  onClick,
  label,
  paused = false,
}: {
  size: 'dock' | 'bench';
  state: OrbState;
  onClick?: () => void;
  label: string;
  /** Show a pause glyph on the core (the orb toggles mute when pressed). */
  paused?: boolean;
}) {
  const bench = size === 'bench';
  const area = bench ? 'h-[250px] w-[250px]' : 'h-[88px] w-[88px]';
  const core = bench ? 'h-[120px] w-[120px]' : 'h-[62px] w-[62px]';
  const rings = state === 'active' ? (bench ? 3 : 2) : 0;
  const coreColour =
    state === 'grey' ? 'bg-dark-border text-on-dark-muted' : 'bg-primary text-on-primary';
  const Glyph = paused ? IconPause : IconMic;

  const content = (
    <>
      {bench && state !== 'grey' && (
        <span aria-hidden className="absolute inset-0 rounded-full bg-glow-clay" />
      )}
      {Array.from({ length: rings }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute inset-0 animate-ring-out rounded-full border border-primary"
          style={{ animationDelay: `${i * 0.7}s` }}
        />
      ))}
      {state === 'calm' && (
        <span
          aria-hidden
          className={`absolute rounded-full border border-primary/40 ${bench ? 'inset-[40px]' : 'inset-[6px]'}`}
        />
      )}
      <span
        className={`relative grid place-items-center rounded-full transition-colors ${core} ${coreColour}`}
      >
        <Glyph className={bench ? 'h-[40px] w-[40px]' : 'h-[26px] w-[26px]'} />
      </span>
    </>
  );

  const shell = `relative grid shrink-0 place-items-center ${area}`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`${shell} rounded-full`}
      >
        {content}
      </button>
    );
  }
  return (
    <div aria-hidden className={shell}>
      {content}
    </div>
  );
}

// Fixed heights, so the still waveform looks the same on every render.
const HEIGHTS = [
  0.35, 0.6, 0.45, 0.85, 0.55, 1, 0.7, 0.4, 0.9, 0.5, 0.75, 0.3, 0.65, 0.95, 0.45, 0.7, 0.4, 0.6,
];

export function Waveform({
  bars = 18,
  running,
  tone = 'clay',
  className = '',
}: {
  bars?: number;
  running: boolean;
  tone?: 'clay' | 'muted';
  className?: string;
}) {
  const colour = tone === 'clay' ? 'bg-primary-glow' : 'bg-on-dark-muted';
  return (
    <span aria-hidden className={`flex h-[28px] items-center gap-[3px] ${className}`}>
      {Array.from({ length: bars }, (_, i) => {
        const h = HEIGHTS[i % HEIGHTS.length];
        return (
          <span
            key={i}
            className={`h-full w-[3px] origin-center rounded-pill ${colour} ${running ? 'animate-wave' : ''}`}
            style={
              running
                ? { animationDelay: `${i * 60}ms` }
                : { transform: `scaleY(${Math.max(0.18, h * 0.5)})`, opacity: 0.55 }
            }
          />
        );
      })}
    </span>
  );
}

export function Caret() {
  return (
    <span
      aria-hidden
      className="ml-[2px] inline-block h-[1em] w-[0.55em] translate-y-[0.12em] animate-caret bg-primary-glow"
    />
  );
}
