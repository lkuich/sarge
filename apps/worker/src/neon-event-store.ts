import { neon } from "@neondatabase/serverless";
import {
  buildPlanEventLimitSqlCase,
  buildPlanRetentionFilterSql,
  sha256Hex,
  UsageLimitExceededError,
  type EventPayload,
  type PrivacySettings
} from "@sarge/core";
import type {
  EventExportPage,
  EventExportQuery,
  EventStore,
  ExportedEvent,
  ReadApiToken,
  SiteRecord,
  StoredDiagnosticRun,
  StoredEvent
} from "./types.js";

const planEventLimitSqlCase = buildPlanEventLimitSqlCase('w."planId"');
const planRetentionFilterSql = buildPlanRetentionFilterSql('e."occurredAt"', 'w."planId"');
const configuredHostSql = (siteAlias: string) => `regexp_replace(lower(${siteAlias}."customDomain"), '^www\\.', '')`;
const capturedEventHostSql = (eventAlias: string) => (
  `NULLIF(regexp_replace(regexp_replace(coalesce(substring(lower(${eventAlias}.url) from '^[a-z][a-z0-9+.-]*://([^/?#]+)'), substring(lower(${eventAlias}.referrer) from '^[a-z][a-z0-9+.-]*://([^/?#]+)')), '^www\\.', ''), ':\\d+$', ''), '')`
);
const configuredHostEventSql = (eventAlias: string, siteAlias: string) => (
  `(${capturedEventHostSql(eventAlias)} IS NULL OR ${capturedEventHostSql(eventAlias)} = ${configuredHostSql(siteAlias)})`
);

export class NeonEventStore implements EventStore {
  private readonly sql: ReturnType<typeof neon>;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  async findSiteByHost(host: string): Promise<SiteRecord | null> {
    const rows = (await this.sql`
      SELECT
        se.id,
        se."siteId",
        se.environment,
        se."endpointHost",
        s."customDomain" AS "configuredHost",
        se."attributionTtlDays",
        se."pixelEnabled",
        se."serverEventSecretHash",
        se."postbackTokenHash",
        COALESCE(sps."piiRedactionEnabled", wps."piiRedactionEnabled", true) AS "piiRedactionEnabled",
        COALESCE(sps."propertyPolicyMode", wps."propertyPolicyMode", 'blocklist') AS "propertyPolicyMode",
        COALESCE(sps."blockedPropertyKeys", wps."blockedPropertyKeys", '[]'::jsonb) AS "blockedPropertyKeys",
        COALESCE(sps."allowedPropertyKeys", wps."allowedPropertyKeys", '[]'::jsonb) AS "allowedPropertyKeys",
        COALESCE(sps."customRedactionKeys", wps."customRedactionKeys", '[]'::jsonb) AS "customRedactionKeys",
        COALESCE(sps."customRedactionPatterns", wps."customRedactionPatterns", '[]'::jsonb) AS "customRedactionPatterns"
      FROM "SiteEnvironment" se
      JOIN "Site" s ON s.id = se."siteId"
      LEFT JOIN "WorkspacePrivacySettings" wps ON wps."workspaceId" = s."workspaceId"
      LEFT JOIN "SitePrivacySettings" sps ON sps."siteId" = s.id
      WHERE se."endpointHost" = ${host}
      LIMIT 1
    `) as unknown[];

    const row = rows.at(0) as
      | {
          id: string;
          siteId: string;
          environment: "production" | "staging" | "development";
          endpointHost: string;
          configuredHost: string | null;
          attributionTtlDays: number;
          pixelEnabled: boolean;
          serverEventSecretHash: string | null;
          postbackTokenHash: string | null;
          piiRedactionEnabled: boolean;
          propertyPolicyMode: string;
          blockedPropertyKeys: unknown;
          allowedPropertyKeys: unknown;
          customRedactionKeys: unknown;
          customRedactionPatterns: unknown;
        }
      | undefined;

    return row ? mapSiteRecord(row) : null;
  }

