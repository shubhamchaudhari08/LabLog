/**
 * The protocol on the bench (DESIGN.md bench-step-rail-item, D-13): done,
 * current and upcoming steps. A list, not buttons: steps only move forward
 * through "next step", so there is nothing to jump to.
 */
import { IconCheck } from '@/components/icons';
import type { Segment } from '@/lib/ui/runProgress';

interface Step {
  name: string;
}

function Node({ state, n }: { state: Segment; n: number }) {
  if (state === 'done') {
    return (
      <span className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full border border-status-running-border-dark bg-status-running-bg-dark text-status-running-on-dark">
        <IconCheck className="h-[14px] w-[14px]" />
      </span>
    );
  }
  return (
    <span
      className={`grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full font-mono text-code ${
        state === 'current'
          ? 'bg-primary text-on-primary'
          : 'border border-dark-border text-on-dark-muted'
      }`}
    >
      {n}
    </span>
  );
}

/** Vertical rail at xl and above; a horizontal stepper below (research R-521). */
export function StepRail({ steps, segments }: { steps: Step[]; segments: Segment[] }) {
  return (
    <nav
      aria-label="Protocol steps"
      className="xl:h-full xl:overflow-y-auto xl:border-r xl:border-dark-line xl:p-[24px]"
    >
      <p className="hidden text-eyebrow uppercase text-primary-on-dark xl:block">
        Protocol · {steps.length} steps
      </p>
      <ol className="flex gap-xs overflow-x-auto border-b border-dark-line px-md py-sm xl:mt-md xl:flex-col xl:overflow-visible xl:border-0 xl:p-0">
        {steps.map((step, i) => {
          const state = segments[i] ?? 'upcoming';
          const current = state === 'current';
          return (
            <li
              key={i}
              aria-current={current ? 'step' : undefined}
              // #241f1b / #5a3a2d: DESIGN.md bench-step-rail-item current colours.
              className={`flex min-h-[56px] shrink-0 items-center gap-sm rounded-xl px-sm ${
                current ? 'border border-[#5a3a2d] bg-[#241f1b]' : 'border border-transparent'
              }`}
            >
              <Node state={state} n={i + 1} />
              <span className="min-w-0">
                <span
                  className={`block max-w-[200px] truncate text-title-sm xl:max-w-none ${
                    state === 'upcoming' ? 'text-on-dark-body' : 'text-on-dark'
                  }`}
                  title={step.name}
                >
                  {step.name}
                </span>
                {state !== 'upcoming' && (
                  <span className="block text-caption text-on-dark-muted">
                    {current ? 'In progress' : 'Done'}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
