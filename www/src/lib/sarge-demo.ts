import { neon } from '@neondatabase/serverless';
import { defaultPrivacySettings, type PropertyPolicyMode } from '@sarge/core';
import { summarizeEventHosts, type EventHostSummary } from './event-hosts';
import { sendProjectAccessNotificationEmail, sendProjectInviteEmail, type ProjectInviteEmailInput } from './project-invite-email';
import { analyzeProjectEvents, type ProjectDiagnostic } from './project-diagnostics';
import { buildPlanLimitSqlCase, buildPlanRetentionFilterSql, getPlanDefinition, type PlanDefinition, type PlanId } from './pricing';

export type AccountRole = 'admin' | 'user';
export type ProjectStatus = 'active' | 'paused' | 'draft';
export type ProjectEnvironment = 'production' | 'staging' | 'development';
export type ProjectShareRole = "view" | "edit";

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
  ref?: string;
  affiliate?: string;
  title?: string;
  properties: Record<string, unknown>;
}

export interface SargeEventMixItem {
  name: string;
  value: number;
  previousValue: number;
  share: number;
}

export interface SargeTrafficTrendPoint {
  date: string;
  label: string;
  value: number;
}

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  eventNames: string[];
  isActive: boolean;
  createdAt: string;
}

export interface ProjectShare {
  id: string;
  email: string;
  role: ProjectShareRole;
  status: 'pending' | 'accepted';
  createdAt: string;
}

export interface SargeProjectEnvironment {
  id: string;
  siteId: string;
  environment: ProjectEnvironment;
  endpointHost: string;
  pixelUrl: string;
  endpointHealthUrl: string;
  status: ProjectStatus;
  attributionTtlDays: number;
  serverEventSecretConfigured: boolean;
  postbackTokenConfigured: boolean;
  eventCount24h: number;
  previousEventCount24h: number;
  sessionCount24h: number;
  previousSessionCount24h: number;
  userCount24h: number;
  previousUserCount24h: number;
  failedEvents24h: number;
  lastEventAt: string;
  pixelVersion: string;
  eventMix24h: SargeEventMixItem[];
  trafficTrend7d: SargeTrafficTrendPoint[];
  recentEvents: SargeEvent[];
  eventHosts: EventHostSummary[];
  diagnostics: ProjectDiagnostic[];
  diagnosticSummary: string | null;
  diagnosticRunAt: string | null;
  webhookEndpoints: WebhookEndpoint[];
}

export interface SargeProject extends SargeProjectEnvironment {
  name: string;
  customDomain: string;
  workspaceName?: string;
  ownership: "owned" | "shared";
  shareRole?: ProjectShareRole;
  shares: ProjectShare[];
  environments: SargeProjectEnvironment[];
  privacySettings: SargePrivacySettings;
}

export interface SargeAccount {
  id: string;
  name: string;
  slug: string;
  role: AccountRole;
  planId: PlanId;
  plan: PlanDefinition;
  billingStatus: 'active' | 'past_due' | 'canceled';
  currentPeriodEventCount: number;
  termsAcceptedAt: Date | null;
  termsAcceptedVersion: string | null;
  privacyAcceptedVersion: string | null;
  workspaceLegalAcceptanceRequired: boolean;
  privacySettings: SargePrivacySettings;
  workspaceSetupComplete: boolean;
  ownedProjects: SargeProject[];
  sharedProjects: SargeProject[];
  projects: SargeProject[];
  members: AccountMember[];
}

export interface ProjectEnvironmentEventQuery {
  limit: number;
  startAt?: string | null;
  endAt?: string | null;
}

export interface SargePrivacySettings {
  piiRedactionEnabled: boolean;
  propertyPolicyMode: PropertyPolicyMode;
  blockedPropertyKeys: string[];
  allowedPropertyKeys: string[];
  customRedactionKeys: string[];
  customRedactionPatterns: string[];
}

export interface PrivacySettingsInput {
  piiRedactionEnabled?: boolean;
  propertyPolicyMode?: string;
  blockedPropertyKeys?: string;
  allowedPropertyKeys?: string;
  customRedactionKeys?: string;
  customRedactionPatterns?: string;
}

export type SavePrivacySettingsResult =
  | { success: true; settings: SargePrivacySettings }
  | { success: false; error: string };

export type CreateDeletionRequestResult =
  | { success: true; request: DeletionRequestSummary }
  | { success: false; error: string };

export type ProcessDeletionRequestsResult = {
  processed: number;
  failed: number;
};

export interface DeletionRequestSummary {
  id: string;
  scope: 'workspace' | 'site';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  targetWorkspaceId: string | null;
  targetSiteId: string | null;
  createdAt: string;
}

export interface PublicEventStream {
  project: Pick<SargeProjectEnvironment, 'id' | 'endpointHost' | 'pixelUrl' | 'endpointHealthUrl' | 'status'> &
    Pick<SargeProject, 'name'>;
  events: SargeEvent[];
}

export interface CreateWorkspaceInput {
  name: string;
  acceptLegalTerms?: boolean;
  acceptedIp?: string | null;
  acceptedUserAgent?: string | null;
}

export interface CreateProjectInput {
  name: string;
  domain: string;
}

interface GetViewerAccountOptions {
  viewerEmails?: string[];
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  eventNames?: string;
}

export interface ShareProjectInput {
  email: string;
  role: ProjectShareRole;
}

export interface ProjectInviteEmailOptions {
  emailSender?: ProjectInviteEmailInput['emailSender'];
  emailFrom?: string;
  appUrl: string;
}

export type EnvironmentCredentialKind = 'server' | 'postback';

export type CreateProjectResult =
  | { success: true; project: SargeProject }
  | { success: false; error: string };

export type CreateWorkspaceResult =
  | { success: true; account: Pick<SargeAccount, 'id' | 'name' | 'slug'> }
  | { success: false; error: string };

export type AcceptWorkspaceLegalTermsResult =
  | { success: true }
  | { success: false; error: string };

export type DeleteWorkspaceResult =
  | { success: true }
  | { success: false; error: string };

export type CreateWebhookResult =
  | { success: true; webhook: WebhookEndpoint; signingSecret: string }
  | { success: false; error: string };

export type CreateEnvironmentCredentialResult =
  | { success: true; kind: EnvironmentCredentialKind; token: string; endpoint: string }
  | { success: false; error: string };

export type ShareProjectResult =
  | { success: true; share: ProjectShare; warning?: string }
  | { success: false; error: string };

export type UpdateProjectShareResult =
  | { success: true; share: ProjectShare }
  | { success: false; error: string };

export type RemoveProjectShareResult =
  | { success: true }
  | { success: false; error: string };

export type CreatePublicVerificationLinkResult =
  | { success: true; url: string; expiresAt: Date }
  | { success: false; error: string };

export const hostedEndpointHost = 'track.sargetrack.app';
export const CURRENT_LEGAL_VERSION = "2026-06-25";
export const CURRENT_PRIVACY_VERSION = "2026-06-25";
const demoAccountName = 'Demo Account';
type SqlClient = ReturnType<typeof neon>;
const projectLimitSqlCase = buildPlanLimitSqlCase('projects', 'w."planId"');
const projectShareLimitSqlCase = buildPlanLimitSqlCase('projectShares', 'w."planId"');
const webhookLimitSqlCase = buildPlanLimitSqlCase('webhooks', 'w."planId"');
const serverSecretLimitSqlCase = buildPlanLimitSqlCase('serverSecrets', 'w."planId"');
const postbackTokenLimitSqlCase = buildPlanLimitSqlCase('postbackTokens', 'w."planId"');
const eventRetentionFilterSql = buildPlanRetentionFilterSql('e."occurredAt"', 'w."planId"');
const eventMixRetentionFilterSql = buildPlanRetentionFilterSql('e_mix."occurredAt"', 'w."planId"');
const eventTrendRetentionFilterSql = buildPlanRetentionFilterSql('e_trend."occurredAt"', 'w."planId"');
const nonWatchdogEventFilterSql = `e.name NOT IN ('meta.pixel.fire', 'google.tag.fire', 'data_layer.push')`;
const nonWatchdogEventMixFilterSql = `e_mix.name NOT IN ('meta.pixel.fire', 'google.tag.fire', 'data_layer.push')`;
const nonWatchdogEventTrendFilterSql = `e_trend.name NOT IN ('meta.pixel.fire', 'google.tag.fire', 'data_layer.push')`;

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
  if (adminIds.size === 0) return 'user';
  return adminIds.has(userId) ? 'admin' : 'user';
};

const getViewerWorkspace = async (sql: SqlClient, userId: string) => {
  const workspaces = (await sql`
    SELECT
      id,
      slug,
      name,
      "planId",
      "billingStatus",
      "currentPeriodEventCount",
      "termsAcceptedAt",
      "termsAcceptedVersion",
      "privacyAcceptedVersion"
    FROM "Workspace"
    WHERE "ownerUserId" = ${userId}
    LIMIT 1
  `) as WorkspaceRow[];

  return workspaces.at(0) ?? null;
};

const getViewerProjectShares = async (
  sql: SqlClient,
  userId: string,
  viewerEmails: string[],
): Promise<ProjectShareRow[]> => {
  if (viewerEmails.length === 0) {
    return (await sql`
      SELECT
        ps.id,
        ps."siteId",
        ps.email,
        ps.role,
        ps."acceptedUserId",
        ps."createdAt",
        ps."acceptedAt"
      FROM "ProjectShare" ps
      WHERE ps."acceptedUserId" = ${userId}
      ORDER BY ps."createdAt" DESC
    `) as ProjectShareRow[];
  }

  return (await sql`
    SELECT
      ps.id,
      ps."siteId",
      ps.email,
      ps.role,
      ps."acceptedUserId",
      ps."createdAt",
      ps."acceptedAt"
    FROM "ProjectShare" ps
    WHERE ps."acceptedUserId" = ${userId}
      OR ps.email = ANY(${viewerEmails})
    ORDER BY ps."createdAt" DESC
  `) as ProjectShareRow[];
};

