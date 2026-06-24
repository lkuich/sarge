import type { EventPayload } from "@sarge/core";

export interface IngestSite {
  id: string;
  siteId: string;
  environment: "production" | "staging" | "development";
  serverEventSecretHash?: string | null;
  postbackTokenHash?: string | null;
}

export interface EventRepository {
  findSiteById(siteId: string): Promise<IngestSite | null>;
  createEvent(event: EventPayload): Promise<void>;
}
