import { analyzeEvents } from "@sarge/core";
import type { DiagnosticEvent } from "@sarge/core";
import type {
  AiBinding,
  EventStore,
  SiteRecord,
  StoredDiagnosticFinding,
  StoredDiagnosticRun,
  StoredEvent,
  WorkerEnv
} from "./types.js";

const DEFAULT_LOOKBACK_MINUTES = 60;
const DEFAULT_EVENT_LIMIT = 200;
const DEFAULT_SITE_LIMIT = 50;
const DEFAULT_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export const runScheduledDiagnostics = async (
  store: EventStore,
  env: WorkerEnv,
  scheduledTime: number
) => {
  const eventWindowEnd = new Date(scheduledTime);
  const lookbackMinutes = readPositiveInteger(
    env.DIAGNOSTIC_EVENT_LOOKBACK_MINUTES,
    DEFAULT_LOOKBACK_MINUTES
  );
  const eventLimit = readPositiveInteger(
    env.DIAGNOSTIC_EVENT_LIMIT_PER_SITE,
    DEFAULT_EVENT_LIMIT
  );
  const eventWindowStart = new Date(eventWindowEnd.getTime() - lookbackMinutes * 60_000);
  const sites = await store.listActiveSitesForDiagnostics(DEFAULT_SITE_LIMIT);

  for (const site of sites) {
    await runSiteDiagnostics(store, env, site, eventWindowStart, eventWindowEnd, eventLimit);
  }
};

const runSiteDiagnostics = async (
  store: EventStore,
  env: WorkerEnv,
  site: SiteRecord,
  eventWindowStart: Date,
  eventWindowEnd: Date,
  eventLimit: number
) => {
  const startedAt = new Date();
  const events = await store.listRecentEventsForSite(site.id, eventWindowStart, eventLimit);
  const findings = events.length > 0 ? analyzeEvents(events.map(toDiagnosticEvent)).map(toStoredFinding) : [];
  const aiSummary = findings.length > 0 ? await summarizeFindings(env.AI, env.AI_SUMMARY_MODEL, site, findings) : null;
  const completedAt = new Date();

  const run: StoredDiagnosticRun = {
    id: crypto.randomUUID(),
    siteId: site.id,
    status: "completed",
    eventWindowStart: eventWindowStart.toISOString(),
    eventWindowEnd: eventWindowEnd.toISOString(),
    findingCount: findings.length,
    aiSummary,
    findings,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString()
  };

  await store.saveDiagnosticRun(run);
};

const summarizeFindings = async (
  ai: AiBinding | undefined,
  model: string | undefined,
  site: SiteRecord,
  findings: StoredDiagnosticFinding[]
) => {
  if (!ai) return null;

  try {
    const response = await ai.run(model || DEFAULT_AI_MODEL, {
      messages: [
        {
          role: "system",
          content:
            "You summarize Sarge tracking diagnostics for a technical marketer or engineer. Be concise, cite only supplied evidence, and end with the most useful agentic coding prompt."
        },
        {
          role: "user",
          content: JSON.stringify({
            site: {
              id: site.id,
              endpointHost: site.endpointHost
            },
            findings: findings.map((finding) => ({
              ruleId: finding.ruleId,
              severity: finding.severity,
              title: finding.title,
              summary: finding.summary,
              evidence: finding.evidence,
              recommendation: finding.recommendation,
              agentPrompt: finding.agentPrompt
            }))
          })
        }
      ]
    });

    return readAiText(response);
  } catch (error) {
    console.error("Unable to summarize diagnostic findings", error);
    return null;
  }
};

const toDiagnosticEvent = (event: StoredEvent): DiagnosticEvent => ({
  name: event.name,
  occurredAt: event.occurredAt,
  sessionId: event.sessionId,
  userId: event.userId,
  properties: event.properties,
  url: event.url,
  title: event.title
});

const toStoredFinding = (finding: ReturnType<typeof analyzeEvents>[number]): StoredDiagnosticFinding => ({
  ...finding,
  ruleId: finding.id
});

const readAiText = (response: unknown) => {
  if (typeof response === "string") return response;
  if (!response || typeof response !== "object") return null;

  const responseRecord = response as Record<string, unknown>;
  if (typeof responseRecord.response === "string") return responseRecord.response;
  if (typeof responseRecord.result === "string") return responseRecord.result;

  const result = responseRecord.result;
  if (result && typeof result === "object") {
    const resultRecord = result as Record<string, unknown>;
    if (typeof resultRecord.response === "string") return resultRecord.response;
  }

  return null;
};

const readPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
