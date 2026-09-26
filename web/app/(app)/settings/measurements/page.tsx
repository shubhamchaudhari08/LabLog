'use client';

/**
 * Measurement types and their units — a read-only reference.
 *
 * The list is served from the same declaration the voice agent uses
 * (api/app/tools/vocabulary.py), so what is shown here is exactly what the
 * agent is told. It is not editable: changing it changes what speech
 * recognition listens for and what the agent suggests, which is a reviewed code
 * change rather than a form.
 *
 * Beside it, the types actually present in the notebook. The vocabulary is
 * open, so a reading of an unlisted type is still stored — and this is where
 * that shows up.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { usePageCrumbs } from '@/components/shell/AppShell';
import { IconMic, IconRuler, IconStar } from '@/components/icons';
import { fetchMeasurementTypes, type MeasurementType } from '@/lib/api';
import { supabase } from '@/lib/supabase';

/** Current readings per type, across every experiment this account owns. */
function useRecordedTypes() {
  return useQuery({
    queryKey: ['recorded-measurement-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('measurements')
        .select('measurement_type, unit')
        .is('superseded_by', null);
      if (error) throw error;
      const counts = new Map<string, { count: number; units: Set<string> }>();
      for (const row of data ?? []) {
        const key = String(row.measurement_type).toLowerCase();
        const entry = counts.get(key) ?? { count: 0, units: new Set<string>() };
        entry.count += 1;
        if (row.unit) entry.units.add(row.unit);
        counts.set(key, entry);
      }
      return counts;
    },
  });
}

