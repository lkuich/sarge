import { neon } from "@neondatabase/serverless";
import { buildPlanEventLimitSqlCase, UsageLimitExceededError, type EventPayload, type PrivacySettings } from "@sarge/core";
import type { EventStore, SiteRecord, StoredDiagnosticRun, StoredEvent } from "./types.js";

const planEventLimitSqlCase = buildPlanEventLimitSqlCase('w."planId"');

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

  async listActiveSitesForDiagnostics(limit: number): Promise<SiteRecord[]> {
    const rows = (await this.sql`
      SELECT id, "siteId", environment, "endpointHost", "attributionTtlDays", "pixelEnabled"
      FROM "SiteEnvironment"
      WHERE "pixelEnabled" = true
        AND environment = 'production'
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
    `) as unknown[];

    return rows as SiteRecord[];
  }

  async listRecentEventsForSite(siteId: string, since: Date, limit: number): Promise<StoredEvent[]> {
    const rows = (await this.sql`
      SELECT
        id,
        "siteEnvironmentId",
        name,
        "occurredAt",
        "sessionId",
        "userId",
        url,
        title,
        properties
      FROM "Event"
      WHERE "siteEnvironmentId" = ${siteId}
        AND "occurredAt" >= ${since.toISOString()}
      ORDER BY "occurredAt" DESC
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
}

interface SiteRecordRow {
  id: string;
  siteId: string;
  environment: "production" | "staging" | "development";
  endpointHost: string;
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

interface EventRow {
  id: string;
  siteEnvironmentId: string;
  name: string;
  occurredAt: Date;
  sessionId: string;
  userId: string;
  url: string | null;
  title: string | null;
  properties: unknown;
}

interface UsageInsertResult {
  siteCount: number;
  updatedCount: number;
  insertedCount: number;
}
