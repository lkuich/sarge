import { neon } from "@neondatabase/serverless";
import type { EventPayload } from "@sarge/core";
import type { EventStore, SiteRecord, StoredDiagnosticRun, StoredEvent } from "./types.js";

export class NeonEventStore implements EventStore {
  private readonly sql: ReturnType<typeof neon>;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  async findSiteByHost(host: string): Promise<SiteRecord | null> {
    const rows = (await this.sql`
      SELECT id, "endpointHost", "attributionTtlDays", "pixelEnabled"
      FROM "Site"
      WHERE "endpointHost" = ${host}
      LIMIT 1
    `) as unknown[];

    const row = rows.at(0) as
      | {
          id: string;
          endpointHost: string;
          attributionTtlDays: number;
          pixelEnabled: boolean;
        }
      | undefined;

    return row ?? null;
  }

  async findSiteById(id: string): Promise<SiteRecord | null> {
    const rows = (await this.sql`
      SELECT id, "endpointHost", "attributionTtlDays", "pixelEnabled"
      FROM "Site"
      WHERE id = ${id}
      LIMIT 1
    `) as unknown[];

    const row = rows.at(0) as
      | {
          id: string;
          endpointHost: string;
          attributionTtlDays: number;
          pixelEnabled: boolean;
        }
      | undefined;

    return row ?? null;
  }

  async createEvent(event: EventPayload): Promise<void> {
    await this.sql`
      INSERT INTO "Event" (
        "id",
        "siteId",
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
      VALUES (
        ${crypto.randomUUID()},
        ${event.siteId},
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
        ${JSON.stringify(event.properties ?? {})}
      )
    `;
  }

  async listActiveSitesForDiagnostics(limit: number): Promise<SiteRecord[]> {
    const rows = (await this.sql`
      SELECT id, "endpointHost", "attributionTtlDays", "pixelEnabled"
      FROM "Site"
      WHERE "pixelEnabled" = true
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
    `) as unknown[];

    return rows as SiteRecord[];
  }

  async listRecentEventsForSite(siteId: string, since: Date, limit: number): Promise<StoredEvent[]> {
    const rows = (await this.sql`
      SELECT
        id,
        "siteId",
        name,
        "occurredAt",
        "sessionId",
        "userId",
        url,
        title,
        properties
      FROM "Event"
      WHERE "siteId" = ${siteId}
        AND "occurredAt" >= ${since.toISOString()}
      ORDER BY "occurredAt" DESC
      LIMIT ${limit}
    `) as EventRow[];

    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
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

interface EventRow {
  id: string;
  siteId: string;
  name: string;
  occurredAt: Date;
  sessionId: string;
  userId: string;
  url: string | null;
  title: string | null;
  properties: unknown;
}
