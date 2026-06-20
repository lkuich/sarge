import type { EventPayload } from "@sarge/core";

export interface WorkerEnv {
  DATABASE_URL: string;
  SARGE_BASE_DOMAIN?: string;
  DEFAULT_ATTRIBUTION_TTL_DAYS?: string;
}

export interface SiteRecord {
  id: string;
  endpointHost: string;
  attributionTtlDays: number;
  pixelEnabled: boolean;
}

export interface EventStore {
  findSiteByHost(host: string): Promise<SiteRecord | null>;
  findSiteById(id: string): Promise<SiteRecord | null>;
  createEvent(event: EventPayload): Promise<void>;
}