  async findSiteById(id: string): Promise<SiteRecord | null> {
    const rows = (await this.sql`
      SELECT
        se.id,
        se."siteId",
        se.environment,
        se."endpointHost",
        s."customDomain" AS "configuredHost",
        se."attributionTtlDays",
        se."pixelEnabled",
        se."serverEventSecretHash",
        se."postbackTokenHash",
        COALESCE(sps."piiRedactionEnabled", wps."piiRedactionEnabled", true) AS "piiRedactionEnabled",
        COALESCE(sps."propertyPolicyMode", wps."propertyPolicyMode", 'blocklist') AS "propertyPolicyMode",
        COALESCE(sps."blockedPropertyKeys", wps."blockedPropertyKeys", '[]'::jsonb) AS "blockedPropertyKeys",
        COALESCE(sps."allowedPropertyKeys", wps."allowedPropertyKeys", '[]'::jsonb) AS "allowedPropertyKeys",
        COALESCE(sps."customRedactionKeys", wps."customRedactionKeys", '[]'::jsonb) AS "customRedactionKeys",
        COALESCE(sps."customRedactionPatterns", wps."customRedactionPatterns", '[]'::jsonb) AS "customRedactionPatterns"
      FROM "SiteEnvironment" se
      JOIN "Site" s ON s.id = se."siteId"
      LEFT JOIN "WorkspacePrivacySettings" wps ON wps."workspaceId" = s."workspaceId"
      LEFT JOIN "SitePrivacySettings" sps ON sps."siteId" = s.id
      WHERE se.id = ${id}
        OR (se."siteId" = ${id} AND se.environment = 'production')
      LIMIT 1
    `) as unknown[];

    const row = rows.at(0) as
      | {
          id: string;
          siteId: string;
          environment: "production" | "staging" | "development";
          endpointHost: string;
          configuredHost: string | null;
          attributionTtlDays: number;
          pixelEnabled: boolean;
          serverEventSecretHash: string | null;
          postbackTokenHash: string | null;
          piiRedactionEnabled: boolean;
          propertyPolicyMode: string;
          blockedPropertyKeys: unknown;
          allowedPropertyKeys: unknown;
          customRedactionKeys: unknown;
          customRedactionPatterns: unknown;
        }
      | undefined;

    return row ? mapSiteRecord(row) : null;
  }

  async createEvent(event: EventPayload): Promise<void> {
    const site = await this.findSiteById(event.siteId);
    if (!site) throw new Error(`Unknown site environment: ${event.siteId}`);

    const rows = (await this.sql`
      WITH site_environment AS (
        SELECT se.id, se."siteId", s."workspaceId"
        FROM "SiteEnvironment" se
        JOIN "Site" s ON s.id = se."siteId"
        WHERE se.id = ${site.id}
        LIMIT 1
      ),
      updated_workspace AS (
        UPDATE "Workspace" w
        SET
          "currentPeriodStart" = CASE
            WHEN w."currentPeriodStart" + INTERVAL '1 month' <= NOW() THEN NOW()
            ELSE w."currentPeriodStart"
          END,
          "currentPeriodEventCount" = CASE
            WHEN w."currentPeriodStart" + INTERVAL '1 month' <= NOW() THEN 1
            ELSE w."currentPeriodEventCount" + 1
          END
        FROM site_environment se
        WHERE w.id = se."workspaceId"
          AND (
            ${this.sql.unsafe(planEventLimitSqlCase)} IS NULL
            OR CASE
              WHEN w."currentPeriodStart" + INTERVAL '1 month' <= NOW() THEN 0
              ELSE w."currentPeriodEventCount"
            END < ${this.sql.unsafe(planEventLimitSqlCase)}
          )
        RETURNING w.id
      ),
      inserted_event AS (
      INSERT INTO "Event" (
        "id",
        "siteId",
        "siteEnvironmentId",
        "source",
        "name",
        "occurredAt",
        "sessionId",
        "userId",
        "ref",
        "affiliate",
        "attributionExpiresAt",
        "url",
        "referrer",
        "title",
        "properties"
      )
        SELECT
        ${crypto.randomUUID()},
          se."siteId",
          se.id,
        ${event.source},
        ${event.name},
        ${new Date(event.occurredAt).toISOString()},
        ${event.sessionId},
        ${event.userId},
        ${event.attribution?.ref ?? null},
        ${event.attribution?.aff ?? null},
        ${event.attribution?.expiresAt ? new Date(event.attribution.expiresAt).toISOString() : null},
        ${event.context?.url ?? null},
        ${event.context?.referrer ?? null},
        ${event.context?.title ?? null},
        ${JSON.stringify(event.properties ?? {})}::jsonb
        FROM site_environment se
        JOIN updated_workspace uw ON true
        RETURNING id
      )
      SELECT
        (SELECT COUNT(*)::int FROM site_environment) AS "siteCount",
        (SELECT COUNT(*)::int FROM updated_workspace) AS "updatedCount",
        (SELECT COUNT(*)::int FROM inserted_event) AS "insertedCount"
    `) as UsageInsertResult[];
    const usageInsert = rows.at(0);
    if (!usageInsert || usageInsert.siteCount === 0) {
      throw new Error(`Unknown site environment: ${site.id}`);
    }
    if (usageInsert.updatedCount === 0 || usageInsert.insertedCount === 0) {
      throw new UsageLimitExceededError();
    }
  }

  async findReadToken(token: string): Promise<ReadApiToken | null> {
    const tokenHash = await sha256Hex(token);
    const rows = (await this.sql`
      SELECT
        id,
        "siteEnvironmentId"
      FROM "ApiToken"
      WHERE "tokenHash" = ${tokenHash}
        AND scope = 'events:read'
        AND "revokedAt" IS NULL
      LIMIT 1
    `) as unknown[];

    const row = rows.at(0) as ReadApiToken | undefined;
    return row ?? null;
  }

