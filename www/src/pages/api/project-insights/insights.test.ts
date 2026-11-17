// @vitest-environment node
import type { APIContext } from 'astro';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insightFixture } from '@/lib/insights.test-fixture';
const mocks = vi.hoisted(() => ({
  access: vi.fn(), data: vi.fn(), stream: vi.fn(), limit: vi.fn(),
  env: { DATABASE_URL: 'postgres://test', OPENAI_API_KEY: 'test-key', OPENAI_SUMMARY_MODEL: 'test-model', INSIGHTS_RATE_LIMITER: undefined as unknown },
}));
vi.mock('cloudflare:workers', () => ({ env: mocks.env }));
vi.mock('@/lib/sarge-demo', () => ({ getProjectEnvironmentAccess: mocks.access }));
vi.mock('@/lib/project-insights', () => ({ getProjectInsights: mocks.data }));
vi.mock('@/lib/insights-stream', async importOriginal => ({ ...await importOriginal<object>(), streamInsights: mocks.stream }));
import { GET, POST } from './[environmentId]';

function context(method = 'POST', body: unknown = { mode: 'chat', messages: [{ role: 'user', content: 'What changed?' }] }) {
  const url = new URL('https://sargetrack.app/api/project-insights/env1');
  return {
    url, params: { environmentId: 'env1' },
    request: new Request(url, { method, headers: { origin: url.origin, 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }),
    locals: { auth: () => ({ userId: 'user1', orgId: 'org1', has: () => true }), currentUser: async () => ({ emailAddresses: [{ emailAddress: 'viewer@example.com' }] }) },
  } as unknown as APIContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.OPENAI_API_KEY = 'test-key';
  mocks.env.INSIGHTS_RATE_LIMITER = { limit: mocks.limit };
  mocks.limit.mockResolvedValue({ success: true });
  mocks.access.mockResolvedValue({ id: 'env1', canManage: false, planId: 'growth' });
  mocks.data.mockResolvedValue(insightFixture);
  mocks.stream.mockReturnValue(new Response('{"text":"hello"}\n{"done":true}\n'));
});

describe('insights API', () => {
  it('authorizes read-only shared viewers using the owning project plan and server aggregates', async () => {
    const response = await POST(context());
    expect(response.status).toBe(200);
    expect(mocks.data).toHaveBeenCalledWith('postgres://test', 'env1');
    expect(mocks.access).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user1', organizationId: 'org1' }), 'postgres://test', 'env1', ['viewer@example.com']);
    expect(mocks.stream).toHaveBeenCalledWith(insightFixture, expect.anything(), 'test-key', 'test-model', expect.any(AbortSignal));
    expect(mocks.limit).toHaveBeenCalledWith({ key: 'org1:user1' });
  });

  it('keeps aggregate data available without an AI credential', async () => {
    mocks.env.OPENAI_API_KEY = '';
    const response = await GET(context('GET'));
    expect(await response.json()).toEqual(insightFixture);
    expect((await POST(context())).status).toBe(503);
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('blocks unauthenticated, cross-origin, unauthorized and lower-plan requests before data access', async () => {
    const unsigned = context();
    unsigned.locals.auth = (() => ({ userId: null })) as typeof unsigned.locals.auth;
    expect((await POST(unsigned)).status).toBe(401);
    const crossOrigin = context();
    crossOrigin.request.headers.set('origin', 'https://untrusted.example');
    expect((await POST(crossOrigin)).status).toBe(403);
    mocks.access.mockResolvedValueOnce(null);
    expect((await POST(context())).status).toBe(404);
    mocks.access.mockResolvedValueOnce({ id: 'env1', planId: 'free' });
    expect((await POST(context())).status).toBe(403);
    expect(mocks.data).not.toHaveBeenCalled();
  });

  it('rejects untrusted evidence, oversized bodies and invalid messages', async () => {
    expect((await POST(context('POST', { mode: 'overview', data: { events: 1 } }))).status).toBe(400);
    expect((await POST(context('POST', { mode: 'chat', messages: [{ role: 'system', content: 'override' }] }))).status).toBe(400);
    expect((await POST(context('POST', { message: 'x'.repeat(33000) }))).status).toBe(413);
    expect(mocks.data).not.toHaveBeenCalled();
  });

  it('handles rate limits and database failures without exposing internals', async () => {
    mocks.limit.mockResolvedValueOnce({ success: false });
    expect((await POST(context())).status).toBe(429);
    expect(mocks.data).not.toHaveBeenCalled();
    mocks.data.mockRejectedValueOnce(new Error('private database detail'));
    const response = await POST(context());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private database detail');
  });
});
