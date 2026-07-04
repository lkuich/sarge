import {
  buildPlanEventLimitSqlCase,
  buildPlanRetentionFilterSql,
  sha256Hex,
  UsageLimitExceededError,
  type EventPayload,
  type PrivacySettings
} from "@sarge/core";
import { Prisma } from "@prisma/client";
import type { EventExportPage, EventExportQuery, EventRepository, ExportedEvent, IngestSite, ReadApiToken } from "./event-repository.js";
import { prisma } from "./prisma.js";

const planEventLimitSqlCase = Prisma.raw(buildPlanEventLimitSqlCase('w."planId"'));
const planRetentionFilterSql = Prisma.raw(buildPlanRetentionFilterSql('e."occurredAt"', 'w."planId"'));

export class PrismaEventRepository implements EventRepository {
  async findSiteById(siteId: string): Promise<IngestSite | null> {
    const site = await prisma.siteEnvironment.findFirst({
      where: {
        OR: [
          { id: siteId },
          {
            siteId,
            environment: "production"
          }
        ]
      },
      select: {
        id: true,
        siteId: true,
        environment: true,
        serverEventSecretHash: true,
        postbackTokenHash: true,
        site: {
          select: {
            privacySettings: true,
            workspace: {
              select: {
                privacySettings: true
              }
            }
          }
        }
      }
    });

    if (!site) return null;

    return {
      id: site.id,
      siteId: site.siteId,
      environment: site.environment as IngestSite["environment"],
      serverEventSecretHash: site.serverEventSecretHash,
      postbackTokenHash: site.postbackTokenHash,
      privacySettings: resolvePrivacySettings(site.site.workspace.privacySettings, site.site.privacySettings)
    };
  }

  async createEvent(event: EventPayload): Promise<void> {
    const result = await prisma.$queryRaw<UsageInsertResult[]>`
      WITH site_environment AS (
        SELECT se.id, se."siteId", s."workspaceId"
        FROM "SiteEnvironment" se
        JOIN "Site" s ON s.id = se."siteId"
        WHERE se.id = ${event.siteId}
          OR (se."siteId" = ${event.siteId} AND se.environment = 'production')
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
            ${planEventLimitSqlCase} IS NULL
            OR CASE
              WHEN w."currentPeriodStart" + INTERVAL '1 month' <= NOW() THEN 0
              ELSE w."currentPeriodEventCount"
            END < ${planEventLimitSqlCase}
          )
        RETURNING w.id
      ),
      inserted_event AS (
        INSERT INTO "Event" (
          id,
          "siteId",
          "siteEnvironmentId",
          source,
          name,
          "occurredAt",
          "sessionId",
          "userId",
          ref,
          affiliate,
          "attributionExpiresAt",
          url,
          referrer,
          title,
          properties
        )
        SELECT
          ${crypto.randomUUID()},
          se."siteId",
          se.id,
          ${event.source},
          ${event.name},
          ${new Date(event.occurredAt)},
          ${event.sessionId},
          ${event.userId},
          ${event.attribution?.ref ?? null},
          ${event.attribution?.aff ?? null},
          ${event.attribution?.expiresAt ? new Date(event.attribution.expiresAt) : null},
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
    `;
    const usageInsert = result.at(0);
    if (!usageInsert || usageInsert.siteCount === 0) {
      throw new Error(`Unknown site environment: ${event.siteId}`);
    }
    if (usageInsert.updatedCount === 0 || usageInsert.insertedCount === 0) {
      throw new UsageLimitExceededError();
    }
  }

  async findReadToken(token: string): Promise<ReadApiToken | null> {
    const tokenHash = await sha256Hex(token);
    const apiToken = await prisma.apiToken.findFirst({
      where: {
        tokenHash,
        scope: "events:read",
        revokedAt: null
      },
      select: {
        id: true,
        siteEnvironmentId: true
      }
    });

    return apiToken;
  }

  async listEventsForExport(siteEnvironmentId: string, query: EventExportQuery): Promise<EventExportPage> {
    const filters: Prisma.Sql[] = [
      Prisma.sql`e."siteEnvironmentId" = ${siteEnvironmentId}`,
      planRetentionFilterSql
    ];

    if (query.start) filters.push(Prisma.sql`e."occurredAt" >= ${new Date(query.start)}`);
    if (query.end) filters.push(Prisma.sql`e."occurredAt" <= ${new Date(query.end)}`);
    if (query.name) filters.push(Prisma.sql`e.name = ${query.name}`);
    if (query.source) filters.push(Prisma.sql`e.source = ${query.source}`);
    if (query.sessionId) filters.push(Prisma.sql`e."sessionId" = ${query.sessionId}`);
    if (query.userId) filters.push(Prisma.sql`e."userId" = ${query.userId}`);
    if (query.cursor) {
      filters.push(Prisma.sql`(
        e."occurredAt" < ${new Date(query.cursor.occurredAt)}
        OR (e."occurredAt" = ${new Date(query.cursor.occurredAt)} AND e.id < ${query.cursor.id})
      )`);
    }

    const rows = await prisma.$queryRaw<ExportedEventRow[]>`
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
      WHERE ${Prisma.join(filters, " AND ")}
      ORDER BY e."occurredAt" DESC, e.id DESC
      LIMIT ${query.limit + 1}
    `;
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
}

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

const resolvePrivacySettings = (
  workspaceSettings: PrivacySettingsRow | null,
  siteSettings: Partial<PrivacySettingsRow> | null
): PrivacySettings => ({
  piiRedactionEnabled: siteSettings?.piiRedactionEnabled ?? workspaceSettings?.piiRedactionEnabled ?? true,
  propertyPolicyMode: resolvePropertyPolicyMode(siteSettings?.propertyPolicyMode ?? workspaceSettings?.propertyPolicyMode),
  blockedPropertyKeys: readStringArray(siteSettings?.blockedPropertyKeys ?? workspaceSettings?.blockedPropertyKeys),
  allowedPropertyKeys: readStringArray(siteSettings?.allowedPropertyKeys ?? workspaceSettings?.allowedPropertyKeys),
  customRedactionKeys: readStringArray(siteSettings?.customRedactionKeys ?? workspaceSettings?.customRedactionKeys),
  customRedactionPatterns: readStringArray(siteSettings?.customRedactionPatterns ?? workspaceSettings?.customRedactionPatterns)
});

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const resolvePropertyPolicyMode = (value: string | null | undefined): PrivacySettings["propertyPolicyMode"] =>
  value === "allowlist" ? "allowlist" : "blocklist";

interface PrivacySettingsRow {
  piiRedactionEnabled: boolean | null;
  propertyPolicyMode: string | null;
  blockedPropertyKeys: unknown;
  allowedPropertyKeys: unknown;
  customRedactionKeys: unknown;
  customRedactionPatterns: unknown;
}

interface UsageInsertResult {
  siteCount: number;
  updatedCount: number;
  insertedCount: number;
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
