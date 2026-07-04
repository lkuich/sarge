import type { EventPayload, EventSource, PrivacySettings } from "@sarge/core";

export interface IngestSite {
  id: string;
  siteId: string;
  environment: "production" | "staging" | "development";
  serverEventSecretHash?: string | null;
  postbackTokenHash?: string | null;
  privacySettings?: PrivacySettings;
}

export interface EventRepository {
  findSiteById(siteId: string): Promise<IngestSite | null>;
  createEvent(event: EventPayload): Promise<void>;
  findReadToken(token: string): Promise<ReadApiToken | null>;
  listEventsForExport(siteEnvironmentId: string, query: EventExportQuery): Promise<EventExportPage>;
}

export interface ReadApiToken {
  id: string;
  siteEnvironmentId: string;
}

export interface EventExportCursor {
  occurredAt: string;
  id: string;
}

export interface EventExportQuery {
  start?: string;
  end?: string;
  name?: string;
  source?: EventSource;
  sessionId?: string;
  userId?: string;
  limit: number;
  cursor?: EventExportCursor;
}

export interface EventExportPage {
  events: ExportedEvent[];
  nextCursor?: EventExportCursor | null;
}

export interface ExportedEvent {
  id: string;
  siteId: string;
  siteEnvironmentId: string;
  source: string;
  name: string;
  occurredAt: string;
  receivedAt: string;
  sessionId: string;
  userId: string;
  ref: string | null;
  affiliate: string | null;
  attributionExpiresAt: string | null;
  url: string | null;
  referrer: string | null;
  title: string | null;
  properties: Record<string, unknown>;
}
