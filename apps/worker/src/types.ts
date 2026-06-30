import type { DiagnosticFinding, DiagnosticSeverity, EventPayload, PrivacySettings } from "@sarge/core";

export interface AiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

export interface WorkerEnv {
  DATABASE_URL: string;
  SARGE_BASE_DOMAIN?: string;
  DEFAULT_ATTRIBUTION_TTL_DAYS?: string;
  DIAGNOSTIC_EVENT_LOOKBACK_MINUTES?: string;
  DIAGNOSTIC_EVENT_LIMIT_PER_SITE?: string;
  PAGE_HEALTH_URL_LIMIT?: string;
  PAGE_HEALTH_RUN_URL_LIMIT?: string;
  PAGE_HEALTH_TIMEOUT_MS?: string;
  AI_SUMMARY_MODEL?: string;
  AI?: AiBinding;
}

export interface SiteRecord {
  id: string;
  siteId: string;
  environment: "production" | "staging" | "development";
  endpointHost: string;
  configuredHost?: string | null;
  attributionTtlDays: number;
  pixelEnabled: boolean;
  serverEventSecretHash?: string | null;
  postbackTokenHash?: string | null;
  privacySettings?: PrivacySettings;
}

export interface EventStore {
  findSiteByHost(host: string): Promise<SiteRecord | null>;
  findSiteById(id: string): Promise<SiteRecord | null>;
  createEvent(event: EventPayload): Promise<void>;
  listActiveSitesForDiagnostics(limit: number): Promise<SiteRecord[]>;
  listRecentEventsForSite(siteId: string, since: Date, limit: number): Promise<StoredEvent[]>;
  deleteDiagnosticRunsForSite(siteId: string): Promise<void>;
  saveDiagnosticRun(run: StoredDiagnosticRun): Promise<void>;
}

export interface StoredEvent {
  id: string;
  siteId: string;
  name: string;
  occurredAt: string;
  sessionId: string;
  userId: string;
  properties: Record<string, unknown>;
  url?: string | null;
  referrer?: string | null;
  title?: string | null;
}

export interface StoredDiagnosticFinding extends DiagnosticFinding {
  ruleId: string;
  severity: DiagnosticSeverity;
}

export interface StoredDiagnosticRun {
  id: string;
  siteId: string;
  status: "completed" | "failed";
  eventWindowStart: string;
  eventWindowEnd: string;
  findingCount: number;
  aiSummary: string | null;
  findings: StoredDiagnosticFinding[];
  startedAt: string;
  completedAt: string;
}
