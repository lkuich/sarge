// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeEvents } from '@sarge/core';

const database = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({
  neon: () => Object.assign((strings: TemplateStringsArray, ...values: unknown[]) =>
    database.query(strings.join('?'), values), { unsafe: (sql: string) => sql }),
}));
import { refreshProjectAiReview } from './sarge-demo';

const access = { userId: 'admin', organizationId: 'org', role: 'admin' as const };
const events = [{
  id: 'event-private', siteId: 'site-private', siteEnvironmentId: 'env-private',
  name: 'checkout.started', occurredAt: new Date('2026-11-16T12:00:00Z'),
  sessionId: 'session-private', userId: 'user-private',
  properties: { value: 84, currency: 'USD', email: 'customer-private@example.com' },
}];
const response = (text: string) => Response.json({
  status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
});
const refresh = (key: string | undefined = 'test-key') => refreshProjectAiReview(access, 'postgres://test', 'env-private', {
  openAiApiKey: key, aiSummaryModel: 'configured-model',
});
const runValues = () => database.query.mock.calls.find(([query]) => query.includes('INSERT INTO "DiagnosticRun"'))![1];
const expectFindings = () => {
  const expected = analyzeEvents(events.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })));
  const inserts = database.query.mock.calls.filter(([query]) => query.includes('INSERT INTO "DiagnosticFinding"'));
  expect(inserts).toHaveLength(expected.length);
  expected.forEach((finding, index) => expect(inserts[index][1].slice(4)).toEqual([
    finding.id, finding.severity, finding.title, finding.summary, JSON.stringify(finding.evidence), finding.recommendation, finding.agentPrompt,
  ]));
};

beforeEach(() => {
  database.query.mockReset().mockImplementation(async (query: string) => {
    if (query.includes('FROM "SiteEnvironment"')) return [{ id: 'env-private', siteId: 'site-private', environment: 'production', endpointHost: 'private.example.com' }];
    if (query.includes('FROM "Event"')) return events;
    return [];
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('manual portal diagnostic summaries', () => {
  it('persists an OpenAI summary with unchanged deterministic findings and a minimized request', async () => {
    const fetcher = vi.fn().mockResolvedValue(response('- Check purchase tracking.\n- Ask an agent to inspect checkout success.'));
    vi.stubGlobal('fetch', fetcher);
    expect(await refresh()).toEqual({ success: true, findingCount: 2 });
    expect(runValues()[6]).toContain('- Check purchase tracking.');
    expectFindings();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(JSON.parse(init.body).model).toBe('configured-model');
    expect(init.body).not.toContain('private');
    expect(init.headers.Authorization).toBe('Bearer test-key');
  });

  it('summarizes manual page-health evidence without exporting the page URL', async () => {
    const url = 'https://private.example.com/orders/customer-private';
    database.query.mockResolvedValueOnce([{ id: 'env-private', siteId: 'site-private' }])
      .mockResolvedValueOnce([{ ...events[0], name: 'page.view', url }]);
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(response('- A tracked page returned 404.'));
    vi.stubGlobal('fetch', fetcher);
    expect(await refresh()).toEqual({ success: true, findingCount: 1 });
    expect(fetcher.mock.calls[0][0]).toBe(url);
    const prompt = fetcher.mock.calls[1][1].body;
    expect(prompt).toContain('[tracked page] returned HTTP 404');
    expect(prompt).not.toContain('private');
    const insert = database.query.mock.calls.find(([query]) => query.includes('INSERT INTO "DiagnosticFinding"'))!;
    expect(insert[1][8]).toContain(url);
    expect(insert[1][10]).toContain(url);
    expect(runValues()[6]).toBe('- A tracked page returned 404.');
  });

  it.each(['missing key', 'unauthorized', 'rate limit', 'server error', 'network', 'malformed', 'empty', 'timeout'])(
    'persists original findings and deterministic text after %s', async (failure) => {
      vi.useFakeTimers();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const fetcher = vi.fn(async (_url, init) => {
        if (failure === 'timeout') return new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('timeout')));
        });
        if (failure === 'network') throw new Error('network');
        if (failure === 'malformed') return Response.json({ unexpected: true });
        if (failure === 'empty') return response(' ');
        return new Response('failure', { status: failure === 'unauthorized' ? 401 : failure === 'rate limit' ? 429 : 500 });
      });
      vi.stubGlobal('fetch', fetcher);
      const pending = refresh(failure === 'missing key' ? '' : 'test-key');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await pending).toEqual({ success: true, findingCount: 2 });
      expect(runValues()[6]).toBeNull();
      expectFindings();
      expect(fetcher).toHaveBeenCalledTimes(failure === 'missing key' ? 0 : 1);
    },
  );

  it('skips OpenAI when there are no findings', async () => {
    database.query.mockResolvedValueOnce([{ id: 'env-private', siteId: 'site-private' }]).mockResolvedValueOnce([]);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(await refresh()).toEqual({ success: true, findingCount: 0 });
    expect(runValues()[6]).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not call OpenAI or persist a run for an inaccessible environment', async () => {
    database.query.mockResolvedValueOnce([]);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(await refresh()).toMatchObject({ success: false });
    expect(fetcher).not.toHaveBeenCalled();
    expect(database.query).toHaveBeenCalledTimes(1);
  });
});
