import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { getWorkspaceAccess } from '@/lib/workspace-auth';
import { getProjectEnvironmentAccess } from '@/lib/sarge-demo';
import { canUseFeature } from '@/lib/pricing';
import { getProjectInsights } from '@/lib/project-insights';
import { insightRequestSchema, streamInsights } from '@/lib/insights-stream';

export const prerender = false;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const handle: APIRoute = async (context) => {
  const auth = context.locals.auth();
  if (!auth.userId) return json({ error: 'Sign in to view insights.' }, 401);
  const access = getWorkspaceAccess(auth);
  if (!access) return json({ error: 'Select an organization.' }, 403);
  if (context.request.method === 'POST' && context.request.headers.get('origin') !== context.url.origin) {
    return json({ error: 'Request origin is not allowed.' }, 403);
  }
  try {
    const currentUser = await context.locals.currentUser();
    const emails = currentUser?.emailAddresses.map(email => email.emailAddress).filter(Boolean) ?? [];
    const selected = await getProjectEnvironmentAccess(access, env.DATABASE_URL, context.params.environmentId ?? '', emails);
    if (!selected) return json({ error: 'Project environment not found.' }, 404);
    // Entitlement belongs to the project owner, including when this project is shared.
    if (!canUseFeature(selected.planId, 'aiReview')) return json({ error: 'Insights is available on Growth and higher.' }, 403);
    if (context.request.method === 'GET') return json(await getProjectInsights(env.DATABASE_URL!, selected.id));

    if (!context.request.headers.get('content-type')?.startsWith('application/json')) {
      return json({ error: 'Send a JSON question.' }, 400);
    }
    // Enforce the limit while reading, including requests without Content-Length.
    const reader = context.request.body?.getReader();
    if (!reader) return json({ error: 'A question is required.' }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_000) { await reader.cancel(); return json({ error: 'Conversation is too long. Start a new chat.' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: 'Invalid question.' }, 400); }
    const parsed = insightRequestSchema.safeParse(body);
    if (!parsed.success) return json({ error: 'Use a question under 2,000 characters and at most 12 messages.' }, 400);
    const runtime = env as unknown as {
      OPENAI_API_KEY?: string; OPENAI_SUMMARY_MODEL?: string;
      INSIGHTS_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
    };
    if (!runtime.OPENAI_API_KEY?.trim()) return json({ error: 'AI is not configured. Aggregate trends are still available.' }, 503);
    if (!runtime.INSIGHTS_RATE_LIMITER) return json({ error: 'AI is temporarily unavailable. Aggregate trends are still available.' }, 503);
    if (!(await runtime.INSIGHTS_RATE_LIMITER.limit({ key: `${access.organizationId}:${auth.userId}` })).success) {
      return json({ error: 'Too many questions. Wait a minute and retry.' }, 429);
    }
    const data = await getProjectInsights(env.DATABASE_URL!, selected.id);
    return streamInsights(data, parsed.data, runtime.OPENAI_API_KEY, runtime.OPENAI_SUMMARY_MODEL?.trim() || 'gpt-6-luna', context.request.signal);
  } catch {
    return json({ error: 'Insights could not load. Please retry.' }, 503);
  }
};

export const GET = handle;
export const POST = handle;
