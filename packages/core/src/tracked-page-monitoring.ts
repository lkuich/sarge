import type { DiagnosticEvent, DiagnosticFinding, DiagnosticSeverity } from "./diagnostics.js";

export type TrackedPageFailureRuleId =
  | "tracked_page_missing"
  | "tracked_page_server_error"
  | "tracked_page_timeout"
  | "tracked_page_unreachable"
  | "tracked_page_redirect_mismatch";

export interface TrackedPageCandidate {
  url: string;
  eventCount: number;
  latestEventAt: string;
  conversionLike: boolean;
}

export interface TrackedPageCandidateOptions {
  limit?: number;
}

export interface TrackedPageHealthResult {
  url: string;
  status?: number;
  finalUrl?: string;
  error?: "timeout" | "network";
  eventCount?: number;
  conversionLike?: boolean;
}

export interface TrackedPageClassification {
  ruleId: TrackedPageFailureRuleId;
  severity: DiagnosticSeverity;
}

export interface TrackedPageFinding extends DiagnosticFinding {
  ruleId: TrackedPageFailureRuleId;
}

const DEFAULT_LIMIT = 25;
const HIGH_VOLUME_THRESHOLD = 10;
const TRACKING_QUERY_PREFIXES = ["utm_"];
const TRACKING_QUERY_KEYS = new Set(["fbclid", "gclid", "msclkid", "sarge_ref", "sarge_aff"]);
const CONVERSION_EVENT_NAMES = new Set([
  "checkout.started",
  "purchase.completed",
  "affiliate.conversion"
]);

export const selectTrackedPageCandidates = (
  events: DiagnosticEvent[],
  options: TrackedPageCandidateOptions = {}
): TrackedPageCandidate[] => {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const byUrl = new Map<string, TrackedPageCandidate>();

  for (const event of events) {
    const url = normalizeTrackedPageUrl(event.url);
    if (!url) continue;

    const existing = byUrl.get(url);
    const conversionLike = isConversionLikeEvent(event.name);
    if (!existing) {
      byUrl.set(url, {
        url,
        eventCount: 1,
        latestEventAt: event.occurredAt,
        conversionLike
      });
      continue;
    }

    existing.eventCount += 1;
    existing.conversionLike = existing.conversionLike || conversionLike;
    if (Date.parse(event.occurredAt) > Date.parse(existing.latestEventAt)) {
      existing.latestEventAt = event.occurredAt;
    }
  }

  return Array.from(byUrl.values())
    .sort(compareCandidates)
    .slice(0, limit);
};

export const normalizeTrackedPageUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      const normalizedKey = key.toLowerCase();
      if (
        TRACKING_QUERY_KEYS.has(normalizedKey) ||
        TRACKING_QUERY_PREFIXES.some((prefix) => normalizedKey.startsWith(prefix))
      ) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
};

export const classifyTrackedPageHealth = (
  result: TrackedPageHealthResult
): TrackedPageClassification | null => {
  if (result.error === "timeout") {
    return { ruleId: "tracked_page_timeout", severity: "warning" };
  }
  if (result.error === "network") {
    return { ruleId: "tracked_page_unreachable", severity: "warning" };
  }
  if (hasRedirectHostMismatch(result.url, result.finalUrl)) {
    return { ruleId: "tracked_page_redirect_mismatch", severity: "warning" };
  }
  if (result.status === 404 || result.status === 410) {
    return { ruleId: "tracked_page_missing", severity: "warning" };
  }
  if (typeof result.status === "number" && result.status >= 500) {
    return {
      ruleId: "tracked_page_server_error",
      severity: result.conversionLike || (result.eventCount ?? 0) >= HIGH_VOLUME_THRESHOLD ? "critical" : "warning"
    };
  }
  return null;
};

export const buildTrackedPageFinding = (
  result: TrackedPageHealthResult
): TrackedPageFinding | null => {
  const classification = classifyTrackedPageHealth(result);
  if (!classification) return null;

  const text = findingText(classification.ruleId, result);
  const eventCount = result.eventCount ?? 0;

  return {
    id: classification.ruleId,
    ruleId: classification.ruleId,
    title: text.title,
    severity: classification.severity,
    summary: text.summary,
    evidence: [
      text.evidence,
      `Sarge observed ${eventCount} recent event(s) on this URL.`
    ],
    recommendation: text.recommendation,
    agentPrompt:
      `Inspect the route, deployment logs, and recent changes for ${result.url}. ` +
      "Confirm the page is intentionally available and that the Sarge pixel still loads after the fix."
  };
};

const compareCandidates = (left: TrackedPageCandidate, right: TrackedPageCandidate) => {
  if (left.conversionLike !== right.conversionLike) return left.conversionLike ? -1 : 1;
  if (left.eventCount !== right.eventCount) return right.eventCount - left.eventCount;
  return Date.parse(right.latestEventAt) - Date.parse(left.latestEventAt);
};

const isConversionLikeEvent = (eventName: string) => CONVERSION_EVENT_NAMES.has(eventName);

const hasRedirectHostMismatch = (originalUrl: string, finalUrl: string | undefined) => {
  if (!finalUrl || finalUrl === originalUrl) return false;
  try {
    return new URL(originalUrl).host !== new URL(finalUrl).host;
  } catch {
    return false;
  }
};

const findingText = (ruleId: TrackedPageFailureRuleId, result: TrackedPageHealthResult) => {
  switch (ruleId) {
    case "tracked_page_missing":
      return {
        title: "Tracked page is missing",
        summary: "A page that recently emitted tracking events now returns a missing-page response.",
        evidence: `${result.url} returned HTTP ${result.status} during the scheduled page health check.`,
        recommendation: "Restore the route or redirect it to the correct live page."
      };
    case "tracked_page_server_error":
      return {
        title: "Tracked page returns a server error",
        summary: "A page that recently emitted tracking events now returns a server error.",
        evidence: `${result.url} returned HTTP ${result.status} during the scheduled page health check.`,
        recommendation: "Fix the server-side error and verify the page still emits Sarge tracking events."
      };
    case "tracked_page_timeout":
      return {
        title: "Tracked page timed out",
        summary: "A page that recently emitted tracking events timed out during the scheduled check.",
        evidence: `${result.url} timed out during the scheduled page health check.`,
        recommendation: "Check page performance, upstream dependencies, and deploy health for this route."
      };
    case "tracked_page_unreachable":
      return {
        title: "Tracked page is unreachable",
        summary: "A page that recently emitted tracking events could not be reached during the scheduled check.",
        evidence: `${result.url} could not be reached during the scheduled page health check.`,
        recommendation: "Check DNS, TLS, hosting, and firewall configuration for this route."
      };
    case "tracked_page_redirect_mismatch":
      return {
        title: "Tracked page redirects away from its original host",
        summary: "A page that recently emitted tracking events now redirects to a different host.",
        evidence: `${result.url} redirected to ${result.finalUrl}.`,
        recommendation: "Confirm the redirect is intentional and that the destination still has tracking installed."
      };
  }
};
