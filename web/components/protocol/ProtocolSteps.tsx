'use client';

/**
 * A protocol as a vertical run of steps.
 *
 * Two modes. Given a `currentIndex` it is the live rail beside a running
 * experiment: finished steps are checked off, the current one is lifted out and
 * expanded, and the progress line fills to it. Without one it is a reference
 * view of the protocol, as on the Protocols screen.
 *
 * Every step can be opened. The detail is drawn from the record rather than
 * restated: which samples already have each required reading for the step, and
 * what is still missing — the question a scientist asks before saying "next".
 */

import { useEffect, useRef, useState } from 'react';
import type { MeasurementRow, ProtocolStep } from '@/lib/queries/useExperiment';
import { IconCheck, IconChevron, IconMic } from '@/components/icons';

export interface StepSample {
  id: string;
  sample_code: string;
  sample_type?: string;
}

interface StepObservation {
  id: string;
  observation: string;
  protocol_step_index?: number | null;
}

/** Measurement types a step asks for. `sample_id` is an addressing field, not a reading. */
export function readingsRequired(step: ProtocolStep): string[] {
  return (step.required_fields ?? []).filter((field) => field !== 'sample_id');
}

function unitFor(step: ProtocolStep, type: string): string | undefined {
  return step.default_unit?.[type];
}

function sayHint(step: ProtocolStep, samples: StepSample[]): string {
  const [type] = readingsRequired(step);
  if (type) {
    const code = samples[0]?.sample_code ?? 'A17';
    const unit = unitFor(step, type);
    return `${code} ${type} is 4.2${unit ? ` ${unit}` : ''}`;
  }
  return 'Mark this step complete';
}

type StepState = 'done' | 'current' | 'upcoming' | 'reference';

function Node({ state, index }: { state: StepState; index: number }) {
  if (state === 'done') {
    return (
      <span className="relative z-[1] grid h-7 w-7 place-items-center rounded-pill bg-accent-teal text-on-primary shadow-[0_0_0_4px_var(--rail-bg)] transition-colors duration-500">
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
          <path
            d="M4.5 10.5l3.5 3.5 7.5-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="16"
            className="animate-check-draw"
          />
        </svg>
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span className="relative z-[1] grid h-7 w-7 place-items-center shadow-[0_0_0_4px_var(--rail-bg)] rounded-pill">
        <span aria-hidden className="absolute inset-0 animate-beacon rounded-pill bg-primary" />
        <span className="relative grid h-7 w-7 place-items-center rounded-pill bg-primary text-[12px] font-semibold text-on-primary">
          {index + 1}
        </span>
      </span>
    );
  }
  return (
    <span
      className={`relative z-[1] grid h-7 w-7 place-items-center rounded-pill border-[1.5px] bg-[var(--rail-bg)] text-[12px] font-medium shadow-[0_0_0_4px_var(--rail-bg)] ${
        state === 'reference' ? 'border-muted-soft/60 text-body' : 'border-hairline text-muted-soft'
      }`}
    >
      {index + 1}
    </span>
  );
}

