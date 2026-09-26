'use client';

import Link from 'next/link';
import type { ExperimentSummary } from '@/lib/queries/useExperiment';
import { StatusBadge } from './StatusBadge';
import { IconArrow } from '@/components/icons';
import { experimentHref } from '@/lib/history';

export function when(experiment: ExperimentSummary) {
  const iso = experiment.completed_at ?? experiment.started_at;
  if (!iso) return 'Not started';
  const date = new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
  return experiment.completed_at ? `Completed ${date}` : `Started ${date}`;
}

function StepMeter({ experiment }: { experiment: ExperimentSummary }) {
  const steps = experiment.protocols?.steps ?? [];
  if (!steps.length) return null;
  const done = experiment.status === 'COMPLETED' ? steps.length : experiment.current_step_index;
  return (
    <span className="hidden items-center gap-[3px] sm:flex" aria-label={`${done} of ${steps.length} steps`}>
      {steps.map((step) => (
        <span
          key={step.id}
          className={`h-1.5 w-3 rounded-pill ${
            step.index < done
              ? 'bg-accent-teal/70'
              : step.index === done && experiment.status === 'RUNNING'
                ? 'bg-primary'
                : 'bg-surface-cream-strong'
          }`}
        />
      ))}
    </span>
  );
}

export function ExperimentRow({ experiment, index = 0 }: { experiment: ExperimentSummary; index?: number }) {
  const measurements = experiment.measurements?.[0]?.count ?? 0;

  return (
    <li className="animate-rise" style={{ animationDelay: `${index * 45}ms` }}>
      <Link
        href={experimentHref(experiment)}
        className="group grid grid-cols-[1fr_auto] items-center gap-x-md gap-y-xxs px-md py-sm transition-colors duration-200 hover:bg-surface-soft sm:grid-cols-[112px_minmax(0,1fr)_auto_auto_auto_20px]"
      >
        <span className="font-mono text-body-sm font-medium text-ink">{experiment.experiment_code}</span>
        <span className="order-last col-span-2 min-w-0 truncate text-body-sm text-body sm:order-none sm:col-span-1">
          {experiment.name}
          <span className="ml-xs text-caption text-muted-soft">{experiment.protocols?.name}</span>
        </span>
        <StepMeter experiment={experiment} />
        <span className="tabular hidden text-caption text-muted-soft md:inline">
          {measurements} {measurements === 1 ? 'reading' : 'readings'}
        </span>
        <span className="flex items-center justify-end gap-sm">
          <span className="hidden whitespace-nowrap text-right text-caption text-muted-soft lg:inline">{when(experiment)}</span>
          <StatusBadge status={experiment.status} />
        </span>
        <IconArrow className="hidden h-4 w-4 text-muted-soft transition-all duration-200 group-hover:translate-x-[3px] group-hover:text-primary sm:block" />
      </Link>
    </li>
  );
}

export function ExperimentListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-hairline-soft" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-md px-md py-sm">
          <div className="skeleton h-4 w-20" />
          <div className="skeleton h-4 flex-1" />
          <div className="skeleton h-5 w-16" />
        </li>
      ))}
    </ul>
  );
}
