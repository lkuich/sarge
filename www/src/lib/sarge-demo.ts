import { neon } from '@neondatabase/serverless';
import { analyzeProjectEvents, type ProjectDiagnostic } from './project-diagnostics';

export type AccountRole = 'admin' | 'user';
export type ProjectStatus = 'active' | 'paused' | 'draft';

export interface AccountMember {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  lastActive: string;
}

export interface SargeEvent {
  id: string;
  name: string;
  occurredAt: string;
  receivedAt: string;
  sessionId: string;
  userId: string;
  url?: string;
  title?: string;
  properties: Record<string, unknown>;
}

export interface SargeProject {
  id: string;
  slug: string;
  name: string;
  endpointHost: string;
  pixelUrl: string;
  endpointHealthUrl: string;
  status: ProjectStatus;
  environment: 'production' | 'staging';
  eventCount24h: number;
  failedEvents24h: number;
  lastEventAt: string;
  pixelVersion: string;
  recentEvents: SargeEvent[];
  diagnostics: ProjectDiagnostic[];
  diagnosticSummary: string | null;
  diagnosticRunAt: string | null;
}

export interface SargeAccount {
  id: string;
  name: string;
  slug: string;
  role: AccountRole;
  plan: string;
  projects: SargeProject[];
  members: AccountMember[];
}

export interface CreateProjectInput {
  name: string;
  slug?: string;
}

export type CreateProjectResult =
  | { success: true; project: SargeProject }
  | { success: false; error: string };

export const hostedEndpointHost = 'sarge.lkuich.com';

const adminIds = new Set(
  (import.meta.env.SARGE_ADMIN_USER_IDS ?? '')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean),
);

const members: AccountMember[] = [
  {
    id: 'mem_admin',
    name: 'Account Admin',
    email: 'admin@example.com',
    role: 'admin',
    lastActive: 'Today',
  },
  {
    id: 'mem_user',
    name: 'Debug User',
    email: 'debugger@example.com',
    role: 'user',
    lastActive: 'Yesterday',
  },
];

const resolveRole = (userId: string): AccountRole => {
  if (adminIds.size === 0) return 'admin';
  return adminIds.has(userId) ? 'admin' : 'user';
};