  async listEventsForExport(siteEnvironmentId: string, query: EventExportQuery): Promise<EventExportPage> {
    const params: unknown[] = [siteEnvironmentId];
    const filters = [
      'e."siteEnvironmentId" = $1',
      planRetentionFilterSql
    ];

    if (query.start) {
      params.push(new Date(query.start).toISOString());
      filters.push(`e."occurredAt" >= $${params.length}::timestamptz`);
    }
    if (query.end) {
      params.push(new Date(query.end).toISOString());
      filters.push(`e."occurredAt" <= $${params.length}::timestamptz`);
    }
    if (query.name) {
      params.push(query.name);
      filters.push(`e.name = $${params.length}`);
    }
    if (query.source) {
      params.push(query.source);
      filters.push(`e.source = $${params.length}`);
    }
    if (query.sessionId) {
      params.push(query.sessionId);
      filters.push(`e."sessionId" = $${params.length}`);
    }
    if (query.userId) {
      params.push(query.userId);
      filters.push(`e."userId" = $${params.length}`);
    }
    if (query.cursor) {
      params.push(new Date(query.cursor.occurredAt).toISOString());
      const occurredAtParam = params.length;
      params.push(query.cursor.id);
      const idParam = params.length;
      filters.push(`(
        e."occurredAt" < $${occurredAtParam}::timestamptz
        OR (e."occurredAt" = $${occurredAtParam}::timestamptz AND e.id < $${idParam})
      )`);
    }

    params.push(query.limit + 1);
    const limitParam = params.length;
    const rows = (await this.sql.query(
      `
        SELECT
          e.id,
          e."siteId",
          e."siteEnvironmentId",
          e.source,
          e.name,
          e."occurredAt",
          e."receivedAt",
          e."sessionId",
          e."userId",
          e.ref,
          e.affiliate,
          e."attributionExpiresAt",
          e.url,
          e.referrer,
          e.title,
          e.properties
        FROM "Event" e
        JOIN "SiteEnvironment" se ON se.id = e."siteEnvironmentId"
        JOIN "Site" s ON s.id = se."siteId"
        JOIN "Workspace" w ON w.id = s."workspaceId"
        WHERE ${filters.join("\n          AND ")}
        ORDER BY e."occurredAt" DESC, e.id DESC
        LIMIT $${limitParam}
      `,
      params
    )) as ExportedEventRow[];

    const pageRows = rows.slice(0, query.limit);
    const events = pageRows.map(mapExportedEvent);
    const lastEvent = events.at(-1);

    return {
      events,
      nextCursor: rows.length > query.limit && lastEvent
        ? {
            occurredAt: lastEvent.occurredAt,
            id: lastEvent.id
          }
        : null
    };
  }

  async listActiveSitesForDiagnostics(limit: number): Promise<SiteRecord[]> {
    const rows = (await this.sql`
      SELECT
        se.id,
        se."siteId",
        se.environment,
        se."endpointHost",
        s."customDomain" AS "configuredHost",
        se."attributionTtlDays",
        se."pixelEnabled"
      FROM "SiteEnvironment" se
      JOIN "Site" s ON s.id = se."siteId"
      WHERE se."pixelEnabled" = true
        AND se.environment = 'production'
      ORDER BY se."createdAt" ASC
      LIMIT ${limit}
    `) as unknown[];

    return rows as SiteRecord[];
  }

