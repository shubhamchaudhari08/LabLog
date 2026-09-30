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

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { usePageCrumbs } from '@/components/shell/AppShell';
import { IconMic, IconRuler, IconSearch } from '@/components/icons';
import { IconTile, UnitChip } from '@/components/ui/bits';
import type { MeasurementType } from '@/lib/api';
import { useMeasurementTypes } from '@/lib/queries/useMeasurementTypes';
import { abbrev } from '@/lib/ui/abbrev';
import { displayName } from '@/lib/ui/displayName';
import { parseExample } from '@/lib/ui/parseExample';
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
  selected,
  onSelect,
  recorded,
}: {
  type: MeasurementType;
  index: number;
  selected: boolean;
  onSelect: () => void;
  recorded?: { count: number; units: Set<string> };
}) {
  return (
    <li className="border-b border-hairline-soft last:border-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`grid min-h-[72px] w-full animate-rise items-center gap-x-md gap-y-xs px-[18px] py-sm text-left transition-colors sm:grid-cols-[44px_minmax(0,1fr)_auto] ${
          selected ? 'list-row-selected' : 'hover:bg-surface-rail'
        }`}
        style={{ animationDelay: `${index * 35}ms` }}
      >
        <IconTile tone={selected ? 'clay' : 'muted'} size={44} className="hidden font-mono text-code sm:grid">
          {abbrev(type.name)}
        </IconTile>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-xs text-title-md text-ink">
            {displayName(type.name)}
            {type.dimensionless && <span className="badge font-normal">no unit needed</span>}
          </span>
          <span className="mt-[2px] flex flex-wrap items-center gap-x-sm text-caption text-body">
            {type.spoken_units.length > 0 && (
              <span className="inline-flex items-center gap-xxs">
                <IconMic className="h-3.5 w-3.5 text-muted" />
                listens for {type.spoken_units.join(', ')}
              </span>
            )}
            <span className={`tabular ${recorded ? 'text-status-running-text' : 'text-muted'}`}>
              {recorded ? `${recorded.count} ${recorded.count === 1 ? 'reading' : 'readings'} recorded` : 'not used yet'}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap gap-xxs" aria-label={`${displayName(type.name)} units`}>
          {type.units.map((unit) => (
            <UnitChip key={unit} unit={unit} isDefault={unit === type.default_unit} />
          ))}
        </span>
      </button>
    </li>
  );
}

/** "Hear it parsed": a worked example, always labelled as one (DESIGN.md D-11, FR-512). */
function HearItParsed({ type }: { type: MeasurementType }) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  useEffect(() => setPhraseIndex(0), [type.name]);
  const example = parseExample(type, phraseIndex);

  return (
    <section aria-labelledby="parsed-heading" className="dark-surface rounded-panel p-[22px]">
      <div className="flex items-start gap-sm">
        <IconTile tone="clay">
          <IconMic className="h-[18px] w-[18px]" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-eyebrow uppercase text-primary-on-dark">Hear it parsed</p>
          <h2 id="parsed-heading" className="font-sans text-title-md text-on-dark">
            {displayName(type.name)}
          </h2>
        </div>
        <span className="rounded-pill bg-dark-muted-fill px-sm py-[3px] text-caption text-on-dark-body">Example</span>
      </div>

      <div className="mt-md space-y-xs">
        {example.phrases.map((phrase, i) => (
          <button
            key={phrase}
            type="button"
            aria-pressed={i === phraseIndex}
            onClick={() => setPhraseIndex(i)}
            className={`w-full rounded-lg border px-[14px] py-[10px] text-left text-body-md text-on-dark transition-colors ${
              i === phraseIndex ? 'border-primary-glow bg-dark-raised' : 'border-dark-border hover:bg-dark-raised'
            }`}
          >
            “{phrase}”
          </button>
        ))}
      </div>

      <div className="mt-md rounded-card border border-dark-line p-md">
        <p className="flex flex-wrap items-baseline gap-y-xs text-[18px] leading-relaxed">
          {example.tokens.map((token, i) =>
            token.role === 'value' ? (
              // #3b2820 / #ffd9c9: DESIGN.md token-value.
              <span key={i} className="rounded-xs border-b-2 border-primary-glow bg-[#3b2820] px-[6px] text-[#ffd9c9]">
                {token.text}
              </span>
            ) : token.role === 'unit' ? (
              // #1f2f2b / #cdeee3 / #6fb8a4: DESIGN.md token-unit.
              <span key={i} className="rounded-xs border-b-2 border-[#6fb8a4] bg-[#1f2f2b] px-[6px] text-[#cdeee3]">
                {token.text}
              </span>
            ) : (
              <span key={i} className="whitespace-pre text-on-dark-body">
                {token.text}
              </span>
            ),
          )}
        </p>
        <dl className="mt-md grid grid-cols-3 gap-xs">
          {(
            [
              ['Type', example.readout.type, 'text-on-dark-muted'],
              ['Value', example.readout.value, 'text-primary-on-dark'],
              ['Unit', example.readout.unit, 'text-unit-on-dark'],
            ] as const
          ).map(([label, value, tone]) => (
            <div key={label} className="rounded-lg bg-dark-raised px-sm py-xs">
              <dt className={`text-eyebrow uppercase ${tone}`}>{label}</dt>
              <dd className={`mt-[2px] truncate text-body-md text-on-dark ${label === 'Type' ? '' : 'font-mono'}`}>{value}</dd>
            </div>
          ))}
        </dl>
        {example.note && <p className="mt-sm text-caption text-on-dark-muted">{example.note}</p>}
      </div>
    </section>
  );
}

export default function MeasurementSettings() {
  usePageCrumbs([{ label: 'Settings' }, { label: 'Measurements' }]);
  const types = useMeasurementTypes();
  const recorded = useRecordedTypes();
  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const listed = useMemo(() => new Set((types.data ?? []).map((t) => t.name.toLowerCase())), [types.data]);
  const unlisted = [...(recorded.data?.entries() ?? [])].filter(([name]) => !listed.has(name));
  const rows = (types.data ?? []).filter((t) => {
    const q = query.trim().toLowerCase();
    return !q || t.name.toLowerCase().includes(q) || t.units.some((u) => u.toLowerCase().includes(q));
  });
  const selected = (types.data ?? []).find((t) => t.name === selectedName) ?? rows[0] ?? types.data?.[0];

  return (
    <main id="main" className="page">
      <header className="animate-rise">
        <p className="eyebrow">Settings</p>
        <h1 className="page-title mt-xs">Measurement types</h1>
        <p className="mt-xs max-w-[64ch] text-body-lg text-body">
          The readings the voice agent knows by name and the units it offers for each. The starred unit is suggested
          first when you don&rsquo;t say one.
        </p>
      </header>

      <div className="mt-xl grid gap-xl lg:grid-cols-[minmax(0,1fr)_420px]">
        <section aria-label="Known measurement types" className="min-w-0">
          <div className="list-panel">
            <div className="flex flex-wrap items-center gap-md border-b border-hairline px-[18px] py-sm">
              <p className="eyebrow">{types.data?.length ?? 0} known types</p>
              <label className="relative ml-auto w-full max-w-[260px]">
                <span className="sr-only">Filter measurement types</span>
                <IconSearch className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by name or unit"
                  className="input pl-[36px]"
                />
              </label>
            </div>

            {types.isLoading ? (
              <ul aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="list-row flex items-center gap-md">
                    <div className="skeleton h-11 w-11 rounded-md" />
                    <div className="skeleton h-4 flex-1" />
                    <div className="skeleton h-6 w-24" />
                  </li>
                ))}
              </ul>
            ) : types.isError ? (
              <div className="px-[18px] py-xl">
                <p className="text-body-md text-danger-text">{types.error.message}</p>
                <button type="button" className="btn-secondary mt-md" onClick={() => void types.refetch()}>
                  Try again
                </button>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center px-[18px] py-xxl text-center">
                <IconTile tone="muted" size={44}>
                  <IconRuler className="h-6 w-6" />
                </IconTile>
                <p className="mt-md text-body-md text-ink">Nothing matches that filter.</p>
              </div>
            ) : (
              <ul>
                {rows.map((type, i) => (
                  <TypeRow
                    key={type.name}
                    type={type}
                    index={i}
                    selected={type.name === selected?.name}
                    onSelect={() => setSelectedName(type.name)}
                    recorded={recorded.data?.get(type.name.toLowerCase())}
                  />
                ))}
              </ul>
            )}
          </div>

          {unlisted.length > 0 && (
            <div className="info-card mt-lg animate-slide-up">
              <p className="text-title-sm text-ink">Recorded, but not in the list</p>
              <p className="mt-xxs max-w-[60ch] text-caption text-body">
                These were stored because the vocabulary is open. They get no unit suggestions or recognition bias until
                they are added.
              </p>
              <ul className="mt-sm flex flex-wrap gap-xs">
                {unlisted.map(([name, info]) => (
                  <li key={name} className="rounded-lg border border-hairline bg-surface-white px-sm py-xxs text-body-md text-ink">
                    {displayName(name)}
                    <span className="ml-xs font-mono text-code text-muted">
                      {[...info.units].join(', ') || 'no unit'} · {info.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="space-y-md">
          {selected && <HearItParsed type={selected} />}
          <div className="info-card">
            <p className="eyebrow">How the agent uses this</p>
            <ul className="mt-md space-y-sm text-body-md text-body">
              <li>
                <span className="font-semibold text-ink">Hearing.</span> Type names and spoken units bias speech recognition.
              </li>
              <li>
                <span className="font-semibold text-ink">Asking.</span> With no unit spoken and no protocol default, the
                agent asks and offers these units.
              </li>
              <li>
                <span className="font-semibold text-ink">Open list.</span> Readings of other types are still recorded, never
                forced into one of these.
              </li>
            </ul>
          </div>
          {/* <div className="note-card">
            <p className="text-title-sm text-ink">Adding a type</p>
            <p className="mt-xs text-body-md text-body">
              The list changes what the agent hears and suggests, so it lives in code and goes through review:
            </p>
            <p className="mt-sm break-all rounded-lg border border-hairline bg-surface-white px-sm py-xs font-mono text-code text-ink">
              api/app/tools/vocabulary.py
            </p>
          </div> */}
        </aside>
      </div>
    </main>
  );
}