const getOwnedSiteById = async (sql: SqlClient, userId: string, siteId: string) => {
  const rows = (await sql`
    SELECT
      s.id,
      s.name
    FROM "Site" s
    JOIN "Workspace" w ON w.id = s."workspaceId"
    WHERE w."ownerUserId" = ${userId}
      AND s.id = ${siteId}
    LIMIT 1
  `) as Pick<SiteSummaryRow, 'id' | 'name'>[];

  return rows.at(0) ?? null;
};

const normalizeEmails = (emails: string[]) =>
  Array.from(
    new Set(
      emails
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

const normalizeShareRole = (role: string | null | undefined): ProjectShareRole | null => {
  if (role === "view" || role === "edit") return role;
  return null;
};

const normalizeInviteEmail = (email: string) => {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return '';
  return normalized;
};

const defaultSargePrivacySettings: SargePrivacySettings = {
  piiRedactionEnabled: defaultPrivacySettings.piiRedactionEnabled,
  propertyPolicyMode: defaultPrivacySettings.propertyPolicyMode,
  blockedPropertyKeys: [],
  allowedPropertyKeys: [],
  customRedactionKeys: [],
  customRedactionPatterns: [],
};

const normalizePrivacySettingsInput = (input: PrivacySettingsInput): SargePrivacySettings => ({
  piiRedactionEnabled: input.piiRedactionEnabled ?? false,
  propertyPolicyMode: input.propertyPolicyMode === 'allowlist' ? 'allowlist' : 'blocklist',
  blockedPropertyKeys: parseSettingsList(input.blockedPropertyKeys),
  allowedPropertyKeys: parseSettingsList(input.allowedPropertyKeys),
  customRedactionKeys: parseSettingsList(input.customRedactionKeys),
  customRedactionPatterns: parseSettingsList(input.customRedactionPatterns, { lowercase: false }),
});

const parseSettingsList = (value: string | undefined, options: { lowercase?: boolean } = {}) => {
  const lowercase = options.lowercase ?? true;
  return Array.from(
    new Set(
      (value ?? '')
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (lowercase ? item.toLowerCase() : item)),
    ),
  );
};

const readStringArray = (value: unknown): string[] => {
  const parsed = typeof value === 'string' ? parseJson(value) : value;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
};

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

const mapPrivacySettings = (row: Partial<PrivacySettingsRow> | null | undefined): SargePrivacySettings => ({
  piiRedactionEnabled: row?.piiRedactionEnabled ?? defaultSargePrivacySettings.piiRedactionEnabled,
  propertyPolicyMode: row?.propertyPolicyMode === 'allowlist' ? 'allowlist' : 'blocklist',
  blockedPropertyKeys: readStringArray(row?.blockedPropertyKeys),
  allowedPropertyKeys: readStringArray(row?.allowedPropertyKeys),
  customRedactionKeys: readStringArray(row?.customRedactionKeys),
  customRedactionPatterns: readStringArray(row?.customRedactionPatterns),
});

const mergePrivacySettings = (
  workspaceSettings: SargePrivacySettings,
  siteSettings: Partial<PrivacySettingsRow> | null | undefined,
): SargePrivacySettings => ({
  piiRedactionEnabled: siteSettings?.piiRedactionEnabled ?? workspaceSettings.piiRedactionEnabled,
  propertyPolicyMode: siteSettings?.propertyPolicyMode === 'allowlist' || siteSettings?.propertyPolicyMode === 'blocklist'
    ? siteSettings.propertyPolicyMode
    : workspaceSettings.propertyPolicyMode,
  blockedPropertyKeys: siteSettings?.blockedPropertyKeys == null ? workspaceSettings.blockedPropertyKeys : readStringArray(siteSettings.blockedPropertyKeys),
  allowedPropertyKeys: siteSettings?.allowedPropertyKeys == null ? workspaceSettings.allowedPropertyKeys : readStringArray(siteSettings.allowedPropertyKeys),
  customRedactionKeys: siteSettings?.customRedactionKeys == null ? workspaceSettings.customRedactionKeys : readStringArray(siteSettings.customRedactionKeys),
  customRedactionPatterns: siteSettings?.customRedactionPatterns == null ? workspaceSettings.customRedactionPatterns : readStringArray(siteSettings.customRedactionPatterns),
});

const workspaceLegalAcceptanceRequired = (workspace: Pick<WorkspaceRow, 'termsAcceptedAt' | 'termsAcceptedVersion' | 'privacyAcceptedVersion'> | null) => {
  if (!workspace) return false;
  return (
    !workspace.termsAcceptedAt ||
    workspace.termsAcceptedVersion !== CURRENT_LEGAL_VERSION ||
    workspace.privacyAcceptedVersion !== CURRENT_PRIVACY_VERSION
  );
};

export const getViewerAccount = async (
  userId: string,
  databaseUrl?: string,
  options: GetViewerAccountOptions = {},
): Promise<SargeAccount> => {
  const role = resolveRole(userId);
  const viewerEmails = normalizeEmails(options.viewerEmails ?? []);

  if (!databaseUrl) {
    return getFallbackAccount(role);
  }

  try {
    const sql = neon(databaseUrl);
    const workspace = await getViewerWorkspace(sql, userId);
    const sharedProjectShares = await getViewerProjectShares(sql, userId, viewerEmails);
    const sharedSiteIds = Array.from(new Set(sharedProjectShares.map((share) => share.siteId)));
    const sharedSites = sharedSiteIds.length > 0 ? ((await sql`
      SELECT
        s.id,
        s.name,
        s."customDomain",
        w.name AS "workspaceName"
      FROM "Site" s
      JOIN "Workspace" w ON w.id = s."workspaceId"
      WHERE s.id = ANY(${sharedSiteIds})
      ORDER BY s."createdAt" ASC
    `) as SharedSiteSummaryRow[]) : [];

    if (!workspace && sharedSites.length === 0) return getSetupAccount(role);

    const sites = workspace ? ((await sql`
      SELECT
        s.id,
        s.name,
        s."customDomain"
      FROM "Site" s
      WHERE s."workspaceId" = ${workspace.id}
      ORDER BY s."createdAt" ASC
    `) as SiteSummaryRow[]) : [];
    const allSiteIds = Array.from(new Set([...sites.map((site) => site.id), ...sharedSiteIds]));
    const workspacePrivacyRows = workspace ? ((await sql`
      SELECT
        "piiRedactionEnabled",
        "propertyPolicyMode",
        "blockedPropertyKeys",
        "allowedPropertyKeys",
        "customRedactionKeys",
        "customRedactionPatterns"
      FROM "WorkspacePrivacySettings"
      WHERE "workspaceId" = ${workspace.id}
      LIMIT 1
    `) as PrivacySettingsRow[]) : [];
    const workspacePrivacySettings = mapPrivacySettings(workspacePrivacyRows.at(0));
    const sitePrivacyRows = allSiteIds.length > 0 ? ((await sql`
      SELECT
        "siteId",
        "piiRedactionEnabled",
        "propertyPolicyMode",
        "blockedPropertyKeys",
        "allowedPropertyKeys",
        "customRedactionKeys",
        "customRedactionPatterns"
      FROM "SitePrivacySettings"
      WHERE "siteId" = ANY(${allSiteIds})
    `) as SitePrivacySettingsRow[]) : [];
    const privacySettingsBySite = new Map(sitePrivacyRows.map((row) => [row.siteId, row]));
    const siteEnvironments = allSiteIds.length > 0 ? ((await sql`
      SELECT
        se.id,
        se."siteId",
        se.environment,
        se."endpointHost",
        se."attributionTtlDays",
        se."pixelEnabled",
        se."serverEventSecretHash",
        se."postbackTokenHash",
        COUNT(e.id) FILTER (WHERE e."occurredAt" >= NOW() - INTERVAL '24 hours' AND ${sql.unsafe(nonWatchdogEventFilterSql)})::int AS "eventCount24h",
        COUNT(e.id) FILTER (WHERE e."occurredAt" >= NOW() - INTERVAL '48 hours' AND e."occurredAt" < NOW() - INTERVAL '24 hours' AND ${sql.unsafe(nonWatchdogEventFilterSql)})::int AS "previousEventCount24h",
        COUNT(DISTINCT NULLIF(e."sessionId", '')) FILTER (WHERE e."occurredAt" >= NOW() - INTERVAL '24 hours' AND ${sql.unsafe(nonWatchdogEventFilterSql)})::int AS "sessionCount24h",
        COUNT(DISTINCT NULLIF(e."sessionId", '')) FILTER (WHERE e."occurredAt" >= NOW() - INTERVAL '48 hours' AND e."occurredAt" < NOW() - INTERVAL '24 hours' AND ${sql.unsafe(nonWatchdogEventFilterSql)})::int AS "previousSessionCount24h",
        COUNT(DISTINCT NULLIF(e."userId", '')) FILTER (WHERE e."occurredAt" >= NOW() - INTERVAL '24 hours' AND ${sql.unsafe(nonWatchdogEventFilterSql)})::int AS "userCount24h",
        COUNT(DISTINCT NULLIF(e."userId", '')) FILTER (WHERE e."occurredAt" >= NOW() - INTERVAL '48 hours' AND e."occurredAt" < NOW() - INTERVAL '24 hours' AND ${sql.unsafe(nonWatchdogEventFilterSql)})::int AS "previousUserCount24h",
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'name', event_mix.event_name,
              'value', event_mix.event_count,
              'previousValue', event_mix.previous_event_count
            )
            ORDER BY event_mix.event_count DESC, event_mix.event_name ASC
          )
          FROM (
            SELECT
              e_mix.name AS event_name,
              COUNT(e_mix.id) FILTER (WHERE e_mix."occurredAt" >= NOW() - INTERVAL '24 hours')::int AS event_count,
              COUNT(e_mix.id) FILTER (WHERE e_mix."occurredAt" >= NOW() - INTERVAL '48 hours' AND e_mix."occurredAt" < NOW() - INTERVAL '24 hours')::int AS previous_event_count
            FROM "Event" e_mix
            WHERE e_mix."siteEnvironmentId" = se.id
              AND e_mix."occurredAt" >= NOW() - INTERVAL '48 hours'
              AND ${sql.unsafe(nonWatchdogEventMixFilterSql)}
              AND ${sql.unsafe(eventMixRetentionFilterSql)}
            GROUP BY e_mix.name
            HAVING COUNT(e_mix.id) FILTER (WHERE e_mix."occurredAt" >= NOW() - INTERVAL '24 hours') > 0
            ORDER BY event_count DESC, event_name ASC
            LIMIT 4
          ) event_mix
        ), '[]'::jsonb) AS "eventMix24h",
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'date', to_char(day_bucket, 'YYYY-MM-DD'),
              'label', to_char(day_bucket, 'Dy'),
              'value', event_count
            )
            ORDER BY day_bucket ASC
          )
          FROM (
            SELECT
              day_bucket,
              COUNT(e_trend.id)::int AS event_count
            FROM generate_series(
              date_trunc('day', NOW()) - INTERVAL '6 days',
              date_trunc('day', NOW()),
              INTERVAL '1 day'
            ) AS trend_days(day_bucket)
            LEFT JOIN "Event" e_trend ON e_trend."siteEnvironmentId" = se.id
              AND e_trend."occurredAt" >= day_bucket
              AND e_trend."occurredAt" < day_bucket + INTERVAL '1 day'
              AND ${sql.unsafe(nonWatchdogEventTrendFilterSql)}
              AND ${sql.unsafe(eventTrendRetentionFilterSql)}
            GROUP BY day_bucket
          ) event_trend
        ), '[]'::jsonb) AS "trafficTrend7d",
        MAX(e."occurredAt") AS "lastOccurredAt"
      FROM "SiteEnvironment" se
      JOIN "Site" s ON s.id = se."siteId"
      JOIN "Workspace" w ON w.id = s."workspaceId"
      LEFT JOIN "Event" e ON e."siteEnvironmentId" = se.id
        AND ${sql.unsafe(eventRetentionFilterSql)}
      WHERE s.id = ANY(${allSiteIds})
      GROUP BY se.id, w."planId"
      ORDER BY se."siteId" ASC, se."createdAt" ASC
    `) as SiteEnvironmentSummaryRow[]) : [];

    const events = allSiteIds.length > 0 ? ((await sql`
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
        e.ref,
        e.affiliate,
        e.title,
        e.properties
      FROM "Event" e
      JOIN "Site" s ON s.id = e."siteId"
      JOIN "Workspace" w ON w.id = s."workspaceId"
      WHERE s.id = ANY(${allSiteIds})
        AND ${sql.unsafe(eventRetentionFilterSql)}
      ORDER BY e."occurredAt" DESC
      LIMIT 200
    `) as EventRow[]) : [];
    const diagnosticRuns = allSiteIds.length > 0 ? ((await sql`
      SELECT DISTINCT ON (dr."siteEnvironmentId")
        dr.id,
        dr."siteId",
        dr."siteEnvironmentId",
        dr."aiSummary",
        dr."createdAt",
        dr."findingCount"
      FROM "DiagnosticRun" dr
      JOIN "Site" s ON s.id = dr."siteId"
      WHERE s.id = ANY(${allSiteIds})
      ORDER BY dr."siteEnvironmentId", dr."createdAt" DESC
    `) as DiagnosticRunRow[]) : [];
    const diagnosticFindings = allSiteIds.length > 0 ? ((await sql`
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
      WHERE s.id = ANY(${allSiteIds})
      ORDER BY df."createdAt" DESC
      LIMIT 100
    `) as DiagnosticFindingRow[]) : [];
    const projectShares = allSiteIds.length > 0 ? ((await sql`
      SELECT
        ps.id,
        ps."siteId",
        ps.email,
        ps.role,
        ps."acceptedUserId",
        ps."createdAt",
        ps."acceptedAt"
      FROM "ProjectShare" ps
      JOIN "Site" s ON s.id = ps."siteId"
      WHERE s.id = ANY(${allSiteIds})
      ORDER BY ps."createdAt" DESC
    `) as ProjectShareRow[]) : [];
    let webhookEndpoints: WebhookEndpointRow[] = [];
    try {
      webhookEndpoints = allSiteIds.length > 0 ? ((await sql`
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
        WHERE s.id = ANY(${allSiteIds})
        ORDER BY wh."createdAt" DESC
        LIMIT 100
      `) as WebhookEndpointRow[]) : [];
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
    const projectSharesBySite = new Map<string, ProjectShare[]>();
    for (const share of projectShares) {
      const existingShares = projectSharesBySite.get(share.siteId) ?? [];
      existingShares.push(mapProjectShare(share));
      projectSharesBySite.set(share.siteId, existingShares);
    }
    const viewerShareBySite = new Map(sharedProjectShares.map((share) => [share.siteId, share]));

    const isPlaceholderWorkspace = workspace?.name === demoAccountName && sites.length === 0;
    const planId = workspace?.planId ?? 'free';
    const requiresLegalAcceptance = workspaceLegalAcceptanceRequired(workspace);

    const ownedProjects = sites.map((site) => {
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
        name: site.name,
        siteId: site.id,
        customDomain: site.customDomain,
        ownership: "owned",
        shares: projectSharesBySite.get(site.id) ?? [],
        eventCount24h,
        environments,
        privacySettings: mergePrivacySettings(workspacePrivacySettings, privacySettingsBySite.get(site.id)),
      } satisfies SargeProject;
    });
    const sharedProjects = sharedSites.map((site) => {
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
      const viewerShare = viewerShareBySite.get(site.id);

      return {
        ...productionEnvironment,
        name: site.name,
        siteId: site.id,
        customDomain: site.customDomain,
        workspaceName: site.workspaceName,
        ownership: "shared",
        shareRole: normalizeShareRole(viewerShare?.role) ?? "view",
        shares: projectSharesBySite.get(site.id) ?? [],
        eventCount24h,
        environments,
        privacySettings: mergePrivacySettings(workspacePrivacySettings, privacySettingsBySite.get(site.id)),
      } satisfies SargeProject;
    });

    return {
      id: workspace?.id ?? 'shared',
      name: workspace ? (isPlaceholderWorkspace ? 'Set up workspace' : workspace.name) : 'Shared projects',
      slug: workspace?.slug ?? 'shared',
      role,
      planId,
      plan: getPlanDefinition(planId),
      billingStatus: workspace?.billingStatus ?? 'active',
      currentPeriodEventCount: workspace?.currentPeriodEventCount ?? 0,
      termsAcceptedAt: workspace?.termsAcceptedAt ?? null,
      termsAcceptedVersion: workspace?.termsAcceptedVersion ?? null,
      privacyAcceptedVersion: workspace?.privacyAcceptedVersion ?? null,
      workspaceLegalAcceptanceRequired: requiresLegalAcceptance,
      privacySettings: workspacePrivacySettings,
      workspaceSetupComplete: Boolean(workspace && !isPlaceholderWorkspace),
      ownedProjects,
      sharedProjects,
      projects: [...ownedProjects, ...sharedProjects],
      members,
    };
  } catch (error) {
    console.error('Unable to load live Sarge account data', error);
    return getFallbackAccount(role);
  }
};

export const getPublicEventStream = async (
  siteId: string,
  verificationKey: string | null,
  databaseUrl?: string,
): Promise<PublicEventStream | null> => {
  if (!databaseUrl || !siteId.trim() || !verificationKey?.trim()) return null;

  try {
    const sql = neon(databaseUrl);
    const verificationKeyHash = await sha256Hex(verificationKey);
    const sites = (await sql`
      SELECT se.id, s.name, se."endpointHost", se."pixelEnabled"
      FROM "SiteEnvironment" se
      JOIN "Site" s ON s.id = se."siteId"
      JOIN "PublicVerificationToken" pvt ON pvt."siteEnvironmentId" = se.id
      WHERE (se.id = ${siteId}
        OR (se."siteId" = ${siteId} AND se.environment = 'production'))
        AND pvt."tokenHash" = ${verificationKeyHash}
        AND pvt."expiresAt" > NOW()
      LIMIT 1
    `) as PublicSiteEnvironmentRow[];
    const site = sites.at(0);
    if (!site) return null;

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
        e.ref,
        e.affiliate,
        e.title,
        e.properties
      FROM "Event" e
      JOIN "Site" s ON s.id = e."siteId"
      JOIN "Workspace" w ON w.id = s."workspaceId"
      WHERE e."siteEnvironmentId" = ${site.id}
        AND ${sql.unsafe(eventRetentionFilterSql)}
      ORDER BY e."occurredAt" DESC
      LIMIT 30
    `) as EventRow[];

    return {
      project: {
        id: site.id,
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

export const getProjectEnvironmentEvents = async (
  databaseUrl: string | undefined,
  environmentId: string,
  query: ProjectEnvironmentEventQuery,
): Promise<SargeEvent[] | null> => {
  if (!databaseUrl || !environmentId.trim()) return null;

  try {
    const sql = neon(databaseUrl);
    const limit = Math.min(Math.max(query.limit, 1), 80);
    const startAt = normalizeEventBoundary(query.startAt);
    const endAt = normalizeEventBoundary(query.endAt);
    const hasTimeWindow = Boolean(startAt || endAt);

    if (!hasTimeWindow) {
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
          e.ref,
          e.affiliate,
          e.title,
          e.properties
        FROM "Event" e
        JOIN "Site" s ON s.id = e."siteId"
        JOIN "Workspace" w ON w.id = s."workspaceId"
        WHERE e."siteEnvironmentId" = ${environmentId}
          AND ${sql.unsafe(eventRetentionFilterSql)}
        ORDER BY e."occurredAt" DESC
        LIMIT ${limit}
      `) as EventRow[];

      return events.map(mapEvent);
    }

    const events = (await sql`
      WITH matching_events AS (
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
          e.ref,
          e.affiliate,
          e.title,
          e.properties,
          NTILE(${limit}) OVER (ORDER BY e."occurredAt" ASC) AS sample_bucket
        FROM "Event" e
        JOIN "Site" s ON s.id = e."siteId"
        JOIN "Workspace" w ON w.id = s."workspaceId"
        WHERE e."siteEnvironmentId" = ${environmentId}
          AND ${sql.unsafe(eventRetentionFilterSql)}
          AND (${startAt}::timestamptz IS NULL OR e."occurredAt" >= ${startAt}::timestamptz)
          AND (${endAt}::timestamptz IS NULL OR e."occurredAt" <= ${endAt}::timestamptz)
      ),
      sampled_events AS (
        SELECT DISTINCT ON (sample_bucket)
          id,
          "siteId",
          "siteEnvironmentId",
          name,
          "occurredAt",
          "receivedAt",
          "sessionId",
          "userId",
          url,
          referrer,
          ref,
          affiliate,
          title,
          properties
        FROM matching_events
        ORDER BY sample_bucket ASC, "occurredAt" DESC
      )
      SELECT *
      FROM sampled_events
      ORDER BY "occurredAt" DESC
      LIMIT ${limit}
    `) as EventRow[];

    return events.map(mapEvent);
  } catch (error) {
    console.error('Unable to load project environment events', error);
    return null;
  }
};

