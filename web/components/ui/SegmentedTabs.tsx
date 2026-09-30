'use client';

/**
 * Segmented tabs (DESIGN.md segmented-tabs / segmented-tab-active): a cream
 * trough with the active tab raised. Arrow keys move focus and selection.
 */
import { useRef } from 'react';

export interface SegmentedTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: SegmentedTab<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex flex-wrap gap-xxs rounded-lg bg-surface-segmented p-[4px]"
    >
      {tabs.map((tab, i) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`tab ${active ? 'tab-active' : ''}`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="tabular text-caption text-muted">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
