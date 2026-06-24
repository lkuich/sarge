import { neon } from '@neondatabase/serverless';
import { summarizeEventHosts, type EventHostSummary } from './event-hosts';
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
  referrer?: string;
  title?: string;
  properties: Record<string, unknown>;
}

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  eventNames: string[];
  isActive: boolean;
  createdAt: string;
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
  eventHosts: EventHostSummary[];
  diagnostics: ProjectDiagnostic[];
  diagnosticSummary: string | null;
  diagnosticRunAt: string | null;
  webhookEndpoints: WebhookEndpoint[];
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

export interface CreateWebhookInput {
  name: string;
  url: string;
  eventNames?: string;
}

export type CreateProjectResult =
  | { success: true; project: SargeProject }
  | { success: false; error: string };

export type CreateWebhookResult =
  | { success: true; webhook: WebhookEndpoint; signingSecret: string }
  | { success: false; error: string };

export const hostedEndpointHost = 'track.sargetrack.app';
const demoAccountName = 'Demo Account';
type SqlClient = ReturnType<typeof neon>;

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

const getViewerWorkspace = async (sql: SqlClient, userId: string) => {
  const workspaces = (await sql`
    SELECT id, slug, name
    FROM "Workspace"
    WHERE "ownerUserId" = ${userId}
    LIMIT 1
  `) as WorkspaceRow[];

  return workspaces.at(0) ?? null;
};

const getOrCreateViewerWorkspace = async (sql: SqlClient, userId: string) => {
  const existingWorkspace = await getViewerWorkspace(sql, userId);
  if (existingWorkspace) return existingWorkspace;

  const id = `wrk_${crypto.randomUUID()}`;
  const slug = buildViewerWorkspaceSlug(userId);
  const workspaces = (await sql`
    INSERT INTO "Workspace" (id, slug, name, "ownerUserId")
    VALUES (${id}, ${slug}, ${demoAccountName}, ${userId})
    ON CONFLICT ("ownerUserId") DO UPDATE SET name = EXCLUDED.name
    RETURNING id, slug, name
  `) as WorkspaceRow[];

  return workspaces[0];
};

export const getViewerAccount = async (userId: string, databaseUrl?: string): Promise<SargeAccount> => {
  const role = resolveRole(userId);

  if (!databaseUrl) {
    return getFallbackAccount(role);
  }

  try {
    const sql = neon(databaseUrl);
    const workspace = await getOrCreateViewerWorkspace(sql, userId);

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
        e.referrer,
        e.title,
        e.properties
      FROM "Event" e
      JOIN "Site" s ON s.id = e."siteId"
      WHERE s."workspaceId" = ${workspace.id}
      ORDER BY e."occurredAt" DESC
      LIMIT 200
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
    let webhookEndpoints: WebhookEndpointRow[] = [];
    try {
      webhookEndpoints = (await sql`
        SELECT
          wh.id,
          wh."siteId",
          wh.name,
          wh.url,
          wh."eventNames",
          wh."isActive",
          wh."createdAt"
        FROM "WebhookEndpoint" wh
        JOIN "Site" s ON s.id = wh."siteId"
        WHERE s."workspaceId" = ${workspace.id}
        ORDER BY wh."createdAt" DESC
        LIMIT 100
      `) as WebhookEndpointRow[];
    } catch (error) {
      console.error('Unable to load webhook endpoints', error);
    }
    const latestRunBySite = new Map(diagnosticRuns.map((run) => [run.siteId, run]));
    const findingsByRun = new Map<string, ProjectDiagnostic[]>();
    for (const finding of diagnosticFindings) {
      const existingFindings = findingsByRun.get(finding.runId) ?? [];
      existingFindings.push(mapDiagnosticFinding(finding));
      findingsByRun.set(finding.runId, existingFindings);
    }
    const webhookEndpointsBySite = new Map<string, WebhookEndpoint[]>();
    for (const webhookEndpoint of webhookEndpoints) {
      const existingWebhookEndpoints = webhookEndpointsBySite.get(webhookEndpoint.siteId) ?? [];
      existingWebhookEndpoints.push(mapWebhookEndpoint(webhookEndpoint));
      webhookEndpointsBySite.set(webhookEndpoint.siteId, existingWebhookEndpoints);
    }

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role,
      plan: 'Hosted',
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
          eventHosts: summarizeEventHosts(recentEvents),
          diagnostics: persistedDiagnostics ?? analyzeProjectEvents(recentEvents),
          diagnosticSummary: latestRun?.aiSummary ?? null,
          diagnosticRunAt: latestRun?.createdAt.toISOString() ?? null,
          webhookEndpoints: webhookEndpointsBySite.get(site.id) ?? [],
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
    const workspace = await getOrCreateViewerWorkspace(sql, userId);

    const id = `site_${crypto.randomUUID()}`;
    const endpointHost = buildScopedEndpointHost(slug, workspace.id);
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
        eventHosts: [],
        diagnostics: [],
        diagnosticSummary: null,
        diagnosticRunAt: null,
        webhookEndpoints: [],
      },
    };
  } catch (error) {
    console.error('Unable to create Sarge project', error);
    return {
      success: false,
      error: 'Project could not be created. The slug may already be in use for this account.',
    };
  }
};

export const getProject = (account: SargeAccount, slug: string) =>
  account.projects.find((project) => project.slug === slug);