export const createPublicVerificationLink = async (
  userId: string,
  databaseUrl: string | undefined,
  siteEnvironmentId: string,
  appUrl: string,
): Promise<CreatePublicVerificationLinkResult> => {
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
    const siteEnvironment = siteEnvironments.at(0);
    if (!siteEnvironment) return { success: false, error: 'Project environment was not found.' };

    const token = createVerificationToken();
    const tokenHash = await sha256Hex(token);
    const tokenExpiry = { expiresAt: new Date(Date.now() + 30 * 60 * 1000) };
    const { expiresAt } = tokenExpiry;

    await sql`
      INSERT INTO "PublicVerificationToken" (id, "siteEnvironmentId", "tokenHash", "expiresAt", "createdByUserId")
      VALUES (${`pvt_${crypto.randomUUID()}`}, ${siteEnvironment.id}, ${tokenHash}, ${expiresAt.toISOString()}, ${userId})
    `;

    const origin = new URL(appUrl).origin;
    return {
      success: true,
      url: `${origin}/verify/${encodeURIComponent(siteEnvironment.id)}?key=${encodeURIComponent(token)}`,
      expiresAt,
    };
  } catch (error) {
    console.error('Unable to create public verification link', error);
    return {
      success: false,
      error: 'Verification link could not be created. Confirm the database migration has been deployed.',
    };
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
  if (!input.acceptLegalTerms) {
    return { success: false, error: 'Legal acceptance is required before creating a workspace.' };
  }
  if (name.toLowerCase() === demoAccountName.toLowerCase()) {
    return { success: false, error: 'Use your company, team, or store name for the workspace.' };
  }

  try {
    const sql = neon(databaseUrl);
    const existingWorkspace = await getViewerWorkspace(sql, userId);
    const id = existingWorkspace?.id ?? `wrk_${crypto.randomUUID()}`;
    const slug = existingWorkspace?.slug ?? buildViewerWorkspaceSlug(userId);
    const acceptedAt = new Date();
    const rows = (await sql`
      INSERT INTO "Workspace" (
        id,
        slug,
        name,
        "ownerUserId",
        "termsAcceptedAt",
        "termsAcceptedVersion",
        "privacyAcceptedVersion",
        "termsAcceptedIp",
        "termsAcceptedUserAgent"
      )
      VALUES (
        ${id},
        ${slug},
        ${name},
        ${userId},
        ${acceptedAt.toISOString()},
        ${CURRENT_LEGAL_VERSION},
        ${CURRENT_PRIVACY_VERSION},
        ${input.acceptedIp ?? null},
        ${input.acceptedUserAgent ?? null}
      )
      ON CONFLICT ("ownerUserId") DO UPDATE SET
        name = EXCLUDED.name,
        "termsAcceptedAt" = EXCLUDED."termsAcceptedAt",
        "termsAcceptedVersion" = EXCLUDED."termsAcceptedVersion",
        "privacyAcceptedVersion" = EXCLUDED."privacyAcceptedVersion",
        "termsAcceptedIp" = EXCLUDED."termsAcceptedIp",
        "termsAcceptedUserAgent" = EXCLUDED."termsAcceptedUserAgent"
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

export const acceptWorkspaceLegalTerms = async (
  userId: string,
  databaseUrl: string | undefined,
  input: Pick<CreateWorkspaceInput, 'acceptedIp' | 'acceptedUserAgent'> = {},
): Promise<AcceptWorkspaceLegalTermsResult> => {
  if (!databaseUrl) return { success: false, error: 'DATABASE_URL is not configured.' };

  try {
    const sql = neon(databaseUrl);
    const acceptedAt = new Date();
    const rows = (await sql`
      UPDATE "Workspace"
      SET
        "termsAcceptedAt" = ${acceptedAt.toISOString()},
        "termsAcceptedVersion" = ${CURRENT_LEGAL_VERSION},
        "privacyAcceptedVersion" = ${CURRENT_PRIVACY_VERSION},
        "termsAcceptedIp" = ${input.acceptedIp ?? null},
        "termsAcceptedUserAgent" = ${input.acceptedUserAgent ?? null}
      WHERE "ownerUserId" = ${userId}
      RETURNING id
    `) as { id: string }[];

    if (!rows.at(0)) return { success: false, error: 'Workspace was not found.' };
    return { success: true };
  } catch (error) {
    console.error('Unable to accept Sarge legal terms', error);
    return {
      success: false,
      error: 'Legal acceptance could not be saved.',
    };
  }
};

export const deleteWorkspace = async (
  userId: string,
  databaseUrl: string | undefined,
): Promise<DeleteWorkspaceResult> => {
  if (!databaseUrl) return { success: false, error: 'DATABASE_URL is not configured.' };

  try {
    const sql = neon(databaseUrl);
    const workspace = await getViewerWorkspace(sql, userId);
    if (!workspace) return { success: false, error: 'Workspace was not found.' };

    const projectCounts = (await sql`
      SELECT COUNT(*)::int AS count
      FROM "Site"
      WHERE "workspaceId" = ${workspace.id}
    `) as { count: number }[];
    const projectCount = projectCounts.at(0)?.count ?? 0;
    if (projectCount > 0) {
      return { success: false, error: 'Only empty workspaces can be deleted.' };
    }

    await sql`
      DELETE FROM "Workspace"
      WHERE id = ${workspace.id}
        AND "ownerUserId" = ${userId}
    `;

    return { success: true };
  } catch (error) {
    console.error('Unable to delete Sarge workspace', error);
    return {
      success: false,
      error: 'Workspace could not be deleted.',
    };
  }
};

export const loadWorkspacePrivacySettings = async (
  userId: string,
  databaseUrl: string | undefined,
): Promise<SargePrivacySettings> => {
  if (!databaseUrl) return defaultSargePrivacySettings;

  try {
    const sql = neon(databaseUrl);
    const workspace = await getViewerWorkspace(sql, userId);
    if (!workspace) return defaultSargePrivacySettings;

    const rows = (await sql`
      SELECT
        "piiRedactionEnabled",
        "propertyPolicyMode",
        "blockedPropertyKeys",
        "allowedPropertyKeys",
        "customRedactionKeys",
        "customRedactionPatterns"
      FROM "WorkspacePrivacySettings"
      WHERE "workspaceId" = ${workspace.id}
      LIMIT 1
    `) as PrivacySettingsRow[];

    return mapPrivacySettings(rows.at(0));
  } catch (error) {
    console.error('Unable to load workspace privacy settings', error);
    return defaultSargePrivacySettings;
  }
};

export const saveWorkspacePrivacySettings = async (
  userId: string,
  databaseUrl: string | undefined,
  input: PrivacySettingsInput,
): Promise<SavePrivacySettingsResult> => {
  if (!databaseUrl) return { success: false, error: 'DATABASE_URL is not configured.' };

  try {
    const sql = neon(databaseUrl);
    const workspace = await getViewerWorkspace(sql, userId);
    if (!workspace) return { success: false, error: 'Workspace was not found.' };

    const settings = normalizePrivacySettingsInput(input);
    await sql`
      INSERT INTO "WorkspacePrivacySettings" (
        id,
        "workspaceId",
        "piiRedactionEnabled",
        "propertyPolicyMode",
        "blockedPropertyKeys",
        "allowedPropertyKeys",
        "customRedactionKeys",
        "customRedactionPatterns"
      )
      VALUES (
        ${`wps_${crypto.randomUUID()}`},
        ${workspace.id},
        ${settings.piiRedactionEnabled},
        ${settings.propertyPolicyMode},
        ${JSON.stringify(settings.blockedPropertyKeys)}::jsonb,
        ${JSON.stringify(settings.allowedPropertyKeys)}::jsonb,
        ${JSON.stringify(settings.customRedactionKeys)}::jsonb,
        ${JSON.stringify(settings.customRedactionPatterns)}::jsonb
      )
      ON CONFLICT ("workspaceId") DO UPDATE SET
        "piiRedactionEnabled" = EXCLUDED."piiRedactionEnabled",
        "propertyPolicyMode" = EXCLUDED."propertyPolicyMode",
        "blockedPropertyKeys" = EXCLUDED."blockedPropertyKeys",
        "allowedPropertyKeys" = EXCLUDED."allowedPropertyKeys",
        "customRedactionKeys" = EXCLUDED."customRedactionKeys",
        "customRedactionPatterns" = EXCLUDED."customRedactionPatterns",
        "updatedAt" = NOW()
    `;

    return { success: true, settings };
  } catch (error) {
    console.error('Unable to save workspace privacy settings', error);
    return { success: false, error: 'Workspace privacy settings could not be saved.' };
  }
};

export const saveSitePrivacySettings = async (
  userId: string,
  databaseUrl: string | undefined,
  siteId: string,
  input: PrivacySettingsInput,
): Promise<SavePrivacySettingsResult> => {
  if (!databaseUrl) return { success: false, error: 'DATABASE_URL is not configured.' };

  try {
    const sql = neon(databaseUrl);
    const site = await getOwnedSiteById(sql, userId, siteId);
    if (!site) return { success: false, error: 'Project was not found in your workspace.' };

    const settings = normalizePrivacySettingsInput(input);
    await sql`
      INSERT INTO "SitePrivacySettings" (
        id,
        "siteId",
        "piiRedactionEnabled",
        "propertyPolicyMode",
        "blockedPropertyKeys",
        "allowedPropertyKeys",
        "customRedactionKeys",
        "customRedactionPatterns"
      )
      VALUES (
        ${`sps_${crypto.randomUUID()}`},
        ${site.id},
        ${settings.piiRedactionEnabled},
        ${settings.propertyPolicyMode},
        ${JSON.stringify(settings.blockedPropertyKeys)}::jsonb,
        ${JSON.stringify(settings.allowedPropertyKeys)}::jsonb,
        ${JSON.stringify(settings.customRedactionKeys)}::jsonb,
        ${JSON.stringify(settings.customRedactionPatterns)}::jsonb
      )
      ON CONFLICT ("siteId") DO UPDATE SET
        "piiRedactionEnabled" = EXCLUDED."piiRedactionEnabled",
        "propertyPolicyMode" = EXCLUDED."propertyPolicyMode",
        "blockedPropertyKeys" = EXCLUDED."blockedPropertyKeys",
        "allowedPropertyKeys" = EXCLUDED."allowedPropertyKeys",
        "customRedactionKeys" = EXCLUDED."customRedactionKeys",
        "customRedactionPatterns" = EXCLUDED."customRedactionPatterns",
        "updatedAt" = NOW()
    `;

    return { success: true, settings };
  } catch (error) {
    console.error('Unable to save site privacy settings', error);
    return { success: false, error: 'Project privacy settings could not be saved.' };
  }
};

export const createDeletionRequest = async (
  userId: string,
  databaseUrl: string | undefined,
  input: { scope: 'workspace' | 'site'; targetSiteId?: string; confirmation: string },
): Promise<CreateDeletionRequestResult> => {
  if (!databaseUrl) return { success: false, error: 'DATABASE_URL is not configured.' };
  if (input.confirmation !== 'DELETE') return { success: false, error: 'Type DELETE to confirm this deletion request.' };

  try {
    const sql = neon(databaseUrl);
    const workspace = await getViewerWorkspace(sql, userId);
    if (!workspace) return { success: false, error: 'Workspace was not found.' };

    const targetSite = input.scope === 'site'
      ? await getOwnedSiteById(sql, userId, input.targetSiteId ?? '')
      : null;
    if (input.scope === 'site' && !targetSite) {
      return { success: false, error: 'Project was not found in your workspace.' };
    }

    const rows = (await sql`
      INSERT INTO "DeletionRequest" (
        id,
        scope,
        "targetWorkspaceId",
        "targetSiteId",
        "requestedByUserId",
        status
      )
      VALUES (
        ${`del_${crypto.randomUUID()}`},
        ${input.scope},
        ${workspace.id},
        ${targetSite?.id ?? null},
        ${userId},
        'pending'
      )
      RETURNING id, scope, status, "targetWorkspaceId", "targetSiteId", "createdAt"
    `) as DeletionRequestRow[];

    return { success: true, request: mapDeletionRequest(rows[0]) };
  } catch (error) {
    console.error('Unable to create deletion request', error);
    return { success: false, error: 'Deletion request could not be created.' };
  }
};

export const processPendingDeletionRequests = async (
  databaseUrl: string | undefined,
  limit = 10,
): Promise<ProcessDeletionRequestsResult> => {
  if (!databaseUrl) return { processed: 0, failed: 0 };

  const sql = neon(databaseUrl);
  const requests = (await sql`
    SELECT id, scope, status, "targetWorkspaceId", "targetSiteId", "createdAt"
    FROM "DeletionRequest"
    WHERE status = 'pending'
    ORDER BY "createdAt" ASC
    LIMIT ${limit}
  `) as DeletionRequestRow[];

  let processed = 0;
  let failed = 0;

  for (const request of requests) {
    try {
      await sql`UPDATE "DeletionRequest" SET status = 'processing', "startedAt" = NOW(), "updatedAt" = NOW() WHERE id = ${request.id}`;
      if (request.scope === 'site' && request.targetSiteId) {
        await deleteSiteData(sql, request.targetSiteId);
      } else if (request.scope === 'workspace' && request.targetWorkspaceId) {
        await deleteWorkspaceData(sql, request.targetWorkspaceId);
      } else {
        throw new Error('Deletion request target is missing.');
      }
      await sql`UPDATE "DeletionRequest" SET status = 'completed', "completedAt" = NOW(), "updatedAt" = NOW() WHERE id = ${request.id}`;
      processed += 1;
    } catch (error) {
      failed += 1;
      await sql`
        UPDATE "DeletionRequest"
        SET status = 'failed', error = ${error instanceof Error ? error.message : 'Deletion failed'}, "updatedAt" = NOW()
        WHERE id = ${request.id}
      `;
    }
  }

  return { processed, failed };
};

const deleteSiteData = async (sql: SqlClient, siteId: string) => {
  const environmentRows = (await sql`
    SELECT id
    FROM "SiteEnvironment"
    WHERE "siteId" = ${siteId}
  `) as { id: string }[];
  const environmentIds = environmentRows.map((row) => row.id);

  if (environmentIds.length > 0) {
    await sql`DELETE FROM "PublicVerificationToken" WHERE "siteEnvironmentId" = ANY(${environmentIds})`;
    await sql`DELETE FROM "NotificationDelivery" WHERE "siteEnvironmentId" = ANY(${environmentIds})`;
  }

  await sql`DELETE FROM "NotificationDelivery" WHERE "siteId" = ${siteId}`;
  await sql`DELETE FROM "DiagnosticFinding" WHERE "siteId" = ${siteId}`;
  await sql`DELETE FROM "DiagnosticRun" WHERE "siteId" = ${siteId}`;
  await sql`DELETE FROM "WebhookEndpoint" WHERE "siteId" = ${siteId}`;
  await sql`DELETE FROM "Event" WHERE "siteId" = ${siteId}`;
  await sql`DELETE FROM "ProjectShare" WHERE "siteId" = ${siteId}`;
  await sql`DELETE FROM "SitePrivacySettings" WHERE "siteId" = ${siteId}`;
  await sql`DELETE FROM "Site" WHERE id = ${siteId}`;
};

const deleteWorkspaceData = async (sql: SqlClient, workspaceId: string) => {
  const sites = (await sql`
    SELECT id
    FROM "Site"
    WHERE "workspaceId" = ${workspaceId}
  `) as { id: string }[];

  for (const site of sites) {
    await deleteSiteData(sql, site.id);
  }

  await sql`DELETE FROM "NotificationPreference" WHERE "workspaceId" = ${workspaceId}`;
  await sql`DELETE FROM "NotificationDelivery" WHERE "workspaceId" = ${workspaceId}`;
  await sql`DELETE FROM "WorkspacePrivacySettings" WHERE "workspaceId" = ${workspaceId}`;
  await sql`DELETE FROM "Workspace" WHERE id = ${workspaceId}`;
};

const mapDeletionRequest = (row: DeletionRequestRow): DeletionRequestSummary => ({
  id: row.id,
  scope: row.scope === 'site' ? 'site' : 'workspace',
  status: normalizeDeletionStatus(row.status),
  targetWorkspaceId: row.targetWorkspaceId,
  targetSiteId: row.targetSiteId,
  createdAt: row.createdAt.toISOString(),
});

const normalizeDeletionStatus = (status: string): DeletionRequestSummary['status'] => {
  if (status === 'processing' || status === 'completed' || status === 'failed') return status;
  return 'pending';
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
  const siteDomain = normalizeSiteDomain(input.domain);
  const customDomain = siteDomain ? buildSargeTrackingDomain(siteDomain) : null;
  if (!name) return { success: false, error: 'Project name is required.' };
  if (!customDomain) return { success: false, error: 'Site domain is required.' };

  try {
    const sql = neon(databaseUrl);
    const workspace = await getViewerWorkspace(sql, userId);
    if (!workspace || workspace.name === demoAccountName) {
      return { success: false, error: 'Create your workspace before adding a project.' };
    }

    const id = `site_${crypto.randomUUID()}`;
    const endpointHost = buildScopedEndpointHost(id, workspace.id);
    const productionEnvironmentId = `env_${crypto.randomUUID()}`;
    const stagingEnvironmentId = `env_${crypto.randomUUID()}`;
    const developmentEnvironmentId = `env_${crypto.randomUUID()}`;
    const stagingEndpointHost = buildScopedEnvironmentHost(id, 'staging', workspace.id);
    const developmentEndpointHost = buildScopedEnvironmentHost(id, 'development', workspace.id);
    const [, rows] = (await sql.transaction((tx) => [
      tx`
        SELECT id
        FROM "Workspace"
        WHERE id = ${workspace.id}
          AND "ownerUserId" = ${userId}
        FOR UPDATE
      `,
      tx`
        WITH workspace_row AS (
        SELECT id, "planId"
        FROM "Workspace"
        WHERE id = ${workspace.id}
          AND "ownerUserId" = ${userId}
      ),
      limited_workspace AS (
        SELECT w.id
        FROM workspace_row w
        WHERE ${tx.unsafe(projectLimitSqlCase)} IS NULL
          OR (
            SELECT COUNT(*)::int
            FROM "Site" existing_site
            WHERE existing_site."workspaceId" = w.id
          ) < ${tx.unsafe(projectLimitSqlCase)}
      ),
      inserted_site AS (
      INSERT INTO "Site" (id, "workspaceId", name, "customDomain", "endpointHost", "attributionTtlDays", "pixelEnabled")
      SELECT ${id}, lw.id, ${name}, ${customDomain}, ${endpointHost}, 28, true
      FROM limited_workspace lw
      RETURNING id, name, "customDomain", "endpointHost", "pixelEnabled"
      ),
      inserted_environments AS (
        INSERT INTO "SiteEnvironment" (
          id,
          "siteId",
          environment,
          "endpointHost",
          "attributionTtlDays",
          "pixelEnabled"
        )
        SELECT environment_row.id, inserted_site.id, environment_row.environment, environment_row."endpointHost", 28, true
        FROM inserted_site
        CROSS JOIN (
          VALUES
            (${productionEnvironmentId}, 'production', ${endpointHost}),
            (${stagingEnvironmentId}, 'staging', ${stagingEndpointHost}),
            (${developmentEnvironmentId}, 'development', ${developmentEndpointHost})
        ) AS environment_row(id, environment, "endpointHost")
        RETURNING
          id,
          "siteId",
          environment,
          "endpointHost",
          "attributionTtlDays",
          "pixelEnabled",
          "serverEventSecretHash",
          "postbackTokenHash",
          0::int AS "eventCount24h",
          0::int AS "previousEventCount24h",
          0::int AS "sessionCount24h",
          0::int AS "previousSessionCount24h",
          0::int AS "userCount24h",
          0::int AS "previousUserCount24h",
          '[]'::jsonb AS "eventMix24h",
          '[]'::jsonb AS "trafficTrend7d",
          NULL::timestamp AS "lastOccurredAt"
      )
      SELECT
        inserted_site.id AS "siteId",
        inserted_site.name,
        inserted_site."customDomain",
        inserted_site."endpointHost" AS "siteEndpointHost",
        inserted_site."pixelEnabled" AS "sitePixelEnabled",
        inserted_environments.id,
        inserted_environments."siteId" AS "environmentSiteId",
        inserted_environments.environment,
        inserted_environments."endpointHost",
        inserted_environments."attributionTtlDays",
        inserted_environments."pixelEnabled",
        inserted_environments."serverEventSecretHash",
        inserted_environments."postbackTokenHash",
        inserted_environments."eventCount24h",
        inserted_environments."previousEventCount24h",
        inserted_environments."sessionCount24h",
        inserted_environments."previousSessionCount24h",
        inserted_environments."userCount24h",
        inserted_environments."previousUserCount24h",
        inserted_environments."eventMix24h",
        inserted_environments."trafficTrend7d",
        inserted_environments."lastOccurredAt"
      FROM inserted_site
      JOIN inserted_environments ON inserted_environments."siteId" = inserted_site.id
      `,
    ])) as [unknown[], NewProjectEnvironmentRow[]];
    const siteRow = rows[0];
    if (!siteRow) return { success: false, error: 'Upgrade to add more projects.' };
    const environments = rows.map((environment) =>
      mapProjectEnvironment(
        {
          id: environment.id,
          siteId: environment.environmentSiteId,
          environment: environment.environment,
          endpointHost: environment.endpointHost,
          attributionTtlDays: environment.attributionTtlDays,
          pixelEnabled: environment.pixelEnabled,
          serverEventSecretHash: environment.serverEventSecretHash,
          postbackTokenHash: environment.postbackTokenHash,
          eventCount24h: environment.eventCount24h,
          previousEventCount24h: environment.previousEventCount24h,
          sessionCount24h: environment.sessionCount24h,
          previousSessionCount24h: environment.previousSessionCount24h,
          userCount24h: environment.userCount24h,
          previousUserCount24h: environment.previousUserCount24h,
          eventMix24h: environment.eventMix24h,
          trafficTrend7d: environment.trafficTrend7d,
          lastOccurredAt: environment.lastOccurredAt,
        },
        {
          recentEvents: [],
          persistedDiagnostics: null,
          webhookEndpoints: [],
        },
      ),
    );
    const productionEnvironment = environments.find((environment) => environment.environment === 'production') ?? environments[0];

    return {
      success: true,
      project: {
        ...productionEnvironment,
        name: siteRow.name,
        siteId: siteRow.siteId,
        customDomain: siteRow.customDomain,
        ownership: "owned",
        shares: [],
        environments,
      },
    };
  } catch (error) {
    console.error('Unable to create Sarge project', error);
    return {
      success: false,
      error: 'Project could not be created. The generated Sarge domain may already be in use for this account.',
    };
  }
};

export const getProject = (account: SargeAccount, projectId: string) =>
  account.projects.find((project) => project.siteId === projectId);

export const canAdministerAccount = (account: SargeAccount) => account.role === 'admin';

export const canManageProject = (project: SargeProject) =>
  project.ownership === 'owned' || project.shareRole === 'edit';

export const formatCount = (value: number) => new Intl.NumberFormat('en-US').format(value);

export const getAccountUsage = (account: SargeAccount) => ({
  projects: account.ownedProjects.length,
  eventsThisPeriod: account.currentPeriodEventCount,
  projectLimit: account.plan.limits.projects,
  eventLimit: account.plan.limits.eventsPerMonth,
});

export const canCreateProjectForPlan = (account: SargeAccount) => {
  const limit = account.plan.limits.projects;
  return limit === null || account.ownedProjects.length < limit;
};

export const isEventUsageOverLimit = (account: SargeAccount) => {
  const limit = account.plan.limits.eventsPerMonth;
  return limit !== null && account.currentPeriodEventCount >= limit;
};

export const shareProject = async (
  userId: string,
  databaseUrl: string | undefined,
  siteId: string,
  input: ShareProjectInput,
  emailOptions: ProjectInviteEmailOptions,
): Promise<ShareProjectResult> => {
  if (!databaseUrl) return { success: false, error: 'DATABASE_URL is not configured.' };

  const email = normalizeInviteEmail(input.email);
  const role = normalizeShareRole(input.role);
  if (!email) return { success: false, error: 'Invite email is required.' };
  if (!role) return { success: false, error: 'Choose view or edit access.' };

  try {
    const sql = neon(databaseUrl);
    const site = await getOwnedSiteById(sql, userId, siteId);
    if (!site) return { success: false, error: 'Project was not found in your workspace.' };

    const rows = (await sql`
      WITH owned_site AS (
        SELECT s.id, s.name, ${sql.unsafe(projectShareLimitSqlCase)} AS "shareLimit"
        FROM "Site" s
        JOIN "Workspace" w ON w.id = s."workspaceId"
        WHERE w."ownerUserId" = ${userId}
          AND s.id = ${site.id}
        FOR UPDATE OF s, w
      ),
      share_usage AS (
        SELECT
          COUNT(ps.id)::int AS "shareCount",
          MAX(ps.id) FILTER (WHERE ps.email = ${email}) AS "existingShareId"
        FROM "ProjectShare" ps
        WHERE ps."siteId" = ${site.id}
      ),
      allowed_site AS (
        SELECT owned_site.id
        FROM owned_site
        CROSS JOIN share_usage
        WHERE share_usage."existingShareId" IS NOT NULL
          OR owned_site."shareLimit" IS NULL
          OR share_usage."shareCount" < owned_site."shareLimit"
      )
      INSERT INTO "ProjectShare" (id, "siteId", email, role, "invitedByUserId")
      SELECT ${`share_${crypto.randomUUID()}`}, allowed_site.id, ${email}, ${role}, ${userId}
      FROM allowed_site
      WHERE true
      ON CONFLICT ("siteId", email) DO UPDATE
      SET role = EXCLUDED.role,
          "invitedByUserId" = EXCLUDED."invitedByUserId"
      RETURNING id, "siteId", email, role, "acceptedUserId", "createdAt", "acceptedAt"
    `) as ProjectShareRow[];
    const share = rows.at(0);
    if (!share) return { success: false, error: 'Project share limit reached. Upgrade to invite more people.' };

    const emailResult = await sendProjectInviteEmail({
      to: email,
      projectName: site.name,
      inviterLabel: 'A Sarge workspace admin',
      role,
      appUrl: emailOptions.appUrl,
      emailSender: emailOptions.emailSender,
      emailFrom: emailOptions.emailFrom,
    } satisfies ProjectInviteEmailInput);

    return {
      success: true,
      share: mapProjectShare(share),
      warning: emailResult.sent ? undefined : emailResult.warning,
    };
  } catch (error) {
    console.error('Unable to share Sarge project', error);
    return {
      success: false,
      error: 'Project invite could not be saved.',
    };
  }
};

export const updateProjectShare = async (
  userId: string,
  databaseUrl: string | undefined,
  shareId: string,
  role: ProjectShareRole,
  emailOptions?: ProjectInviteEmailOptions,
): Promise<UpdateProjectShareResult> => {
  if (!databaseUrl) return { success: false, error: 'DATABASE_URL is not configured.' };

  const normalizedRole = normalizeShareRole(role);
  if (!normalizedRole) return { success: false, error: 'Choose view or edit access.' };

  try {
    const sql = neon(databaseUrl);
    const rows = (await sql`
      UPDATE "ProjectShare" ps
      SET role = ${normalizedRole}
      FROM "Site" s
      JOIN "Workspace" w ON w.id = s."workspaceId"
      WHERE ps.id = ${shareId}
        AND ps."siteId" = s.id
        AND w."ownerUserId" = ${userId}
      RETURNING ps.id, ps."siteId", ps.email, ps.role, ps."acceptedUserId", ps."createdAt", ps."acceptedAt", s.name AS "projectName"
    `) as (ProjectShareRow & { projectName: string })[];
    const share = rows.at(0);
    if (!share) return { success: false, error: 'Project share was not found.' };

    if (emailOptions) {
      await sendProjectAccessNotificationEmail({
        to: share.email,
        projectName: share.projectName,
        role: normalizedRole,
        action: 'role-updated',
        appUrl: emailOptions.appUrl,
        emailSender: emailOptions.emailSender,
        emailFrom: emailOptions.emailFrom,
      });
    }

    return {
      success: true,
      share: mapProjectShare(share),
    };
  } catch (error) {
    console.error('Unable to update Sarge project share', error);
    return {
      success: false,
      error: 'Project share could not be updated.',
    };
  }
};

export const removeProjectShare = async (
  userId: string,
  databaseUrl: string | undefined,
  shareId: string,
  emailOptions?: ProjectInviteEmailOptions,
): Promise<RemoveProjectShareResult> => {
  if (!databaseUrl) return { success: false, error: 'DATABASE_URL is not configured.' };

  try {
    const sql = neon(databaseUrl);
    const rows = (await sql`
      DELETE FROM "ProjectShare" ps
      USING "Site" s
      JOIN "Workspace" w ON w.id = s."workspaceId"
      WHERE ps.id = ${shareId}
        AND ps."siteId" = s.id
        AND w."ownerUserId" = ${userId}
      RETURNING ps.id, ps.email, ps.role, s.name AS "projectName"
    `) as { id: string; email: string; role: string; projectName: string }[];
    const removedShare = rows.at(0);
    if (!removedShare) return { success: false, error: 'Project share was not found.' };

    if (emailOptions) {
      await sendProjectAccessNotificationEmail({
        to: removedShare.email,
        projectName: removedShare.projectName,
        action: 'access-removed',
        appUrl: emailOptions.appUrl,
        emailSender: emailOptions.emailSender,
        emailFrom: emailOptions.emailFrom,
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Unable to remove Sarge project share', error);
    return {
      success: false,
      error: 'Project share could not be removed.',
    };
  }
};

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
    const [, insertedRows] = (await sql.transaction((tx) => [
      tx`
        SELECT id
        FROM "Workspace"
        WHERE id = ${workspace.id}
          AND "ownerUserId" = ${userId}
        FOR UPDATE
      `,
      tx`
        WITH workspace_row AS (
        SELECT id, "planId"
        FROM "Workspace"
        WHERE id = ${workspace.id}
          AND "ownerUserId" = ${userId}
      ),
      limited_site_environment AS (
        SELECT se.id, se."siteId"
        FROM "SiteEnvironment" se
        JOIN "Site" s ON s.id = se."siteId"
        JOIN workspace_row w ON w.id = s."workspaceId"
        WHERE se.id = ${siteEnvironment.id}
          AND (
            ${tx.unsafe(webhookLimitSqlCase)} IS NULL
            OR (
              SELECT COUNT(*)::int
              FROM "WebhookEndpoint" wh
              JOIN "Site" webhook_site ON webhook_site.id = wh."siteId"
              WHERE webhook_site."workspaceId" = w.id
            ) < ${tx.unsafe(webhookLimitSqlCase)}
          )
      )
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
      SELECT
        ${crypto.randomUUID()},
        lse."siteId",
        lse.id,
        ${name},
        ${url},
        ${JSON.stringify(eventNames)},
        ${signingSecret},
        true
      FROM limited_site_environment lse
      RETURNING id, name, url, "eventNames", "isActive", "createdAt"
      `,
    ])) as [unknown[], Omit<WebhookEndpointRow, 'siteId' | 'siteEnvironmentId'>[]];
    const webhook = insertedRows.at(0);
    if (!webhook) return { success: false, error: 'Upgrade to add more webhooks.' };

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
      SELECT se.id, se."serverEventSecretHash", se."postbackTokenHash"
      FROM "SiteEnvironment" se
      JOIN "Site" s ON s.id = se."siteId"
      WHERE se.id = ${siteEnvironmentId}
        AND s."workspaceId" = ${workspace.id}
      LIMIT 1
    `) as { id: string; serverEventSecretHash: string | null; postbackTokenHash: string | null }[];
    if (!siteEnvironments.at(0)) return { success: false, error: 'Project environment was not found.' };

    const token = createCredentialToken(kind);
    const tokenHash = await sha256Hex(token);

    if (kind === 'server') {
      const [, rows] = (await sql.transaction((tx) => [
        tx`
          SELECT id
          FROM "Workspace"
          WHERE id = ${workspace.id}
            AND "ownerUserId" = ${userId}
          FOR UPDATE
        `,
        tx`
          WITH workspace_row AS (
          SELECT id, "planId"
          FROM "Workspace"
          WHERE id = ${workspace.id}
            AND "ownerUserId" = ${userId}
        ),
        target_environment AS (
          SELECT se.id, se."serverEventSecretHash"
          FROM "SiteEnvironment" se
          JOIN "Site" s ON s.id = se."siteId"
          JOIN workspace_row w ON w.id = s."workspaceId"
          WHERE se.id = ${siteEnvironmentId}
        )
        UPDATE "SiteEnvironment"
        SET "serverEventSecretHash" = ${tokenHash}
        FROM target_environment te, workspace_row w
        WHERE "SiteEnvironment".id = te.id
          AND (
            te."serverEventSecretHash" IS NOT NULL
            OR ${tx.unsafe(serverSecretLimitSqlCase)} IS NULL
            OR (
              SELECT COUNT(*)::int
              FROM "SiteEnvironment" existing_environment
              JOIN "Site" existing_site ON existing_site.id = existing_environment."siteId"
              WHERE existing_site."workspaceId" = w.id
                AND existing_environment."serverEventSecretHash" IS NOT NULL
            ) < ${tx.unsafe(serverSecretLimitSqlCase)}
          )
        RETURNING "SiteEnvironment".id
        `,
      ])) as [unknown[], { id: string }[]];
      if (!rows.at(0)) return { success: false, error: 'Upgrade to add more server event secrets.' };

      return {
        success: true,
        kind,
        token,
        endpoint: `https://${hostedEndpointHost}/v2/server/events`,
      };
    }

    const [, rows] = (await sql.transaction((tx) => [
      tx`
        SELECT id
        FROM "Workspace"
        WHERE id = ${workspace.id}
          AND "ownerUserId" = ${userId}
        FOR UPDATE
      `,
      tx`
        WITH workspace_row AS (
        SELECT id, "planId"
        FROM "Workspace"
        WHERE id = ${workspace.id}
          AND "ownerUserId" = ${userId}
      ),
      target_environment AS (
        SELECT se.id, se."postbackTokenHash"
        FROM "SiteEnvironment" se
        JOIN "Site" s ON s.id = se."siteId"
        JOIN workspace_row w ON w.id = s."workspaceId"
        WHERE se.id = ${siteEnvironmentId}
      )
      UPDATE "SiteEnvironment"
      SET "postbackTokenHash" = ${tokenHash}
      FROM target_environment te, workspace_row w
      WHERE "SiteEnvironment".id = te.id
        AND (
          te."postbackTokenHash" IS NOT NULL
          OR ${tx.unsafe(postbackTokenLimitSqlCase)} IS NULL
          OR (
            SELECT COUNT(*)::int
            FROM "SiteEnvironment" existing_environment
            JOIN "Site" existing_site ON existing_site.id = existing_environment."siteId"
            WHERE existing_site."workspaceId" = w.id
              AND existing_environment."postbackTokenHash" IS NOT NULL
          ) < ${tx.unsafe(postbackTokenLimitSqlCase)}
        )
      RETURNING "SiteEnvironment".id
      `,
    ])) as [unknown[], { id: string }[]];
    if (!rows.at(0)) return { success: false, error: 'Upgrade to add more postback tokens.' };

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

const getFallbackAccount = (role: AccountRole): SargeAccount => {
  const ownedProjects = [
    buildFallbackProject({
      id: 'site_demo',
      name: 'Demo Site',
      customDomain: 'sarge.demo-site.example.com',
      status: 'active',
      eventCount24h: 184,
      failedEvents24h: 2,
      lastEventAt: '2 minutes ago',
    }),
    buildFallbackProject({
      id: 'site_checkout',
      name: 'Checkout Lab',
      customDomain: 'sarge.checkout-lab.example.com',
      status: 'draft',
      eventCount24h: 0,
      failedEvents24h: 0,
      lastEventAt: 'No events yet',
    }),
  ];

  return {
    id: 'acct_demo',
    name: demoAccountName,
    slug: 'demo',
    role,
    planId: 'free',
    plan: getPlanDefinition('free'),
    billingStatus: 'active',
    currentPeriodEventCount: 184,
    termsAcceptedAt: new Date('2026-06-25T00:00:00.000Z'),
    termsAcceptedVersion: CURRENT_LEGAL_VERSION,
    privacyAcceptedVersion: CURRENT_PRIVACY_VERSION,
    workspaceLegalAcceptanceRequired: false,
    privacySettings: defaultSargePrivacySettings,
    workspaceSetupComplete: true,
    ownedProjects,
    sharedProjects: [],
    projects: ownedProjects,
    members,
  };
};

const getSetupAccount = (role: AccountRole): SargeAccount => ({
  id: 'setup',
  name: 'Set up workspace',
  slug: 'setup',
  role,
  planId: 'free',
  plan: getPlanDefinition('free'),
  billingStatus: 'active',
  currentPeriodEventCount: 0,
  termsAcceptedAt: null,
  termsAcceptedVersion: null,
  privacyAcceptedVersion: null,
  workspaceLegalAcceptanceRequired: false,
  privacySettings: defaultSargePrivacySettings,
  workspaceSetupComplete: false,
  ownedProjects: [],
  sharedProjects: [],
  projects: [],
  members: [],
});

const normalizeEventMix = (value: unknown, totalEvents: number): SargeEventMixItem[] => {
  let parsedValue = value;
  if (typeof value === 'string') {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsedValue)) return [];

  const total = Math.max(1, totalEvents);
  return parsedValue
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name : '';
      const count = Number(record.value ?? 0);
      const previousCount = Number(record.previousValue ?? 0);
      if (!name || !Number.isFinite(count) || count <= 0) return null;

      return {
        name,
        value: count,
        previousValue: Number.isFinite(previousCount) ? previousCount : 0,
        share: Math.round((count / total) * 100),
      } satisfies SargeEventMixItem;
    })
    .filter((item): item is SargeEventMixItem => Boolean(item));
};

