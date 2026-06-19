import type { Prisma } from "@prisma/client";
import type { EventPayload } from "@sarge/core";
import type { EventRepository } from "./event-repository.js";
import { prisma } from "./prisma.js";

export class PrismaEventRepository implements EventRepository {
  async createEvent(event: EventPayload): Promise<void> {
    await prisma.event.create({
      data: {
        siteId: event.siteId,
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
