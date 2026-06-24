import { neon } from '@neondatabase/serverless';
import { summarizeEventHosts, type EventHostSummary } from './event-hosts';
import { analyzeProjectEvents, type ProjectDiagnostic } from './project-diagnostics';

export type AccountRole = 'admin' | 'user';
export type ProjectStatus = 'active' | 'paused' | 'draft';
export type ProjectEnvironment = 'production' | 'staging' | 'development';

export const environmentLabels: Record<ProjectEnvironment, string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
};

export const projectEnvironmentOptions = Object.keys(environmentLabels) as ProjectEnvironment[];

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

export interface SargeProjectEnvironment {
  id: string;
  environment: ProjectEnvironment;
  endpointHost: string;
  pixelUrl: string;
  endpointHealthUrl: string;
  status: ProjectStatus;
  serverEventSecretConfigured: boolean;
  postbackTokenConfigured: boolean;
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

export interface SargeProject extends SargeProjectEnvironment {
  slug: string;
  name: string;
  environments: SargeProjectEnvironment[];
}

export interface SargeAccount {
  id: string;
  name: string;
  slug: string;
  role: AccountRole;
  plan: string;
  workspaceSetupComplete: boolean;
  projects: SargeProject[];
  members: AccountMember[];
}

export interface PublicEventStream {
  project: Pick<SargeProjectEnvironment, 'id' | 'endpointHost' | 'pixelUrl' | 'endpointHealthUrl' | 'status'> &
    Pick<SargeProject, 'slug' | 'name'>;
  events: SargeEvent[];
}

export interface CreateWorkspaceInput {
  name: string;
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

export type EnvironmentCredentialKind = 'server' | 'postback';

export type CreateProjectResult =
  | { success: true; project: SargeProject }
  | { success: false; error: string };

export type CreateWorkspaceResult =
  | { success: true; account: Pick<SargeAccount, 'id' | 'name' | 'slug'> }
  | { success: false; error: string };

export type CreateWebhookResult =
  | { success: true; webhook: WebhookEndpoint; signingSecret: string }
  | { success: false; error: string };

export type CreateEnvironmentCredentialResult =
  | { success: true; kind: EnvironmentCredentialKind; token: string; endpoint: string }
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

export const getViewerAccount = async (userId: string, databaseUrl?: string): Promise<SargeAccount> => {
  const role = resolveRole(userId);

  if (!databaseUrl) {
    return getFallbackAccount(role);
  }

  try {
    const sql = neon(databaseUrl);
    const workspace = await getViewerWorkspace(sql, userId);
    if (!workspace) return getSetupAccount(role);

    const sites = (await sql`
      SELECT
        s.id,
        s.slug,
        s.name
      FROM "Site" s
      WHERE s."workspaceId" = ${workspace.id}
      ORDER BY s."createdAt" ASC
    `) as SiteSummaryRow[];
    const siteEnvironments = (await sql`
      SELECT
        se.id,
        se."siteId",
        se.environment,
        se."endpointHost",
        se."pixelEnabled",
        se."serverEventSecretHash",
        se."postbackTokenHash",
        COUNT(e.id) FILTER (WHERE e."occurredAt" >= NOW() - INTERVAL '24 hours')::int AS "eventCount24h",
        MAX(e."occurredAt") AS "lastOccurredAt"
      FROM "SiteEnvironment" se
      JOIN "Site" s ON s.id = se."siteId"
      LEFT JOIN "Event" e ON e."siteEnvironmentId" = se.id
      WHERE s."workspaceId" = ${workspace.id}
      GROUP BY se.id
      ORDER BY se."siteId" ASC, se."createdAt" ASC
    `) as SiteEnvironmentSummaryRow[];

    const events = (await sql`
      SELECT
        e.id,
        e."siteId",
        e."siteEnvironmentId",
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
      SELECT DISTINCT ON (dr."siteEnvironmentId")
        dr.id,
        dr."siteId",
        dr."siteEnvironmentId",
        dr."aiSummary",
        dr."createdAt",
        dr."findingCount"
      FROM "DiagnosticRun" dr
      JOIN "Site" s ON s.id = dr."siteId"
      WHERE s."workspaceId" = ${workspace.id}
      ORDER BY dr."siteEnvironmentId", dr."createdAt" DESC
    `) as DiagnosticRunRow[];
    const diagnosticFindings = (await sql`
      SELECT
        df.id,
        df."runId",
        df."siteEnvironmentId",
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
          wh."siteEnvironmentId",
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
    const latestRunByEnvironment = new Map(diagnosticRuns.map((run) => [run.siteEnvironmentId, run]));
    const findingsByRun = new Map<string, ProjectDiagnostic[]>();
    for (const finding of diagnosticFindings) {
      const existingFindings = findingsByRun.get(finding.runId) ?? [];
      existingFindings.push(mapDiagnosticFinding(finding));
      findingsByRun.set(finding.runId, existingFindings);
    }
    const webhookEndpointsByEnvironment = new Map<string, WebhookEndpoint[]>();
    for (const webhookEndpoint of webhookEndpoints) {
      const existingWebhookEndpoints = webhookEndpointsByEnvironment.get(webhookEndpoint.siteEnvironmentId) ?? [];
      existingWebhookEndpoints.push(mapWebhookEndpoint(webhookEndpoint));
      webhookEndpointsByEnvironment.set(webhookEndpoint.siteEnvironmentId, existingWebhookEndpoints);
    }

    const isPlaceholderWorkspace = workspace.name === demoAccountName && sites.length === 0;

    return {
      id: workspace.id,
      name: isPlaceholderWorkspace ? 'Set up workspace' : workspace.name,
      slug: workspace.slug,
      role,
      plan: 'Cloud',
      workspaceSetupComplete: !isPlaceholderWorkspace,
      projects: sites.map((site) => {
        const environments = siteEnvironments
          .filter((environment) => environment.siteId === site.id)
          .map((environment) => {
            const recentEvents = events.filter((event) => event.siteEnvironmentId === environment.id).map(mapEvent);
            const latestRun = latestRunByEnvironment.get(environment.id);
            const persistedDiagnostics = latestRun ? findingsByRun.get(latestRun.id) ?? [] : null;

            return mapProjectEnvironment(environment, {
              recentEvents,
              persistedDiagnostics,
              latestRun,
              webhookEndpoints: webhookEndpointsByEnvironment.get(environment.id) ?? [],
            });
          });
        const productionEnvironment = environments.find((environment) => environment.environment === 'production') ?? environments[0];
        const eventCount24h = environments.reduce((sum, environment) => sum + environment.eventCount24h, 0);

        return {
          ...productionEnvironment,
          slug: site.slug,
          name: site.name,
          eventCount24h,
          environments,
        };
      }),
      members,
    };
  } catch (error) {
    console.error('Unable to load live Sarge account data', error);
    return getFallbackAccount(role);
  }
};

export const getPublicEventStream = async (
  siteId: string,
  databaseUrl?: string,
): Promise<PublicEventStream | null> => {
  if (!databaseUrl || !siteId.trim()) return null;

  try {
    const sql = neon(databaseUrl);
    const sites = (await sql`
      SELECT se.id, s.slug, s.name, se."endpointHost", se."pixelEnabled"
      FROM "SiteEnvironment" se
      JOIN "Site" s ON s.id = se."siteId"
      WHERE se.id = ${siteId}
        OR (se."siteId" = ${siteId} AND se.environment = 'production')
      LIMIT 1
    `) as PublicSiteEnvironmentRow[];
    const site = sites.at(0);
    if (!site) return null;

    const events = (await sql`
      SELECT
        id,
        "siteId",
        name,
        "occurredAt",
        "receivedAt",
        "sessionId",
        "userId",
        url,
        referrer,
        title,
        properties
      FROM "Event"
      WHERE "siteEnvironmentId" = ${site.id}
      ORDER BY "occurredAt" DESC
      LIMIT 30
    `) as EventRow[];

    return {
      project: {
        id: site.id,
        slug: site.slug,
        name: site.name,
        endpointHost: site.endpointHost,
        pixelUrl: buildPixelUrl(site.id),
        endpointHealthUrl: buildHealthUrl(),
        status: site.pixelEnabled ? 'active' : 'paused',
      },
      events: events.map(mapEvent),
    };
  } catch (error) {
    console.error('Unable to load public Sarge event stream', error);
    return null;
  }
};

export const createWorkspace = async (
  userId: string,
  databaseUrl: string | undefined,
  input: CreateWorkspaceInput,
): Promise<CreateWorkspaceResult> => {
  if (!databaseUrl) return { success: false, error: 'DATABASE_URL is not configured.' };

  const name = input.name.trim();
  if (!name) return { success: false, error: 'Workspace name is required.' };
  if (name.toLowerCase() === demoAccountName.toLowerCase()) {
    return { success: false, error: 'Use your company, team, or store name for the workspace.' };
  }

  try {
    const sql = neon(databaseUrl);
    const existingWorkspace = await getViewerWorkspace(sql, userId);
    const id = existingWorkspace?.id ?? `wrk_${crypto.randomUUID()}`;
    const slug = existingWorkspace?.slug ?? buildViewerWorkspaceSlug(userId);
    const rows = (await sql`
      INSERT INTO "Workspace" (id, slug, name, "ownerUserId")
      VALUES (${id}, ${slug}, ${name}, ${userId})
      ON CONFLICT ("ownerUserId") DO UPDATE SET name = EXCLUDED.name
      RETURNING id, slug, name
    `) as WorkspaceRow[];
    const account = rows[0];
    if (!account) return { success: false, error: 'Workspace could not be created.' };

    return {
      success: true,
      account,
    };
  } catch (error) {
    console.error('Unable to create Sarge workspace', error);
    return {
      success: false,
      error: 'Workspace could not be created. Try a different name.',
    };
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
    const workspace = await getViewerWorkspace(sql, userId);
    if (!workspace || workspace.name === demoAccountName) {
      return { success: false, error: 'Create your workspace before adding a project.' };
    }

    const id = `site_${crypto.randomUUID()}`;
    const endpointHost = buildScopedEndpointHost(slug, workspace.id);
    const rows = (await sql`
      INSERT INTO "Site" (id, "workspaceId", slug, name, "endpointHost", "attributionTtlDays", "pixelEnabled")
      VALUES (${id}, ${workspace.id}, ${slug}, ${name}, ${endpointHost}, 28, true)
      RETURNING id, slug, name, "endpointHost", "pixelEnabled"
    `) as Pick<SiteSummaryRow, 'id' | 'slug' | 'name' | 'endpointHost' | 'pixelEnabled'>[];
    const site = rows[0];
    const environments = await createProjectEnvironments(sql, site, workspace.id);
    const productionEnvironment = environments.find((environment) => environment.environment === 'production') ?? environments[0];

    return {
      success: true,
      project: {
        ...productionEnvironment,
        slug: site.slug,
        name: site.name,
        environments,
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
  siteEnvironmentId: string,
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

    const siteEnvironments = (await sql`
      SELECT se.id, se."siteId"
      FROM "SiteEnvironment" se
      JOIN "Site" s ON s.id = se."siteId"
      WHERE se.id = ${siteEnvironmentId}
        AND s."workspaceId" = ${workspace.id}
      LIMIT 1
    `) as { id: string; siteId: string }[];
    const siteEnvironment = siteEnvironments.at(0);
    if (!siteEnvironment) return { success: false, error: 'Project environment was not found.' };

    const signingSecret = createSigningSecret();
    const insertedRows = (await sql`
      INSERT INTO "WebhookEndpoint" (
        id,
        "siteId",
        "siteEnvironmentId",
        name,
        url,
        "eventNames",
        "signingSecret",
        "isActive"
      )
      VALUES (
        ${crypto.randomUUID()},
        ${siteEnvironment.siteId},
        ${siteEnvironment.id},
        ${name},
        ${url},
        ${JSON.stringify(eventNames)},
        ${signingSecret},
        true
      )
      RETURNING id, name, url, "eventNames", "isActive", "createdAt"
    `) as Omit<WebhookEndpointRow, 'siteId' | 'siteEnvironmentId'>[];
    const webhook = insertedRows.at(0);
    if (!webhook) return { success: false, error: 'Webhook could not be created.' };

    return {
      success: true,
      webhook: mapWebhookEndpoint({ ...webhook, siteId: siteEnvironment.siteId, siteEnvironmentId: siteEnvironment.id }),
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

export const createEnvironmentCredential = async (
  userId: string,
  databaseUrl: string | undefined,
  siteEnvironmentId: string,
  kind: EnvironmentCredentialKind,
): Promise<CreateEnvironmentCredentialResult> => {
  const role = resolveRole(userId);
  if (role !== 'admin') return { success: false, error: 'Only admins can manage server-side credentials.' };
  if (!databaseUrl) return { success: false, error: 'DATABASE_URL is not configured.' };

  try {
    const sql = neon(databaseUrl);
    const workspace = await getViewerWorkspace(sql, userId);
    if (!workspace) return { success: false, error: 'Account workspace was not found.' };

    const siteEnvironments = (await sql`
      SELECT se.id
      FROM "SiteEnvironment" se
      JOIN "Site" s ON s.id = se."siteId"
      WHERE se.id = ${siteEnvironmentId}
        AND s."workspaceId" = ${workspace.id}
      LIMIT 1
    `) as { id: string }[];
    if (!siteEnvironments.at(0)) return { success: false, error: 'Project environment was not found.' };

    const token = createCredentialToken(kind);
    const tokenHash = await sha256Hex(token);

    if (kind === 'server') {
      await sql`
        UPDATE "SiteEnvironment"
        SET "serverEventSecretHash" = ${tokenHash}
        WHERE id = ${siteEnvironmentId}
      `;

      return {
        success: true,
        kind,
        token,
        endpoint: `https://${hostedEndpointHost}/v2/server/events`,
      };
    }

    await sql`
      UPDATE "SiteEnvironment"
      SET "postbackTokenHash" = ${tokenHash}
      WHERE id = ${siteEnvironmentId}
    `;

    return {
      success: true,
      kind,
      token,
      endpoint: `https://${hostedEndpointHost}/v2/postback/${siteEnvironmentId}/${token}`,
    };
  } catch (error) {
    console.error('Unable to create environment credential', error);
    return {
      success: false,
      error: 'Credential could not be rotated. Confirm the database migration has been deployed.',
    };
  }
};

const getFallbackAccount = (role: AccountRole): SargeAccount => ({
  id: 'acct_demo',
  name: demoAccountName,
  slug: 'demo',
  role,
  plan: 'Cloud',
  workspaceSetupComplete: true,
  projects: [
    buildFallbackProject({
      id: 'site_demo',
      slug: 'demo-site',
      name: 'Demo Site',
      status: 'active',
      eventCount24h: 184,
      failedEvents24h: 2,
      lastEventAt: '2 minutes ago',
    }),
    buildFallbackProject({
      id: 'site_checkout',
      slug: 'checkout-lab',
      name: 'Checkout Lab',
      status: 'draft',
      eventCount24h: 0,
      failedEvents24h: 0,
      lastEventAt: 'No events yet',
    }),
  ],
  members,
});

const getSetupAccount = (role: AccountRole): SargeAccount => ({
  id: 'setup',
  name: 'Set up workspace',
  slug: 'setup',
  role,
  plan: 'Setup',
  workspaceSetupComplete: false,
  projects: [],
  members: [],
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

const mapProjectEnvironment = (
  environment: SiteEnvironmentSummaryRow,
  data: {
    recentEvents: SargeEvent[];
    persistedDiagnostics: ProjectDiagnostic[] | null;
    latestRun?: DiagnosticRunRow;
    webhookEndpoints: WebhookEndpoint[];
  },
): SargeProjectEnvironment => ({
  id: environment.id,
  environment: environment.environment,
  endpointHost: environment.endpointHost,
  pixelUrl: buildPixelUrl(environment.id),
  endpointHealthUrl: buildHealthUrl(),
  status: environment.pixelEnabled ? 'active' : 'paused',
  serverEventSecretConfigured: Boolean(environment.serverEventSecretHash),
  postbackTokenConfigured: Boolean(environment.postbackTokenHash),
  eventCount24h: environment.eventCount24h ?? 0,
  failedEvents24h: 0,
  lastEventAt: formatRelativeTime(environment.lastOccurredAt),
  pixelVersion: '0.1.0',
  recentEvents: data.recentEvents,
  eventHosts: summarizeEventHosts(data.recentEvents),
  diagnostics: environment.environment === 'production' ? data.persistedDiagnostics ?? analyzeProjectEvents(data.recentEvents) : [],
  diagnosticSummary: environment.environment === 'production' ? data.latestRun?.aiSummary ?? null : null,
  diagnosticRunAt: environment.environment === 'production' ? data.latestRun?.createdAt.toISOString() ?? null : null,
  webhookEndpoints: data.webhookEndpoints,
});

const createProjectEnvironments = async (
  sql: SqlClient,
  site: Pick<SiteSummaryRow, 'id' | 'slug' | 'endpointHost' | 'pixelEnabled'>,
  workspaceId: string,
): Promise<SargeProjectEnvironment[]> => {
  const environmentRows = await Promise.all(
    projectEnvironmentOptions.map(async (environment) => {
      const id = `env_${crypto.randomUUID()}`;
      const endpointHost =
        environment === 'production' ? site.endpointHost : buildScopedEnvironmentHost(site.slug, environment, workspaceId);
      const rows = (await sql`
        INSERT INTO "SiteEnvironment" (
          id,
          "siteId",
          environment,
          "endpointHost",
          "attributionTtlDays",
          "pixelEnabled"
        )
        VALUES (
          ${id},
          ${site.id},
          ${environment},
          ${endpointHost},
          28,
          true
        )
        RETURNING id, "siteId", environment, "endpointHost", "pixelEnabled", "serverEventSecretHash", "postbackTokenHash", 0::int AS "eventCount24h", NULL::timestamp AS "lastOccurredAt"
      `) as SiteEnvironmentSummaryRow[];

      return rows[0];
    }),
  );

  return environmentRows.map((environment) =>
    mapProjectEnvironment(environment, {
      recentEvents: [],
      persistedDiagnostics: null,
      webhookEndpoints: [],
    }),
  );
};

const buildFallbackProject = (input: {
  id: string;
  slug: string;
  name: string;
  status: ProjectStatus;
  eventCount24h: number;
  failedEvents24h: number;
  lastEventAt: string;
}): SargeProject => {
  const environments = projectEnvironmentOptions.map((environment) => {
    const id = `${input.id}_${environment}`;

    return {
      id,
      environment,
      endpointHost:
        environment === 'production'
          ? `${input.slug}.sargetrack.app`
          : `${input.slug}-${environment}.sargetrack.app`,
      pixelUrl: buildPixelUrl(id),
      endpointHealthUrl: buildHealthUrl(),
      status: input.status,
      serverEventSecretConfigured: false,
      postbackTokenConfigured: false,
      eventCount24h: environment === 'production' ? input.eventCount24h : 0,
      failedEvents24h: environment === 'production' ? input.failedEvents24h : 0,
      lastEventAt: environment === 'production' ? input.lastEventAt : 'No events yet',
      pixelVersion: '0.1.0',
      recentEvents: [],
      eventHosts: [],
      diagnostics: [],
      diagnosticSummary: null,
      diagnosticRunAt: null,
      webhookEndpoints: [],
    } satisfies SargeProjectEnvironment;
  });
  const productionEnvironment = environments.find((environment) => environment.environment === 'production') ?? environments[0];

  return {
    ...productionEnvironment,
    slug: input.slug,
    name: input.name,
    eventCount24h: input.eventCount24h,
    failedEvents24h: input.failedEvents24h,
    lastEventAt: input.lastEventAt,
    environments,
  };
};

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

const buildPixelUrl = (siteEnvironmentId: string) => `https://${hostedEndpointHost}/pixel.js?env=${encodeURIComponent(siteEnvironmentId)}`;

const buildHealthUrl = () => `https://${hostedEndpointHost}/healthz`;

const buildViewerWorkspaceSlug = (userId: string) => `demo-${normalizeSlug(userId).slice(0, 56) || 'account'}`;

const buildScopedEndpointHost = (projectSlug: string, workspaceId: string) => {
  const workspaceToken = normalizeSlug(workspaceId).slice(-8) || 'account';
  return `${projectSlug}-${workspaceToken}.sargetrack.app`;
};

const buildScopedEnvironmentHost = (projectSlug: string, environment: ProjectEnvironment, workspaceId: string) => {
  const workspaceToken = normalizeSlug(workspaceId).slice(-8) || 'account';
  return `${projectSlug}-${environment}-${workspaceToken}.sargetrack.app`;
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

const createCredentialToken = (kind: EnvironmentCredentialKind) => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `${kind === 'server' ? 'sarge_sk' : 'sarge_pb'}_${encoded}`;
};

const sha256Hex = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
}

interface SiteEnvironmentSummaryRow {
  id: string;
  siteId: string;
  environment: ProjectEnvironment;
  endpointHost: string;
  pixelEnabled: boolean;
  serverEventSecretHash: string | null;
  postbackTokenHash: string | null;
  eventCount24h: number;
  lastOccurredAt: Date | null;
}

interface PublicSiteEnvironmentRow {
  id: string;
  slug: string;
  name: string;
  endpointHost: string;
  pixelEnabled: boolean;
}

interface EventRow {
  id: string;
  siteId: string;
  siteEnvironmentId: string;
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
  siteEnvironmentId: string;
  aiSummary: string | null;
  createdAt: Date;
  findingCount: number;
}

interface DiagnosticFindingRow {
  id: string;
  runId: string;
  siteEnvironmentId: string;
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
  siteEnvironmentId: string;
  name: string;
  url: string;
  eventNames: unknown;
  isActive: boolean;
  createdAt: Date;
}
