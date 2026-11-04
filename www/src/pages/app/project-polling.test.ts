import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';

const readSource = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

it('pauses hidden, overlapping, and open-dialog polls, then recovers after errors', async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  let finishRequest!: (response: Response) => void;
  const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finishRequest = resolve; }));
  vi.stubGlobal('fetch', fetch);
  document.body.innerHTML = '<div data-live-debug-stream data-events-endpoint="/api/project-events/env_1"><span data-debug-stream-status>Live</span><div data-debug-events-list></div><dialog></dialog></div>';

  const page = readSource('./projects/[projectId].astro');
  const script = page.slice(page.lastIndexOf('  <script>') + '  <script>'.length, page.lastIndexOf('  </script>'));
  new Function(ts.transpile(script, { target: ts.ScriptTarget.ES2022 }))();
  expect(fetch).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(6000);
  expect(fetch).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue(true);
  finishRequest(Response.json({ events: [] }));
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetch).toHaveBeenCalledTimes(1);

  visibility.mockReturnValue(false);
  const dialog = document.querySelector('dialog')!;
  dialog.setAttribute('open', '');
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetch).toHaveBeenCalledTimes(1);
  dialog.removeAttribute('open');

  fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await vi.advanceTimersByTimeAsync(2000);
  expect(document.querySelector('[data-debug-stream-status]')?.textContent).toBe('Reconnecting');
  fetch.mockResolvedValueOnce(Response.json({ events: [] }));
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(document.querySelector('[data-debug-stream-status]')?.textContent).toBe('Live');
});
