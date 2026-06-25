import { buildPlanEventLimitSqlCase, UsageLimitExceededError, type EventPayload, type PrivacySettings } from "@sarge/core";
import { Prisma } from "@prisma/client";
import type { EventRepository, IngestSite } from "./event-repository.js";
import { prisma } from "./prisma.js";

const planEventLimitSqlCase = Prisma.raw(buildPlanEventLimitSqlCase('w."planId"'));

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
}

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
