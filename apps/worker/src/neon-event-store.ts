import { neon } from "@neondatabase/serverless";
import type { EventPayload } from "@sarge/core";
import type { EventStore, SiteRecord } from "./types.js";

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
}