const normalizeTrafficTrend = (value: unknown, fallbackEventCount24h = 0): SargeTrafficTrendPoint[] => {
  const fallback = buildFallbackTrafficTrend(fallbackEventCount24h);
  let parsedValue = value;
  if (typeof value === 'string') {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  if (!Array.isArray(parsedValue)) return fallback;

  const normalized = parsedValue
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const date = typeof record.date === 'string' ? record.date : '';
      const label = typeof record.label === 'string' ? record.label : '';
      const value = Number(record.value ?? 0);
      if (!date || !label || !Number.isFinite(value)) return null;

      return {
        date,
        label,
        value: Math.max(0, Math.round(value)),
      } satisfies SargeTrafficTrendPoint;
    })
    .filter((item): item is SargeTrafficTrendPoint => Boolean(item))
    .slice(-7);

  return normalized.length === 7 ? normalized : fallback;
};

const buildFallbackTrafficTrend = (eventCount24h: number): SargeTrafficTrendPoint[] => {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));

    return {
      date: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date),
      value: index === 6 ? Math.max(0, eventCount24h) : 0,
    };
  });
};

const mapEvent = (event: EventRow): SargeEvent => {
  const attribution = readSargeAttributionFromUrl(event.url);

  return {
    id: event.id,
    name: event.name,
    occurredAt: event.occurredAt.toISOString(),
    receivedAt: event.receivedAt.toISOString(),
    sessionId: event.sessionId,
    userId: event.userId,
    url: event.url ?? undefined,
    referrer: event.referrer ?? undefined,
    ref: event.ref ?? attribution.ref,
    affiliate: event.affiliate ?? attribution.affiliate,
    title: event.title ?? undefined,
    properties: (event.properties ?? {}) as Record<string, unknown>,
  };
};