function Coverage({
  step,
  samples,
  measurements,
}: {
  step: ProtocolStep;
  samples: StepSample[];
  measurements: MeasurementRow[];
}) {
  const types = readingsRequired(step);
  if (types.length === 0 || samples.length === 0) return null;

  return (
    <div className="mt-sm overflow-hidden rounded-md border border-hairline-soft bg-canvas">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-hairline-soft bg-surface-soft/70 text-[11px] font-medium tracking-[0.6px] text-muted-soft">
            <th className="px-sm py-[6px] font-medium">Sample</th>
            {types.map((type) => (
              <th key={type} className="px-sm py-[6px] font-medium capitalize">
                {type}
                {unitFor(step, type) && (
                  <span className="ml-xxs normal-case text-muted-soft/80">({unitFor(step, type)})</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {samples.map((sample) => (
            <tr key={sample.id} className="border-b border-hairline-soft last:border-0">
              <td className="px-sm py-[6px] font-mono text-ink">{sample.sample_code}</td>
              {types.map((type) => {
                const reading = measurements.find(
                  (m) =>
                    m.samples?.sample_code === sample.sample_code &&
                    m.measurement_type === type &&
                    m.protocol_step_index === step.index,
                );
                return (
                  <td key={type} className="px-sm py-[6px]">
                    {reading ? (
                      <span
                        key={`${reading.id}-${reading.value}`}
                        className="tabular inline-flex animate-cell-land items-center gap-xxs rounded-xs px-xxs text-ink"
                      >
                        <IconCheck className="h-3.5 w-3.5 text-accent-teal" />
                        {reading.value}
                        <span className="text-muted-soft">{reading.unit}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-xxs text-muted-soft">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-pill border border-muted-soft/70" />
                        pending
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StepDetail({
  step,
  state,
  samples,
  measurements,
  observations,
  readOnly = false,
}: {
  step: ProtocolStep;
  state: StepState;
  samples: StepSample[];
  measurements: MeasurementRow[];
  observations: StepObservation[];
  readOnly?: boolean;
}) {
  const types = readingsRequired(step);
  const stepObservations = observations.filter((o) => o.protocol_step_index === step.index);

  return (
    <div className="pb-xs pt-xs text-body-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-md gap-y-xxs text-[13px]">
        <dt className="text-muted-soft">Step id</dt>
        <dd className="font-mono text-body">{step.id}</dd>
        <dt className="text-muted-soft">Requires</dt>
        <dd className="flex flex-wrap gap-xxs">
          {types.length === 0 ? (
            <span className="text-body">No readings, just confirmation</span>
          ) : (
            types.map((type) => (
              <span key={type} className="badge capitalize">
                {type}
                {unitFor(step, type) && <span className="ml-xxs normal-case">· {unitFor(step, type)}</span>}
              </span>
            ))
          )}
        </dd>
        {(step.required_fields ?? []).includes('sample_id') && (
          <>
            <dt className="text-muted-soft">Scope</dt>
            <dd className="text-body">Every sample ({samples.length})</dd>
          </>
        )}
      </dl>

      {state !== 'reference' && (
        <Coverage step={step} samples={samples} measurements={measurements} />
      )}

      {stepObservations.length > 0 && (
        <ul className="mt-sm space-y-xxs">
          {stepObservations.map((o) => (
            <li key={o.id} className="border-l-2 border-accent-teal/50 pl-xs text-[13px] text-body">
              {o.observation}
            </li>
          ))}
        </ul>
      )}

      {state === 'current' && !readOnly && (
        <p className="mt-sm inline-flex items-center gap-xs rounded-md bg-surface-dark px-sm py-xs text-[13px] text-on-dark">
          <IconMic className="h-4 w-4 text-primary" />
          <span className="text-on-dark-soft">Say</span>
          <span className="font-mono">“{sayHint(step, samples)}”</span>
        </p>
      )}
    </div>
  );
}

export function ProtocolSteps({
  steps,
  currentIndex,
  completed = false,
  samples = [],
  measurements = [],
  observations = [],
  readOnly = false,
}: {
  steps: ProtocolStep[];
  /** Omit for a reference view with no progress. */
  currentIndex?: number;
  completed?: boolean;
  samples?: StepSample[];
  measurements?: MeasurementRow[];
  observations?: StepObservation[];
  /** A record, not a bench: no "Say …" voice cue on the current step. */
  readOnly?: boolean;
}) {
  const live = currentIndex !== undefined;
  const [open, setOpen] = useState<Set<number>>(() => new Set(live ? [currentIndex] : []));
  const previous = useRef(currentIndex);
  const currentRef = useRef<HTMLLIElement>(null);

  // On advance: fold the finished step, open the new one, and bring it into view.
  useEffect(() => {
    if (currentIndex === undefined || previous.current === currentIndex) return;
    const from = previous.current;
    previous.current = currentIndex;
    setOpen((set) => {
      const next = new Set(set);
      if (from !== undefined) next.delete(from);
      next.add(currentIndex);
      return next;
    });
    // Only inside the docked rail, which scrolls on its own. In the stacked
    // layout the rail is part of the page, and jumping the page to it would
    // pull the user away from the sample they are reading.
    const node = currentRef.current;
    if (node?.offsetParent && window.matchMedia('(min-width: 1280px)').matches) {
      node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentIndex]);

  function toggle(index: number) {
    setOpen((set) => {
      const next = new Set(set);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  if (steps.length === 0) {
    return <p className="py-md text-body-sm text-muted-soft">This protocol has no steps yet.</p>;
  }

  const fill = !live
    ? 0
    : completed
      ? 1
      : steps.length > 1
        ? Math.min(currentIndex, steps.length - 1) / (steps.length - 1)
        : 0;

  return (
    <ol className="relative">
      {/* the rail: a quiet track and a teal fill that grows to the current step */}
      <span aria-hidden className="absolute bottom-[22px] left-[13px] top-[22px] w-[2px] rounded-pill bg-hairline" />
      {live && (
        <span
          aria-hidden
          className="absolute bottom-[22px] left-[13px] top-[22px] w-[2px] origin-top rounded-pill bg-gradient-to-b from-accent-teal to-primary transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ transform: `scaleY(${fill})` }}
        />
      )}

      {steps.map((step) => {
        const state: StepState = !live
          ? 'reference'
          : completed || step.index < currentIndex
            ? 'done'
            : step.index === currentIndex
              ? 'current'
              : 'upcoming';
        const isOpen = open.has(step.index);
        const types = readingsRequired(step);

        return (
          <li
            key={step.id}
            ref={state === 'current' ? currentRef : undefined}
            className="relative flex gap-sm py-[6px]"
          >
            <div className="pt-[10px]">
              <Node state={state} index={step.index} />
            </div>

            <div
              // Keyed on the current index so the card replays its entrance
              // each time the experiment advances onto a step.
              key={state === 'current' ? `current-${currentIndex}` : 'static'}
              className={`min-w-0 flex-1 rounded-lg transition-colors duration-300 ${
                state === 'current'
                  ? 'animate-step-in border border-primary/30 bg-primary/[0.06] px-sm shadow-panel'
                  : 'px-sm hover:bg-surface-soft/70'
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(step.index)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-xs py-[10px] text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-xs">
                    {state === 'current' && (
                      <span className="rounded-xs bg-primary px-[6px] py-[1px] text-[10px] font-semibold tracking-[0.8px] text-on-primary">
                        NOW
                      </span>
                    )}
                    <span
                      className={`text-[14px] font-medium ${
                        state === 'upcoming'
                          ? 'text-muted'
                          : state === 'done'
                            ? 'text-body'
                            : 'text-ink'
                      }`}
                    >
                      {step.name}
                    </span>
                  </span>
                  <span className="mt-[2px] block text-[12px] text-muted-soft">
                    {types.length > 0
                      ? `${types.join(', ')} for each sample`
                      : state === 'done'
                        ? 'Completed'
                        : 'Confirmation step'}
                  </span>
                </span>
                <IconChevron
                  className={`mt-[2px] h-4 w-4 shrink-0 text-muted-soft transition-transform duration-300 ${
                    isOpen ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {/* grid-rows 0fr → 1fr animates height without measuring it */}
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                  isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <StepDetail
                    step={step}
                    state={state}
                    samples={samples}
                    measurements={measurements}
                    observations={observations}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
