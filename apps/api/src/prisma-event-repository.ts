import type { Prisma } from "@prisma/client";
import type { EventPayload } from "@sarge/core";
import type { EventRepository, IngestSite } from "./event-repository.js";
import { prisma } from "./prisma.js";

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
        postbackTokenHash: true
      }
    });

    if (!site) return null;

    return {
      ...site,
      environment: site.environment as IngestSite["environment"]
    };
  }

  async createEvent(event: EventPayload): Promise<void> {
    const site = await this.findSiteById(event.siteId);
    if (!site) throw new Error(`Unknown site environment: ${event.siteId}`);

    await prisma.event.create({
      data: {
        siteId: site.siteId,
        siteEnvironmentId: site.id,
        source: event.source,
        name: event.name,
        occurredAt: new Date(event.occurredAt),
        sessionId: event.sessionId,
        userId: event.userId,
        ref: event.attribution?.ref,
        affiliate: event.attribution?.aff,
        attributionExpiresAt: event.attribution?.expiresAt
          ? new Date(event.attribution.expiresAt)
          : undefined,
        url: event.context?.url,
        referrer: event.context?.referrer,
        title: event.context?.title,
        properties: (event.properties ?? {}) as Prisma.InputJsonValue
      }
    });
  }
}