export const getViewerAccount = async (userId: string, databaseUrl?: string): Promise<SargeAccount> => {
  const role = resolveRole(userId);

  if (!databaseUrl) {
    return getFallbackAccount(role);
  }

  try {
    const sql = neon(databaseUrl);
    const workspaces = (await sql`
      SELECT id, slug, name
      FROM "Workspace"
      WHERE slug = 'demo'
      LIMIT 1
    `) as WorkspaceRow[];
    const workspace = workspaces.at(0);

    if (!workspace) {
      return getFallbackAccount(role);
    }

    const sites = (await sql`
      SELECT
        s.id,
        s.slug,
        s.name,
        s."endpointHost",
        s."pixelEnabled",
        COUNT(e.id) FILTER (WHERE e."occurredAt" >= NOW() - INTERVAL '24 hours')::int AS "eventCount24h",
        MAX(e."occurredAt") AS "lastOccurredAt"
      FROM "Site" s
      LEFT JOIN "Event" e ON e."siteId" = s.id
      WHERE s."workspaceId" = ${workspace.id}
      GROUP BY s.id
      ORDER BY s."createdAt" ASC
    `) as SiteSummaryRow[];

    const events = (await sql`
      SELECT
        e.id,
        e."siteId",
        e.name,
        e."occurredAt",
        e."receivedAt",
        e."sessionId",
        e."userId",
        e.url,
        e.title,
        e.properties
      FROM "Event" e
      JOIN "Site" s ON s.id = e."siteId"
      WHERE s."workspaceId" = ${workspace.id}
      ORDER BY e."occurredAt" DESC
      LIMIT 30
    `) as EventRow[];
    const diagnosticRuns = (await sql`
      SELECT DISTINCT ON (dr."siteId")
        dr.id,
        dr."siteId",
        dr."aiSummary",
        dr."createdAt",
        dr."findingCount"
      FROM "DiagnosticRun" dr
      JOIN "Site" s ON s.id = dr."siteId"
      WHERE s."workspaceId" = ${workspace.id}
      ORDER BY dr."siteId", dr."createdAt" DESC
    `) as DiagnosticRunRow[];
    const diagnosticFindings = (await sql`
      SELECT
        df.id,
        df."runId",
        df."ruleId",
        df.severity,
        df.title,
        df.summary,
        df.evidence,
        df.recommendation,
        df."agentPrompt"
      FROM "DiagnosticFinding" df
      JOIN "DiagnosticRun" dr ON dr.id = df."runId"
      JOIN "Site" s ON s.id = df."siteId"
      WHERE s."workspaceId" = ${workspace.id}
      ORDER BY df."createdAt" DESC
      LIMIT 100
    `) as DiagnosticFindingRow[];
    const latestRunBySite = new Map(diagnosticRuns.map((run) => [run.siteId, run]));
    const findingsByRun = new Map<string, ProjectDiagnostic[]>();
    for (const finding of diagnosticFindings) {
      const existingFindings = findingsByRun.get(finding.runId) ?? [];
      existingFindings.push(mapDiagnosticFinding(finding));
      findingsByRun.set(finding.runId, existingFindings);
    }

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role,
      plan: 'Hosted shared',
      projects: sites.map((site) => {
        const recentEvents = events.filter((event) => event.siteId === site.id).map(mapEvent);
        const latestRun = latestRunBySite.get(site.id);
        const persistedDiagnostics = latestRun ? findingsByRun.get(latestRun.id) ?? [] : null;

        return {
          id: site.id,
          slug: site.slug,
          name: site.name,
          endpointHost: site.endpointHost,
          pixelUrl: buildPixelUrl(site.id),
          endpointHealthUrl: buildHealthUrl(),
          status: site.pixelEnabled ? 'active' : 'paused',
          environment: 'production',
          eventCount24h: site.eventCount24h ?? 0,
          failedEvents24h: 0,
          lastEventAt: formatRelativeTime(site.lastOccurredAt),
          pixelVersion: '0.1.0',
          recentEvents,
          diagnostics: persistedDiagnostics ?? analyzeProjectEvents(recentEvents),
          diagnosticSummary: latestRun?.aiSummary ?? null,
          diagnosticRunAt: latestRun?.createdAt.toISOString() ?? null,
        };
      }),
      members,
    };
  } catch (error) {
    console.error('Unable to load live Sarge account data', error);
    return getFallbackAccount(role);
  }
};

export const createProject = async (
  userId: string,
  databaseUrl: string | undefined,
  input: CreateProjectInput,
): Promise<CreateProjectResult> => {
  const role = resolveRole(userId);
  if (role !== 'admin') return { success: false, error: 'Only admins can create projects.' };
  if (!databaseUrl) return { success: false, error: 'DATABASE_URL is not configured.' };

  const name = input.name.trim();
  const slug = normalizeSlug(input.slug || input.name);
  if (!name) return { success: false, error: 'Project name is required.' };
  if (!slug) return { success: false, error: 'Project slug is required.' };

  try {
    const sql = neon(databaseUrl);
    await sql`
      INSERT INTO "Workspace" (id, slug, name)
      VALUES ('wrk_demo', 'demo', 'Demo Account')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    `;

    const workspaces = (await sql`
      SELECT id
      FROM "Workspace"
      WHERE slug = 'demo'
      LIMIT 1
    `) as { id: string }[];
    const workspace = workspaces.at(0);
    if (!workspace) return { success: false, error: 'Demo workspace is not available.' };

    const id = `site_${crypto.randomUUID()}`;
    const endpointHost = `${slug}.sarge.lkuich.com`;
    const rows = (await sql`
      INSERT INTO "Site" (id, "workspaceId", slug, name, "endpointHost", "attributionTtlDays", "pixelEnabled")
      VALUES (${id}, ${workspace.id}, ${slug}, ${name}, ${endpointHost}, 28, true)
      RETURNING id, slug, name, "endpointHost", "pixelEnabled"
    `) as Pick<SiteSummaryRow, 'id' | 'slug' | 'name' | 'endpointHost' | 'pixelEnabled'>[];
    const site = rows[0];

    return {
      success: true,
      project: {
        id: site.id,
        slug: site.slug,
        name: site.name,
        endpointHost: site.endpointHost,
        pixelUrl: buildPixelUrl(site.id),
        endpointHealthUrl: buildHealthUrl(),
        status: site.pixelEnabled ? 'active' : 'paused',
        environment: 'production',
        eventCount24h: 0,
        failedEvents24h: 0,
        lastEventAt: 'No events yet',
        pixelVersion: '0.1.0',
        recentEvents: [],
        diagnostics: [],
        diagnosticSummary: null,
        diagnosticRunAt: null,
      },
    };
  } catch (error) {
    console.error('Unable to create Sarge project', error);
    return {
      success: false,
      error: 'Project could not be created. The slug may already be in use.',
    };
  }
};

