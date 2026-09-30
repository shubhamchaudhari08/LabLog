/**
 * The protocol form driven as a user drives it (react-dom in jsdom). Asserts the
 * body the page sends to POST /protocols, which is what gets stored.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolDraft } from '@/lib/api';

const createProtocol = vi.fn(async (_draft: ProtocolDraft) => ({ success: true, protocol: { id: 'p1' } }));
const updateProtocol = vi.fn(async (_id: string, _draft: ProtocolDraft) => ({ success: true, protocol: { id: 'p1' } }));
let params = new URLSearchParams();
let stored: unknown[] = [];
vi.mock('@/lib/api', () => ({
  createProtocol: (draft: ProtocolDraft) => createProtocol(draft),
  updateProtocol: (id: string, draft: ProtocolDraft) => updateProtocol(id, draft),
  fetchMeasurementTypes: async () => [
    { name: 'temperature', units: ['C', 'F'], default_unit: 'C', spoken_units: [], dimensionless: false },
    { name: 'pH', units: ['pH'], default_unit: 'pH', spoken_units: [], dimensionless: true },
  ],
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => params,
}));
vi.mock('@/components/shell/AppShell', () => ({ usePageCrumbs: () => undefined }));
vi.mock('@/lib/queries/useExperiment', () => ({ useProtocolList: () => ({ data: stored, isLoading: false }) }));

let root: Root;
let host: HTMLDivElement;

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const { default: Page } = await import('@/app/(app)/protocols/new/page');
  const client = new QueryClient();
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Page)));
  });
  await act(async () => {}); // measurement types resolve
}

beforeEach(() => {
  createProtocol.mockClear();
  updateProtocol.mockClear();
  params = new URLSearchParams();
  stored = [];
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const $ = <T extends Element>(selector: string) => host.querySelector<T>(selector);
const $$ = <T extends Element>(selector: string) => Array.from(host.querySelectorAll<T>(selector));

function type(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error('input not found');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function choose(select: HTMLSelectElement | null, value: string) {
  if (!select) throw new Error('select not found');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function click(el: Element | null | undefined) {
  if (!el) throw new Error('element not found');
  act(() => (el as HTMLElement).click());
}

const button = (text: string, nth = 0) => $$<HTMLButtonElement>('button').filter((b) => b.textContent?.includes(text))[nth];
const stepCards = () => $$<HTMLLIElement>('ol > li');
const inCard = <T extends Element>(card: number, selector: string) => stepCards()[card].querySelectorAll<T>(selector);

async function save() {
  await act(async () => {
    $<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('protocol form', () => {
  it('sends a temperature range on the step it was entered on', async () => {
    await mount();
    type($('#name'), 'Stability');
    type($('#protocol_code'), 'STAB-X');
    type(stepCards()[0].querySelector('input'), 'Register samples');

    click(button('Add step'));
    type(stepCards()[1].querySelector('input'), 'Record initial temperature');
    click(button('Add reading', 1));
    const [, typeInput] = inCard<HTMLInputElement>(1, 'input');
    type(typeInput, 'temperature');
    const [unit, mode] = inCard<HTMLSelectElement>(1, 'select');
    choose(unit, 'C');
    choose(mode, 'range');
    const numbers = inCard<HTMLInputElement>(1, 'input[inputmode="decimal"]');
    type(numbers[0], '2');
    type(numbers[1], '8');

    click(button('Add step'));
    type(stepCards()[2].querySelector('input'), 'Review deviations');
    click(Array.from(inCard<HTMLInputElement>(2, 'input[type="checkbox"]'))[1]);

    await save();

    expect(createProtocol).toHaveBeenCalledTimes(1);
    const draft = createProtocol.mock.calls[0][0];
    expect(draft.steps).toEqual([
      { name: 'Register samples', readings: [] },
      { name: 'Record initial temperature', readings: [{ type: 'temperature', unit: 'C', min: 2, max: 8 }] },
      { name: 'Review deviations', readings: [], requirements: [{ type: 'deviation_review' }] },
    ]);
  });
});

// Eight steps as a protocol saved by an API that ignored reading ranges: the
// temperature readings are there, their ranges are not.
const STORED = {
  id: 'p1',
  protocol_code: 'STAB-X',
  name: 'Stability',
  version: 'v1',
  owner_id: 'me',
  experiments: [{ count: 0 }],
  steps: [
    { index: 0, id: 'step_1', name: 'Register samples', required_fields: [],
      requirements: [{ type: 'samples', sample_type: 'test', count: 2 }, { type: 'samples', sample_type: 'control', count: 1 }] },
    { index: 1, id: 'step_2', name: 'Record initial temperature', required_fields: ['sample_id', 'temperature'], default_unit: { temperature: 'C' } },
    { index: 2, id: 'step_3', name: 'Record initial pH', required_fields: ['sample_id', 'pH'], default_unit: { pH: 'pH' } },
    { index: 3, id: 'step_4', name: 'Record initial appearance', required_fields: [], requirements: [{ type: 'observation', scope: 'all_samples' }] },
    { index: 4, id: 'step_5', name: 'Stability hold', required_fields: [] },
    { index: 5, id: 'step_6', name: 'Record final temperature', required_fields: ['sample_id', 'temperature'], default_unit: { temperature: 'C' } },
    { index: 6, id: 'step_7', name: 'Record final pH', required_fields: ['sample_id', 'pH'], default_unit: { pH: 'pH' } },
    { index: 7, id: 'step_8', name: 'Review deviations', required_fields: [], requirements: [{ type: 'deviation_review' }] },
  ],
};

describe('protocol form, editing', () => {
  it('saves an unchanged protocol unchanged', async () => {
    params = new URLSearchParams('edit=p1');
    stored = [STORED];
    await mount();
    await save();
    const [, draft] = updateProtocol.mock.calls[0];
    expect(draft.steps.map((s) => [s.name, s.readings, s.requirements])).toEqual([
      ['Register samples', [], STORED.steps[0].requirements],
      ['Record initial temperature', [{ type: 'temperature', unit: 'C' }], undefined],
      ['Record initial pH', [{ type: 'pH', unit: 'pH' }], undefined],
      ['Record initial appearance', [], [{ type: 'observation', scope: 'all_samples' }]],
      ['Stability hold', [], undefined],
      ['Record final temperature', [{ type: 'temperature', unit: 'C' }], undefined],
      ['Record final pH', [{ type: 'pH', unit: 'pH' }], undefined],
      ['Review deviations', [], [{ type: 'deviation_review' }]],
    ]);
  });

  it('adds a range to the temperature step and nothing moves', async () => {
    params = new URLSearchParams('edit=p1');
    stored = [STORED];
    await mount();
    const [, mode] = inCard<HTMLSelectElement>(1, 'select');
    choose(mode, 'range');
    const numbers = inCard<HTMLInputElement>(1, 'input[inputmode="decimal"]');
    type(numbers[0], '2');
    type(numbers[1], '8');
    await save();

    expect(updateProtocol).toHaveBeenCalledTimes(1);
    const [, draft] = updateProtocol.mock.calls[0];
    expect(draft.steps[1]).toEqual({ name: 'Record initial temperature', readings: [{ type: 'temperature', unit: 'C', min: 2, max: 8 }] });
    expect(draft.steps.filter((s) => s.requirements?.some((r) => r.type === 'deviation_review')).map((s) => s.name)).toEqual([
      'Review deviations',
    ]);
  });
});

describe('protocol form, reading left on its placeholder', () => {
  it('refuses to save a range whose reading type was never typed, instead of dropping it', async () => {
    await mount();
    type($('#name'), 'Stability');
    type($('#protocol_code'), 'STAB-Y');
    type(stepCards()[0].querySelector('input'), 'Record initial temperature');
    click(button('Add reading'));
    // The type box is left empty; the unit is typed into the free-text unit box.
    const [, typeInput, unitInput] = inCard<HTMLInputElement>(0, 'input');
    expect(typeInput.value).toBe('');
    type(unitInput, 'C');
    const [mode] = inCard<HTMLSelectElement>(0, 'select');
    choose(mode, 'range');
    const numbers = inCard<HTMLInputElement>(0, 'input[inputmode="decimal"]');
    type(numbers[0], '2');
    type(numbers[1], '8');
    await save();

    expect(createProtocol).not.toHaveBeenCalled();
    expect(stepCards()[0].textContent).toContain('Say what is measured, or remove this reading.');
  });
});