const readSargeAttributionFromUrl = (value: string | null) => {
  if (!value) return {};

  try {
    const params = new URL(value).searchParams;
    return {
      ref: params.get("sarge_ref") ?? undefined,
      affiliate: params.get("sarge_aff") ?? undefined,
    };
  } catch {
    return {};
  }
};

const normalizeEventBoundary = (value: string | null | undefined) => {
  if (!value) return null;

  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

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

const mapProjectShare = (share: ProjectShareRow): ProjectShare => ({
  id: share.id,
  email: share.email,
  role: normalizeShareRole(share.role) ?? 'view',
  status: share.acceptedUserId || share.acceptedAt ? 'accepted' : 'pending',
  createdAt: share.createdAt.toISOString(),
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
  siteId: environment.siteId,
  environment: environment.environment,
  endpointHost: environment.endpointHost,
  pixelUrl: buildPixelUrl(environment.id),
  endpointHealthUrl: buildHealthUrl(),
  status: environment.pixelEnabled ? 'active' : 'paused',
  attributionTtlDays: environment.attributionTtlDays,
  serverEventSecretConfigured: Boolean(environment.serverEventSecretHash),
  postbackTokenConfigured: Boolean(environment.postbackTokenHash),
  eventCount24h: environment.eventCount24h ?? 0,
  previousEventCount24h: environment.previousEventCount24h ?? 0,
  sessionCount24h: environment.sessionCount24h ?? 0,
  previousSessionCount24h: environment.previousSessionCount24h ?? 0,
  userCount24h: environment.userCount24h ?? 0,
  previousUserCount24h: environment.previousUserCount24h ?? 0,
  failedEvents24h: 0,
  lastEventAt: formatRelativeTime(environment.lastOccurredAt),
  pixelVersion: '0.1.0',
  eventMix24h: normalizeEventMix(environment.eventMix24h, environment.eventCount24h ?? 0),
  trafficTrend7d: normalizeTrafficTrend(environment.trafficTrend7d, environment.eventCount24h ?? 0),
  recentEvents: data.recentEvents,
  eventHosts: summarizeEventHosts(data.recentEvents),
  diagnostics: environment.environment === 'production' ? data.persistedDiagnostics ?? analyzeProjectEvents(data.recentEvents) : [],
  diagnosticSummary: environment.environment === 'production' ? data.latestRun?.aiSummary ?? null : null,
  diagnosticRunAt: environment.environment === 'production' ? data.latestRun?.createdAt.toISOString() ?? null : null,
  webhookEndpoints: data.webhookEndpoints,
});

const buildFallbackProject = (input: {
  id: string;
  name: string;
  customDomain: string;
  status: ProjectStatus;
  eventCount24h: number;
  failedEvents24h: number;
  lastEventAt: string;
}): SargeProject => {
  const environments = projectEnvironmentOptions.map((environment) => {
    const id = `${input.id}_${environment}`;

    return {
      id,
      siteId: input.id,
      environment,
      endpointHost:
        environment === 'production'
          ? `${normalizeSlug(input.id)}.sargetrack.app`
          : `${normalizeSlug(input.id)}-${environment}.sargetrack.app`,
      pixelUrl: buildPixelUrl(id),
      endpointHealthUrl: buildHealthUrl(),
      status: input.status,
      attributionTtlDays: 28,
      serverEventSecretConfigured: false,
      postbackTokenConfigured: false,
      eventCount24h: environment === 'production' ? input.eventCount24h : 0,
      previousEventCount24h: 0,
      sessionCount24h: 0,
      previousSessionCount24h: 0,
      userCount24h: 0,
      previousUserCount24h: 0,
      failedEvents24h: environment === 'production' ? input.failedEvents24h : 0,
      lastEventAt: environment === 'production' ? input.lastEventAt : 'No events yet',
      pixelVersion: '0.1.0',
      eventMix24h: [],
      trafficTrend7d: buildFallbackTrafficTrend(environment === 'production' ? input.eventCount24h : 0),
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
    name: input.name,
    siteId: input.id,
    customDomain: input.customDomain,
    ownership: "owned",
    shares: [],
    eventCount24h: input.eventCount24h,
    failedEvents24h: input.failedEvents24h,
    lastEventAt: input.lastEventAt,
    environments,
    privacySettings: defaultSargePrivacySettings,
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

const buildScopedEndpointHost = (scopeId: string, workspaceId: string) => {
  const workspaceToken = normalizeSlug(workspaceId).slice(-8) || 'account';
  return `${normalizeSlug(scopeId)}-${workspaceToken}.sargetrack.app`;
};

const buildScopedEnvironmentHost = (scopeId: string, environment: ProjectEnvironment, workspaceId: string) => {
  const workspaceToken = normalizeSlug(workspaceId).slice(-8) || 'account';
  return `${normalizeSlug(scopeId)}-${environment}-${workspaceToken}.sargetrack.app`;
};

const normalizeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

export const normalizeSiteDomain = (value: string) => {
  const rawValue = value.trim().toLowerCase();
  if (!rawValue) return null;

  const hostValue = rawValue.includes('://') ? rawValue : `https://${rawValue}`;
  let hostname = '';

  try {
    hostname = new URL(hostValue).hostname.replace(/\.$/, '').replace(/^www\./, '');
  } catch {
    return null;
  }

  if (!hostname || hostname.endsWith('.sargetrack.app')) return null;

  const labels = hostname.split('.');
  if (labels.length < 2) return null;

  const isValidLabel = (label: string) =>
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label);

  if (!labels.every(isValidLabel)) return null;
  if (hostname.length > 253) return null;

  return hostname;
};

export const buildSargeTrackingDomain = (siteDomain: string) => `sarge.${siteDomain}`;

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

const createVerificationToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
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
  planId: PlanId;
  billingStatus: 'active' | 'past_due' | 'canceled';
  currentPeriodEventCount: number;
  termsAcceptedAt: Date | null;
  termsAcceptedVersion: string | null;
  privacyAcceptedVersion: string | null;
}

interface SiteSummaryRow {
  id: string;
  name: string;
  customDomain: string;
  endpointHost: string;
  pixelEnabled: boolean;
}

interface SharedSiteSummaryRow extends SiteSummaryRow {
  workspaceName: string;
}

interface SiteEnvironmentSummaryRow {
  id: string;
  siteId: string;
  environment: ProjectEnvironment;
  endpointHost: string;
  attributionTtlDays: number;
  pixelEnabled: boolean;
  serverEventSecretHash: string | null;
  postbackTokenHash: string | null;
  eventCount24h: number;
  previousEventCount24h: number;
  sessionCount24h: number;
  previousSessionCount24h: number;
  userCount24h: number;
  previousUserCount24h: number;
  eventMix24h: unknown;
  trafficTrend7d: unknown;
  lastOccurredAt: Date | null;
}

interface NewProjectEnvironmentRow {
  siteId: string;
  name: string;
  customDomain: string;
  siteEndpointHost: string;
  sitePixelEnabled: boolean;
  id: string;
  environmentSiteId: string;
  environment: ProjectEnvironment;
  endpointHost: string;
  attributionTtlDays: number;
  pixelEnabled: boolean;
  serverEventSecretHash: string | null;
  postbackTokenHash: string | null;
  eventCount24h: number;
  previousEventCount24h: number;
  sessionCount24h: number;
  previousSessionCount24h: number;
  userCount24h: number;
  previousUserCount24h: number;
  eventMix24h: unknown;
  trafficTrend7d: unknown;
  lastOccurredAt: Date | null;
}

interface PublicSiteEnvironmentRow {
  id: string;
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
  ref: string | null;
  affiliate: string | null;
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

interface ProjectShareRow {
  id: string;
  siteId: string;
  email: string;
  role: string;
  acceptedUserId: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
}

interface PrivacySettingsRow {
  piiRedactionEnabled: boolean;
  propertyPolicyMode: string;
  blockedPropertyKeys: unknown;
  allowedPropertyKeys: unknown;
  customRedactionKeys: unknown;
  customRedactionPatterns: unknown;
}

interface SitePrivacySettingsRow extends PrivacySettingsRow {
  siteId: string;
}

interface DeletionRequestRow {
  id: string;
  scope: string;
  status: string;
  targetWorkspaceId: string | null;
  targetSiteId: string | null;
  createdAt: Date;
}
