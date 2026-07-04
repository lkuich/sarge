import type { DiagnosticFinding, DiagnosticSeverity, EventPayload, EventSource, PrivacySettings } from "@sarge/core";

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
  findReadToken(token: string): Promise<ReadApiToken | null>;
  listEventsForExport(siteEnvironmentId: string, query: EventExportQuery): Promise<EventExportPage>;
  listActiveSitesForDiagnostics(limit: number): Promise<SiteRecord[]>;
  listRecentEventsForSite(siteId: string, since: Date, limit: number): Promise<StoredEvent[]>;
  deleteDiagnosticRunsForSite(siteId: string): Promise<void>;
  saveDiagnosticRun(run: StoredDiagnosticRun): Promise<void>;
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