function TypeRow({
  type,
  index,
  recorded,
}: {
  type: MeasurementType;
  index: number;
  recorded?: { count: number; units: Set<string> };
}) {
  return (
    <li
      className="grid animate-rise items-center gap-x-md gap-y-xs px-lg py-md transition-colors hover:bg-surface-soft/60 sm:grid-cols-[40px_minmax(0,1fr)_auto]"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <span className="hidden h-10 w-10 place-items-center rounded-md bg-surface-card font-mono text-[13px] font-medium text-muted sm:grid">
        {type.name.slice(0, 2)}
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-xs text-body-md font-medium text-ink">
          {/* pH keeps its case; short names like rpm are acronyms. */}
          <span className={type.name === 'pH' ? '' : type.name.length <= 3 ? 'uppercase' : 'capitalize'}>
            {type.name}
          </span>
          {type.dimensionless && <span className="badge">no unit needed</span>}
        </p>
        <p className="mt-[2px] flex flex-wrap items-center gap-x-sm text-caption text-muted-soft">
          {type.spoken_units.length > 0 && (
            <span className="inline-flex items-center gap-xxs">
              <IconMic className="h-3.5 w-3.5" />
              listens for {type.spoken_units.join(', ')}
            </span>
          )}
          <span className="tabular">
            {recorded ? `${recorded.count} ${recorded.count === 1 ? 'reading' : 'readings'} recorded` : 'not used yet'}
          </span>
        </p>
      </div>
      <ul className="flex flex-wrap gap-xxs" aria-label={`${type.name} units`}>
        {type.units.map((unit) => {
          const isDefault = unit === type.default_unit;
          return (
            <li
              key={unit}
              title={isDefault ? 'Suggested first when a unit is missing' : undefined}
              className={`inline-flex items-center gap-[3px] rounded-sm px-[6px] py-[2px] font-mono text-[13px] ${
                isDefault
                  ? 'bg-primary/10 text-primary-active ring-1 ring-inset ring-primary/25'
                  : 'bg-surface-card text-body'
              }`}
            >
              {isDefault && <IconStar className="h-3 w-3 fill-current" />}
              {unit}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export default function MeasurementSettings() {
  usePageCrumbs([{ label: 'Settings' }, { label: 'Measurements' }]);
  const types = useQuery({ queryKey: ['measurement-types'], queryFn: fetchMeasurementTypes, staleTime: Infinity });
  const recorded = useRecordedTypes();
  const [query, setQuery] = useState('');

  const listed = useMemo(() => new Set((types.data ?? []).map((t) => t.name.toLowerCase())), [types.data]);
  const unlisted = [...(recorded.data?.entries() ?? [])].filter(([name]) => !listed.has(name));
  const rows = (types.data ?? []).filter((t) => {
    const q = query.trim().toLowerCase();
    return !q || t.name.toLowerCase().includes(q) || t.units.some((u) => u.toLowerCase().includes(q));
  });

  return (
    <main id="main" className="page">
      <header className="animate-rise">
        <p className="eyebrow">Settings</p>
        <h1 className="page-title mt-xs">Measurement types</h1>
        <p className="mt-xs max-w-[60ch] text-body-md text-muted">
          The readings the voice agent knows by name and the units it offers for each. The starred
          unit is suggested first when you don&rsquo;t say one.
        </p>
      </header>

      <div className="mt-xl grid gap-xl lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Known measurement types" className="min-w-0">
          <div className="card overflow-hidden">
            <div className="flex items-center gap-md border-b border-hairline px-lg py-sm">
              <p className="panel-label">{types.data?.length ?? 0} known types</p>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name or unit"
                aria-label="Filter measurement types"
                className="input ml-auto h-9 max-w-[240px]"
              />
            </div>

            {types.isLoading ? (
              <ul className="divide-y divide-hairline-soft" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex items-center gap-md px-lg py-md">
                    <div className="skeleton h-10 w-10 rounded-md" />
                    <div className="skeleton h-4 flex-1" />
                    <div className="skeleton h-5 w-24" />
                  </li>
                ))}
              </ul>
            ) : types.isError ? (
              <div className="px-lg py-xl">
                <p className="text-body-sm text-error">{types.error.message}</p>
                <button type="button" className="btn-secondary mt-md" onClick={() => void types.refetch()}>
                  Try again
                </button>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center px-lg py-xxl text-center">
                <span className="grid h-12 w-12 place-items-center rounded-lg bg-surface-card text-muted">
                  <IconRuler className="h-6 w-6" />
                </span>
                <p className="mt-md text-body-md text-ink">Nothing matches that filter.</p>
              </div>
            ) : (
              <ul className="divide-y divide-hairline-soft">
                {rows.map((type, i) => (
                  <TypeRow key={type.name} type={type} index={i} recorded={recorded.data?.get(type.name.toLowerCase())} />
                ))}
              </ul>
            )}
          </div>

          {unlisted.length > 0 && (
            <div className="mt-lg animate-slide-up rounded-xl border border-accent-amber/30 bg-accent-amber/[0.06] p-lg">
              <p className="text-body-sm font-medium text-ink">Recorded, but not in the list</p>
              <p className="mt-xxs max-w-[60ch] text-caption text-muted">
                These were stored because the vocabulary is open. They get no unit suggestions or
                recognition bias until they are added.
              </p>
              <ul className="mt-sm flex flex-wrap gap-xs">
                {unlisted.map(([name, info]) => (
                  <li key={name} className="rounded-md bg-canvas px-sm py-xxs text-body-sm text-ink ring-1 ring-inset ring-hairline">
                    {name}
                    <span className="ml-xs font-mono text-caption text-muted-soft">
                      {[...info.units].join(', ') || 'no unit'} · {info.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="space-y-md">
          <div className="card p-lg">
            <p className="panel-label">How the agent uses this</p>
            <ul className="mt-md space-y-sm text-body-sm text-body">
              <li>
                <span className="font-medium text-ink">Hearing.</span>{' '}
                <span className="text-muted">Type names and spoken units bias speech recognition.</span>
              </li>
              <li>
                <span className="font-medium text-ink">Asking.</span>{' '}
                <span className="text-muted">
                  With no unit spoken and no protocol default, the agent asks and offers these units.
                </span>
              </li>
              <li>
                <span className="font-medium text-ink">Open list.</span>{' '}
                <span className="text-muted">Readings of other types are still recorded, never forced into one of these.</span>
              </li>
            </ul>
          </div>
          <div className="rounded-xl bg-surface-card/70 p-lg">
            <p className="text-body-sm font-medium text-ink">Adding a type</p>
            <p className="mt-xs text-body-sm text-muted">
              The list changes what the agent hears and suggests, so it lives in code and goes
              through review:
            </p>
            <p className="mt-sm break-all rounded-md bg-canvas px-sm py-xs font-mono text-[12px] text-body ring-1 ring-inset ring-hairline">
              api/app/tools/vocabulary.py
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