export const getProject = (account: SargeAccount, slug: string) =>
  account.projects.find((project) => project.slug === slug);

export const canAdministerAccount = (account: SargeAccount) => account.role === 'admin';

export const formatCount = (value: number) => new Intl.NumberFormat('en-US').format(value);

const getFallbackAccount = (role: AccountRole): SargeAccount => ({
  id: 'acct_demo',
  name: 'Demo Account',
  slug: 'demo',
  role,
  plan: 'Hosted shared',
  projects: [
    {
      id: 'site_demo',
      slug: 'demo-site',
      name: 'Demo Site',
      endpointHost: 'sarge.lkuich.com',
      pixelUrl: buildPixelUrl('site_demo'),
      endpointHealthUrl: buildHealthUrl(),
      status: 'active',
      environment: 'production',
      eventCount24h: 184,
      failedEvents24h: 2,
      lastEventAt: '2 minutes ago',
      pixelVersion: '0.1.0',
      recentEvents: [],
      diagnostics: [],
      diagnosticSummary: null,
      diagnosticRunAt: null,
    },
    {
      id: 'site_checkout',
      slug: 'checkout-lab',
      name: 'Checkout Lab',
      endpointHost: 'checkout.sarge.local',
      pixelUrl: buildPixelUrl('site_checkout'),
      endpointHealthUrl: buildHealthUrl(),
      status: 'draft',
      environment: 'staging',
      eventCount24h: 0,
      failedEvents24h: 0,
      lastEventAt: 'No events yet',
      pixelVersion: '0.1.0',
      recentEvents: [],
      diagnostics: [],
      diagnosticSummary: null,
      diagnosticRunAt: null,
    },
  ],
  members,
});

const mapEvent = (event: EventRow): SargeEvent => ({
  id: event.id,
  name: event.name,
  occurredAt: event.occurredAt.toISOString(),
  receivedAt: event.receivedAt.toISOString(),
  sessionId: event.sessionId,
  userId: event.userId,
  url: event.url ?? undefined,
  title: event.title ?? undefined,
  properties: (event.properties ?? {}) as Record<string, unknown>,
});

const mapDiagnosticFinding = (finding: DiagnosticFindingRow): ProjectDiagnostic => ({
  id: finding.ruleId,
  title: finding.title,
  severity: finding.severity,
  summary: finding.summary,
  evidence: Array.isArray(finding.evidence) ? finding.evidence.filter((item): item is string => typeof item === 'string') : [],
  recommendation: finding.recommendation,
  agentPrompt: finding.agentPrompt,
});

const formatRelativeTime = (date: Date | null) => {
  if (!date) return 'No events yet';

  const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.round(hours / 24);
  return `${days} days ago`;
};

const buildPixelUrl = (siteId: string) => `https://${hostedEndpointHost}/pixel.js?site=${encodeURIComponent(siteId)}`;

const buildHealthUrl = () => `https://${hostedEndpointHost}/healthz`;

const normalizeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
}

interface SiteSummaryRow {
  id: string;
  slug: string;
  name: string;
  endpointHost: string;
  pixelEnabled: boolean;
  eventCount24h: number;
  lastOccurredAt: Date | null;
}

interface EventRow {
  id: string;
  siteId: string;
  name: string;
  occurredAt: Date;
  receivedAt: Date;
  sessionId: string;
  userId: string;
  url: string | null;
  title: string | null;
  properties: unknown;
}

interface DiagnosticRunRow {
  id: string;
  siteId: string;
  aiSummary: string | null;
  createdAt: Date;
  findingCount: number;
}

interface DiagnosticFindingRow {
  id: string;
  runId: string;
  ruleId: string;
  severity: ProjectDiagnostic['severity'];
  title: string;
  summary: string;
  evidence: unknown;
  recommendation: string;
  agentPrompt: string;
}