  async listRecentEventsForSite(siteId: string, since: Date, limit: number): Promise<StoredEvent[]> {
    const rows = (await this.sql`
      SELECT
        e.id,
        e."siteEnvironmentId",
        e.name,
        e."occurredAt",
        e."sessionId",
        e."userId",
        e.url,
        e.referrer,
        e.title,
        e.properties
      FROM "Event" e
      JOIN "Site" s ON s.id = e."siteId"
      WHERE e."siteEnvironmentId" = ${siteId}
        AND e."occurredAt" >= ${since.toISOString()}
        AND ${this.sql.unsafe(configuredHostEventSql('e', 's'))}
      ORDER BY e."occurredAt" DESC
      LIMIT ${limit}
    `) as EventRow[];

    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteEnvironmentId,
      name: row.name,
      occurredAt: row.occurredAt.toISOString(),
      sessionId: row.sessionId,
      userId: row.userId,
      url: row.url,
      referrer: row.referrer,
      title: row.title,
      properties: (row.properties ?? {}) as Record<string, unknown>
    }));
  }

  async saveDiagnosticRun(run: StoredDiagnosticRun): Promise<void> {
    await this.sql`
      INSERT INTO "DiagnosticRun" (
        id,
        "siteId",
        "siteEnvironmentId",
        status,
        "eventWindowStart",
        "eventWindowEnd",
        "findingCount",
        "aiSummary",
        "startedAt",
        "completedAt"
      )
      VALUES (
        ${run.id},
        ${(await this.findSiteById(run.siteId))?.siteId ?? run.siteId},
        ${run.siteId},
        ${run.status},
        ${run.eventWindowStart},
        ${run.eventWindowEnd},
        ${run.findingCount},
        ${run.aiSummary},
        ${run.startedAt},
        ${run.completedAt}
      )
    `;

    for (const finding of run.findings) {
      await this.sql`
        INSERT INTO "DiagnosticFinding" (
          id,
          "runId",
          "siteId",
          "siteEnvironmentId",
          "ruleId",
          severity,
          title,
          summary,
          evidence,
          recommendation,
          "agentPrompt"
        )
        VALUES (
          ${crypto.randomUUID()},
          ${run.id},
          ${(await this.findSiteById(run.siteId))?.siteId ?? run.siteId},
          ${run.siteId},
          ${finding.ruleId},
          ${finding.severity},
          ${finding.title},
          ${finding.summary},
          ${JSON.stringify(finding.evidence)},
          ${finding.recommendation},
          ${finding.agentPrompt}
        )
      `;
    }
  }

  async deleteDiagnosticRunsForSite(siteEnvironmentId: string): Promise<void> {
    await this.sql`DELETE FROM "DiagnosticFinding" WHERE "siteEnvironmentId" = ${siteEnvironmentId}`;
    await this.sql`DELETE FROM "DiagnosticRun" WHERE "siteEnvironmentId" = ${siteEnvironmentId}`;
  }
}

interface SiteRecordRow {
  id: string;
  siteId: string;
  environment: "production" | "staging" | "development";
  endpointHost: string;
  configuredHost?: string | null;
  attributionTtlDays: number;
  pixelEnabled: boolean;
  serverEventSecretHash?: string | null;
  postbackTokenHash?: string | null;
  piiRedactionEnabled: boolean;
  propertyPolicyMode: string;
  blockedPropertyKeys?: unknown;
  allowedPropertyKeys?: unknown;
  customRedactionKeys?: unknown;
  customRedactionPatterns?: unknown;
}

const mapSiteRecord = (row: SiteRecordRow): SiteRecord => ({
  id: row.id,
  siteId: row.siteId,
  environment: row.environment,
  endpointHost: row.endpointHost,
  configuredHost: row.configuredHost,
  attributionTtlDays: row.attributionTtlDays,
  pixelEnabled: row.pixelEnabled,
  serverEventSecretHash: row.serverEventSecretHash,
  postbackTokenHash: row.postbackTokenHash,
  privacySettings: {
    piiRedactionEnabled: row.piiRedactionEnabled,
    propertyPolicyMode: row.propertyPolicyMode === "allowlist" ? "allowlist" : "blocklist",
    blockedPropertyKeys: readStringArray(row.blockedPropertyKeys),
    allowedPropertyKeys: readStringArray(row.allowedPropertyKeys),
    customRedactionKeys: readStringArray(row.customRedactionKeys),
    customRedactionPatterns: readStringArray(row.customRedactionPatterns)
  }
});

const readStringArray = (value: unknown): string[] => {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
};

const mapExportedEvent = (event: ExportedEventRow): ExportedEvent => ({
  id: event.id,
  siteId: event.siteId,
  siteEnvironmentId: event.siteEnvironmentId,
  source: event.source,
  name: event.name,
  occurredAt: event.occurredAt.toISOString(),
  receivedAt: event.receivedAt.toISOString(),
  sessionId: event.sessionId,
  userId: event.userId,
  ref: event.ref,
  affiliate: event.affiliate,
  attributionExpiresAt: event.attributionExpiresAt?.toISOString() ?? null,
  url: event.url,
  referrer: event.referrer,
  title: event.title,
  properties: normalizeProperties(event.properties)
});

const normalizeProperties = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
};

interface EventRow {
  id: string;
  siteEnvironmentId: string;
  name: string;
  occurredAt: Date;
  sessionId: string;
  userId: string;
  url: string | null;
  referrer: string | null;
  title: string | null;
  properties: unknown;
}

interface ExportedEventRow {
  id: string;
  siteId: string;
  siteEnvironmentId: string;
  source: string;
  name: string;
  occurredAt: Date;
  receivedAt: Date;
  sessionId: string;
  userId: string;
  ref: string | null;
  affiliate: string | null;
  attributionExpiresAt: Date | null;
  url: string | null;
  referrer: string | null;
  title: string | null;
  properties: unknown;
}

interface UsageInsertResult {
  siteCount: number;
  updatedCount: number;
  insertedCount: number;
}
