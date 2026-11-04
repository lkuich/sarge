import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({
  neon: () => Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((text, part, index) => text + part + (
      index < values.length ? (values[index] as { sql?: string })?.sql ?? '?' : ''
    ), '');
    return database.query(query, values);
  }, { unsafe: (sql: string) => ({ sql }) }),
}));

import { getProjectEnvironmentAccess, getViewerAccount, type WorkspaceAccess } from './sarge-demo';

const access: WorkspaceAccess = { userId: 'user_1', organizationId: 'org_1', role: 'admin' };
const projectId = 'site_1';
const environment = {
  id: 'env_production', siteId: projectId, environment: 'production',
  endpointHost: 'track.example.com', pixelEnabled: true, attributionTtlDays: 28,
  lastOccurredAt: null,
};

beforeEach(() => {
  database.query.mockReset().mockImplementation(async (query: string, values: unknown[]) => {
    if (query.includes('claimed_legacy_workspace')) return [{ id: 'workspace_1', name: 'Workspace', planId: 'growth' }];
    if (query.includes('WHERE s."workspaceId"')) return values.includes('unknown-site') ? [] : [{ id: projectId, name: 'Shop', customDomain: 'example.com' }];
    if (query.includes('FROM "SiteEnvironment" se') && query.includes('FROM "ApiToken"')) return [environment];
    if (query.includes('COUNT(e.id) FILTER')) return [{ id: environment.id, eventCount24h: 42 }];
    return [];
  });
});

const queries = () => database.query.mock.calls.map(([query]) => query as string).join('\n');

describe('view-scoped account loading', () => {
  it('loads account metadata without reading events, diagnostics, or webhooks', async () => {
    const account = await getViewerAccount(access, 'postgres://test');
    expect(account.projects.map((project) => project.siteId)).toEqual([projectId]);
    expect(account.projects[0].environments[0].id).toBe(environment.id);
    expect(queries()).not.toMatch(/FROM "(?:Event|DiagnosticRun|DiagnosticFinding|WebhookEndpoint)"/);
  });

  it('loads overview metrics for the selected project and environment without raw event payloads', async () => {
    const account = await getViewerAccount(access, 'postgres://test', { projectId, environment: 'production', view: 'overview' });
    expect(account.projects[0].eventCount24h).toBe(42);
    expect(account.projects[0].recentEvents).toEqual([]);
    expect(queries()).not.toContain('CROSS JOIN LATERAL');
    const [query, values] = database.query.mock.calls.find(([query]) => query.includes('COUNT(e.id) FILTER'))!;
    expect(query).toContain('AND e."occurredAt" >= NOW() - INTERVAL \'48 hours\'');
    expect(values).toContainEqual([projectId]);
    expect(values).toContain('production');
  });

  it('leaves session pagination to the event API', async () => {
    await getViewerAccount(access, 'postgres://test', { projectId, view: 'sessions' });
    expect(queries()).not.toContain('FROM "Event"');
  });

  it.each([['events', 12], ['setup', 80], ['diagnostics', 80]] as const)(
    'bounds %s event reads per environment', async (view, limit) => {
      await getViewerAccount(access, 'postgres://test', { projectId, environment: 'staging', view });
      const [query, values] = database.query.mock.calls.find(([query]) => query.includes('CROSS JOIN LATERAL'))!;
      expect(query).toContain('WHERE e."siteEnvironmentId" = se.id');
      expect(query).toContain('ORDER BY e."occurredAt" DESC, e.id DESC');
      expect(query).not.toContain('row_number()');
      expect(values).toContain(limit);
      expect(values).toContain('staging');
      expect(values).toContainEqual([projectId]);
      expect(queries().includes('FROM "WebhookEndpoint"')).toBe(view === 'setup');
      expect(queries().includes('FROM "DiagnosticRun"')).toBe(view === 'diagnostics');
      expect(queries()).not.toContain('COUNT(e.id) FILTER');
    },
  );

  it('does not query project data when the scoped project is not accessible', async () => {
    const account = await getViewerAccount(access, 'postgres://test', { projectId: 'unknown-site', view: 'overview' });
    expect(account.projects).toEqual([]);
    expect(queries()).not.toContain('FROM "SiteEnvironment"');
    expect(queries()).not.toContain('FROM "Event"');
  });

  it('keeps project privacy overrides in settings', async () => {
    await getViewerAccount(access, 'postgres://test', { projectId, view: 'settings' });
    expect(queries()).toContain('FROM "SitePrivacySettings"');
    expect(queries()).not.toContain('FROM "Event"');
  });
});

describe('event environment authorization', () => {
  it('uses one parameterized query with organization and share checks, without loading traffic', async () => {
    database.query.mockResolvedValueOnce([{ id: environment.id, canManage: false }]);
    const result = await getProjectEnvironmentAccess(access, 'postgres://test', environment.id, [' VIEWER@EXAMPLE.COM ']);
    expect(result).toEqual({ id: environment.id, canManage: false });
    expect(database.query).toHaveBeenCalledTimes(1);
    const [query, values] = database.query.mock.calls[0];
    expect(query).toContain('WHERE se.id = ?');
    expect(query).toContain('w."clerkOrganizationId" = ?');
    expect(query).toContain('ps."siteId" = s.id');
    expect(query).toContain('ps.role = \'edit\'');
    expect(query).toContain('ps."acceptedUserId" = ? OR ps.email = ANY(?)');
    expect(query).not.toContain('FROM "Event"');
    expect(values).toContain(environment.id);
    expect(values).toContain(access.organizationId);
    expect(values).toContain(access.userId);
    expect(values).toContainEqual(['viewer@example.com']);
  });

  it('returns no access when the database finds no authorized environment', async () => {
    await expect(getProjectEnvironmentAccess(access, 'postgres://test', 'unknown', [])).resolves.toBeNull();
  });

  it('fails closed on database errors', async () => {
    database.query.mockRejectedValueOnce(new Error('offline'));
    await expect(getProjectEnvironmentAccess(access, 'postgres://test', environment.id, [])).rejects.toThrow('offline');
    await expect(getProjectEnvironmentAccess(access, undefined, environment.id, [])).rejects.toThrow('unavailable');
  });
});