export const canAdministerAccount = (account: SargeAccount) => account.role === 'admin';

export const formatCount = (value: number) => new Intl.NumberFormat('en-US').format(value);

export const createWebhookEndpoint = async (
  userId: string,
  databaseUrl: string | undefined,
  siteId: string,
  input: CreateWebhookInput,
): Promise<CreateWebhookResult> => {
  const role = resolveRole(userId);
  if (role !== 'admin') return { success: false, error: 'Only admins can create webhooks.' };
  if (!databaseUrl) return { success: false, error: 'DATABASE_URL is not configured.' };

  const name = input.name.trim();
  const url = input.url.trim();
  const eventNames = parseEventNames(input.eventNames ?? '');

  if (!name) return { success: false, error: 'Webhook name is required.' };
  if (!url) return { success: false, error: 'Destination URL is required.' };
  if (!isHttpsUrl(url)) return { success: false, error: 'Destination URL must be a valid HTTPS URL.' };

  try {
    const sql = neon(databaseUrl);
    const workspace = await getViewerWorkspace(sql, userId);
    if (!workspace) return { success: false, error: 'Account workspace was not found.' };

    const sites = (await sql`
      SELECT id
      FROM "Site"
      WHERE id = ${siteId}
        AND "workspaceId" = ${workspace.id}
      LIMIT 1
    `) as { id: string }[];
    if (!sites.at(0)) return { success: false, error: 'Project was not found.' };

    const signingSecret = createSigningSecret();
    const insertedRows = (await sql`
      INSERT INTO "WebhookEndpoint" (
        id,
        "siteId",
        name,
        url,
        "eventNames",
        "signingSecret",
        "isActive"
      )
      VALUES (
        ${crypto.randomUUID()},
        ${siteId},
        ${name},
        ${url},
        ${JSON.stringify(eventNames)},
        ${signingSecret},
        true
      )
      RETURNING id, name, url, "eventNames", "isActive", "createdAt"
    `) as Omit<WebhookEndpointRow, 'siteId'>[];
    const webhook = insertedRows.at(0);
    if (!webhook) return { success: false, error: 'Webhook could not be created.' };

    return {
      success: true,
      webhook: mapWebhookEndpoint({ ...webhook, siteId }),
      signingSecret,
    };
  } catch (error) {
    console.error('Unable to create webhook endpoint', error);
    return {
      success: false,
      error: 'Webhook could not be created. Confirm the database migration has been deployed.',
    };
  }
};

const getFallbackAccount = (role: AccountRole): SargeAccount => ({
  id: 'acct_demo',
  name: demoAccountName,
  slug: 'demo',
  role,
  plan: 'Hosted',
  projects: [
    {
      id: 'site_demo',
      slug: 'demo-site',
      name: 'Demo Site',
      endpointHost: 'demo.sargetrack.app',
      pixelUrl: buildPixelUrl('site_demo'),
      endpointHealthUrl: buildHealthUrl(),
      status: 'active',
      environment: 'production',
      eventCount24h: 184,
      failedEvents24h: 2,
      lastEventAt: '2 minutes ago',
      pixelVersion: '0.1.0',
      recentEvents: [],
      eventHosts: [],
      diagnostics: [],
      diagnosticSummary: null,
      diagnosticRunAt: null,
      webhookEndpoints: [],
    },
    {
      id: 'site_checkout',
      slug: 'checkout-lab',
      name: 'Checkout Lab',
      endpointHost: 'checkout.sargetrack.app',
      pixelUrl: buildPixelUrl('site_checkout'),
      endpointHealthUrl: buildHealthUrl(),
      status: 'draft',
      environment: 'staging',
      eventCount24h: 0,
      failedEvents24h: 0,
      lastEventAt: 'No events yet',
      pixelVersion: '0.1.0',
      recentEvents: [],
      eventHosts: [],
      diagnostics: [],
      diagnosticSummary: null,
      diagnosticRunAt: null,
      webhookEndpoints: [],
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
  referrer: event.referrer ?? undefined,
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

const mapWebhookEndpoint = (webhookEndpoint: WebhookEndpointRow): WebhookEndpoint => ({
  id: webhookEndpoint.id,
  name: webhookEndpoint.name,
  url: webhookEndpoint.url,
  eventNames: Array.isArray(webhookEndpoint.eventNames)
    ? webhookEndpoint.eventNames.filter((eventName): eventName is string => typeof eventName === 'string')
    : [],
  isActive: webhookEndpoint.isActive,
  createdAt: webhookEndpoint.createdAt.toISOString(),
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

const buildViewerWorkspaceSlug = (userId: string) => `demo-${normalizeSlug(userId).slice(0, 56) || 'account'}`;

const buildScopedEndpointHost = (projectSlug: string, workspaceId: string) => {
  const workspaceToken = normalizeSlug(workspaceId).slice(-8) || 'account';
  return `${projectSlug}-${workspaceToken}.sargetrack.app`;
};

const normalizeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

const parseEventNames = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((eventName) => eventName.trim())
        .filter(Boolean),
    ),
  );

const isHttpsUrl = (value: string) => {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
};

const createSigningSecret = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `whsec_${encoded}`;
};

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
  referrer: string | null;
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

interface WebhookEndpointRow {
  id: string;
  siteId: string;
  name: string;
  url: string;
  eventNames: unknown;
  isActive: boolean;
  createdAt: Date;
}
