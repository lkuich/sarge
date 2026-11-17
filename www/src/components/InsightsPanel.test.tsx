import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TextDecoderStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InsightsPanel } from './InsightsPanel';
import { insightFixture } from '@/lib/insights.test-fixture';

let root: Root;
let container: HTMLDivElement;
let output: ReadableStreamDefaultController<Uint8Array>;
let fetchMock: ReturnType<typeof vi.fn>;
const send = (value: unknown) => output.enqueue(new TextEncoder().encode(JSON.stringify(value) + '\n'));
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const button = (label: string) => [...container.querySelectorAll('button')].find(button => button.textContent?.includes(label))!;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('TextDecoderStream', TextDecoderStream);
  fetchMock = vi.fn().mockImplementation((_url, options) => options?.method === 'POST'
    ? Promise.resolve(new Response(new ReadableStream({ start(controller) { output = controller; } })))
    : Promise.resolve(Response.json(insightFixture)));
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render() { await act(async () => { root.render(<InsightsPanel environmentId="env/private" />); await settle(); }); }

describe('Insights panel', () => {
  it.each([
    [120, 100, '+20%', 'text-emerald-600'],
    [80, 100, '-20%', 'text-rose-600'],
    [100, 100, '0%', 'text-muted-foreground'],
    [1001, 1000, '0%', 'text-muted-foreground'],
    [12, 0, 'No previous activity', 'text-muted-foreground'],
    [0, 0, 'No activity in either period', 'text-muted-foreground'],
  ])('colors %s vs %s without implying a trend for zero or missing comparisons', async (current, previous, label, color) => {
    fetchMock.mockResolvedValueOnce(Response.json({
      ...insightFixture,
      current: { ...insightFixture.current, events: current },
      previous: { ...insightFixture.previous, events: previous },
    }));
    await render();
    const change = [...container.querySelectorAll('p')].find(element => element.textContent?.startsWith(label));
    expect(change?.classList.contains(color)).toBe(true);
  });

  it('shows aggregates and streams proactive analysis before completion, then sends chat questions', async () => {
    await render();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/project-insights/env%2Fprivate');
    expect(container.textContent).toContain('120');
    expect(container.textContent).toContain('+20%');
    await act(async () => { send({ text: 'Traffic rose by 20%' }); await settle(); });
    expect(container.textContent).toContain('Traffic rose by 20%');
    expect(button('What changed most').disabled).toBe(true);
    await act(async () => { send({ done: true }); output.close(); await settle(); });
    await act(async () => { button('What changed most').click(); await settle(); });
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({ mode: 'chat', messages: [{ role: 'user', content: 'What changed most this week?' }] });
    await act(async () => { send({ text: 'There were 120 events, versus 100.' }); send({ done: true }); output.close(); await settle(); });
    expect(container.textContent).toContain('There were 120 events, versus 100.');
    expect(container.querySelector('[role="log"]')?.textContent).toContain('What changed most this week?');
  });

  it('discards failed partial analysis and retains data and retry controls', async () => {
    await render();
    await act(async () => { send({ text: 'Incomplete claim' }); send({ error: 'AI analysis could not finish.' }); output.close(); await settle(); });
    expect(container.textContent).not.toContain('Incomplete claim');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not finish');
    expect(container.textContent).toContain('120');
    expect(button('Analyze again').disabled).toBe(false);
  });

  it('shows access/load errors without starting an AI request', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Insights is available on Growth and higher.' }, { status: 403 }));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Growth');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
