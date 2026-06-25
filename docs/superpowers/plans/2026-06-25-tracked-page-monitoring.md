# Tracked Page Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add scheduled health checks for previously tracked Production page URLs and surface failures as regular AI review diagnostic findings.

**Architecture:** Keep URL selection and finding construction in `@sarge/core`, and keep network fetching in the Worker scheduled diagnostics layer. The existing scheduled diagnostic runner will merge event-analysis findings with tracked-page health findings before saving the `DiagnosticRun` and requesting an AI summary.

**Tech Stack:** TypeScript, Vitest, Cloudflare Worker scheduled handler, Worker `fetch`, existing `DiagnosticFinding`/`DiagnosticRun` persistence.

---

## File Structure

- Create `packages/core/src/tracked-page-monitoring.ts`
  - Owns URL normalization, candidate selection, health result classification, and conversion of health failures into `DiagnosticFinding` objects.
- Create `packages/core/src/tracked-page-monitoring.test.ts`
  - Unit tests for normalization, prioritization, cap behavior, status classification, network error classification, and severity.
- Modify `packages/core/src/index.ts`
  - Exports the new helper types and functions.
- Create `apps/worker/src/page-health-checker.ts`
  - Owns HTTP `HEAD`/`GET` requests, timeout handling, redirect policy, and conversion to core health result inputs.
- Create `apps/worker/src/page-health-checker.test.ts`
  - Unit tests for Worker-side fetch behavior with mocked fetch implementations.
- Modify `apps/worker/src/diagnostic-runner.ts`
  - Calls the checker during scheduled diagnostics, merges page findings with event findings, and keeps failures isolated per environment.
- Modify `apps/worker/src/worker.test.ts`
  - Integration-level scheduled diagnostics tests using an injected URL health checker.
- No schema migration is needed.
- No project-detail UI change is needed for the first version because findings already render through the AI review panel.

## Task 1: Core Candidate Selection and Classification

**Files:**
- Create: `packages/core/src/tracked-page-monitoring.ts`
- Create: `packages/core/src/tracked-page-monitoring.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing core tests**

Create `packages/core/src/tracked-page-monitoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildTrackedPageFinding,
  classifyTrackedPageHealth,
  selectTrackedPageCandidates,
  type TrackedPageHealthResult
} from "./tracked-page-monitoring.js";
import type { DiagnosticEvent } from "./diagnostics.js";

const event = (
  name: string,
  overrides: Partial<DiagnosticEvent> = {}
): DiagnosticEvent => ({
  name,
  occurredAt: overrides.occurredAt ?? "2026-06-19T12:00:00.000Z",
  sessionId: overrides.sessionId ?? "sess_1",
  userId: overrides.userId ?? "user_1",
  properties: overrides.properties ?? {},
  url: overrides.url ?? "https://shop.example.com/products/flask?utm_source=ad#details",
  title: overrides.title ?? "Shop"
});

describe("tracked page monitoring", () => {
  it("normalizes and deduplicates recently tracked page URLs", () => {
    const candidates = selectTrackedPageCandidates([
      event("page.view", { url: "https://shop.example.com/products/flask?utm_source=ad&sarge_ref=abc#details" }),
      event("product.viewed", { url: "https://shop.example.com/products/flask" }),
      event("page.view", { url: "https://shop.example.com/products/flask?variant=blue&utm_campaign=spring" }),
      event("page.view", { url: "javascript:alert(1)" }),
      event("page.view", { url: "not a url" })
    ]);

    expect(candidates.map((candidate) => candidate.url)).toEqual([
      "https://shop.example.com/products/flask",
      "https://shop.example.com/products/flask?variant=blue"
    ]);
    expect(candidates[0]).toMatchObject({
      eventCount: 2,
      latestEventAt: "2026-06-19T12:00:00.000Z"
    });
  });

  it("prioritizes conversion-like URLs, then volume, then recency", () => {
    const candidates = selectTrackedPageCandidates(
      [
        event("page.view", {
          occurredAt: "2026-06-19T12:05:00.000Z",
          url: "https://shop.example.com/recent"
        }),
        event("page.view", { url: "https://shop.example.com/popular" }),
        event("product.viewed", { url: "https://shop.example.com/popular" }),
        event("purchase.completed", {
          occurredAt: "2026-06-19T12:01:00.000Z",
          url: "https://shop.example.com/thanks"
        })
      ],
      { limit: 3 }
    );

    expect(candidates.map((candidate) => candidate.url)).toEqual([
      "https://shop.example.com/thanks",
      "https://shop.example.com/popular",
      "https://shop.example.com/recent"
    ]);
  });

  it("applies the per-environment candidate cap", () => {
    const candidates = selectTrackedPageCandidates(
      [
        event("page.view", { url: "https://shop.example.com/a" }),
        event("page.view", { url: "https://shop.example.com/b" }),
        event("page.view", { url: "https://shop.example.com/c" })
      ],
      { limit: 2 }
    );

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.url)).toEqual([
      "https://shop.example.com/a",
      "https://shop.example.com/b"
    ]);
  });

  it("classifies unavailable tracked pages", () => {
    expect(classifyTrackedPageHealth({ url: "https://shop.example.com/missing", status: 404 })).toMatchObject({
      ruleId: "tracked_page_missing",
      severity: "warning"
    });
    expect(classifyTrackedPageHealth({ url: "https://shop.example.com/error", status: 503 })).toMatchObject({
      ruleId: "tracked_page_server_error",
      severity: "warning"
    });
    expect(classifyTrackedPageHealth({ url: "https://shop.example.com/error", status: 503, conversionLike: true })).toMatchObject({
      ruleId: "tracked_page_server_error",
      severity: "critical"
    });
    expect(classifyTrackedPageHealth({ url: "https://shop.example.com/error", status: 503, eventCount: 10 })).toMatchObject({
      ruleId: "tracked_page_server_error",
      severity: "critical"
    });
  });

  it("classifies timeout, unreachable, redirect mismatch, and healthy pages", () => {
    expect(classifyTrackedPageHealth({ url: "https://shop.example.com/slow", error: "timeout" })).toMatchObject({
      ruleId: "tracked_page_timeout",
      severity: "warning"
    });
    expect(classifyTrackedPageHealth({ url: "https://shop.example.com/down", error: "network" })).toMatchObject({
      ruleId: "tracked_page_unreachable",
      severity: "warning"
    });
    expect(classifyTrackedPageHealth({
      url: "https://shop.example.com/checkout",
      status: 200,
      finalUrl: "https://other.example.com/checkout"
    })).toMatchObject({
      ruleId: "tracked_page_redirect_mismatch",
      severity: "warning"
    });
    expect(classifyTrackedPageHealth({ url: "https://shop.example.com/ok", status: 200 })).toBeNull();
    expect(classifyTrackedPageHealth({ url: "https://shop.example.com/private", status: 403 })).toBeNull();
  });

  it("builds display-ready diagnostic findings", () => {
    const result: TrackedPageHealthResult = {
      url: "https://shop.example.com/checkout",
      status: 500,
      eventCount: 4,
      conversionLike: true
    };

    const finding = buildTrackedPageFinding(result);

    expect(finding).toMatchObject({
      id: "tracked_page_server_error",
      ruleId: "tracked_page_server_error",
      severity: "critical",
      title: "Tracked page returns a server error"
    });
    expect(finding.evidence).toEqual(
      expect.arrayContaining([
        "https://shop.example.com/checkout returned HTTP 500 during the scheduled page health check.",
        "Sarge observed 4 recent event(s) on this URL."
      ])
    );
    expect(finding.agentPrompt).toContain("Inspect the route, deployment logs, and recent changes");
  });
});
```

- [ ] **Step 2: Run core test to verify it fails**

Run:

```bash
pnpm --filter @sarge/core test -- tracked-page-monitoring
```

Expected: FAIL because `tracked-page-monitoring.js` does not exist.

- [ ] **Step 3: Implement core helper**

Create `packages/core/src/tracked-page-monitoring.ts`:

```ts
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

export const normalizeTrackedPageUrl = (value: string | null | undefined) => {
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
```

- [ ] **Step 4: Export core helper**

Modify `packages/core/src/index.ts` by adding:

```ts
export {
  buildTrackedPageFinding,
  classifyTrackedPageHealth,
  normalizeTrackedPageUrl,
  selectTrackedPageCandidates,
  type TrackedPageCandidate,
  type TrackedPageCandidateOptions,
  type TrackedPageClassification,
  type TrackedPageFailureRuleId,
  type TrackedPageFinding,
  type TrackedPageHealthResult
} from "./tracked-page-monitoring.js";
```

- [ ] **Step 5: Run core tests**

Run:

```bash
pnpm --filter @sarge/core test
```

Expected: PASS.

- [ ] **Step 6: Commit core helper**

Run:

```bash
git add packages/core/src/tracked-page-monitoring.ts packages/core/src/tracked-page-monitoring.test.ts packages/core/src/index.ts
git commit -m "Add tracked page monitoring core helpers"
```

## Task 2: Worker HTTP Page Health Checker

**Files:**
- Create: `apps/worker/src/page-health-checker.ts`
- Create: `apps/worker/src/page-health-checker.test.ts`

- [ ] **Step 1: Write failing Worker checker tests**

Create `apps/worker/src/page-health-checker.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { checkTrackedPageHealth } from "./page-health-checker.js";

const response = (status: number, url = "https://shop.example.com/page") =>
  new Response(null, { status, headers: { "content-type": "text/html" } }) as Response & { url: string };

describe("page health checker", () => {
  it("checks pages with HEAD first", async () => {
    const fetcher = vi.fn(async () => response(200));

    const result = await checkTrackedPageHealth({
      url: "https://shop.example.com/page",
      fetcher
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://shop.example.com/page",
      expect.objectContaining({
        method: "HEAD",
        redirect: "follow"
      })
    );
    expect(result).toMatchObject({ url: "https://shop.example.com/page", status: 200 });
  });

  it("falls back to GET when HEAD is method-specific", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(405))
      .mockResolvedValueOnce(response(200));

    const result = await checkTrackedPageHealth({
      url: "https://shop.example.com/page",
      fetcher
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1]).toEqual(expect.objectContaining({ method: "GET" }));
    expect(result).toMatchObject({ status: 200 });
  });

  it("reports timeout errors", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      init?.signal?.throwIfAborted();
      return response(200);
    });

    const result = await checkTrackedPageHealth({
      url: "https://shop.example.com/slow",
      timeoutMs: 1,
      fetcher
    });

    expect(result).toMatchObject({
      url: "https://shop.example.com/slow",
      error: "timeout"
    });
  });

  it("reports network errors", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    const result = await checkTrackedPageHealth({
      url: "https://shop.example.com/down",
      fetcher
    });

    expect(result).toMatchObject({
      url: "https://shop.example.com/down",
      error: "network"
    });
  });
});
```

- [ ] **Step 2: Run checker tests to verify they fail**

Run:

```bash
pnpm --filter @sarge/worker test -- page-health-checker
```

Expected: FAIL because `page-health-checker.js` does not exist.

- [ ] **Step 3: Implement checker**

Create `apps/worker/src/page-health-checker.ts`:

```ts
import type { TrackedPageCandidate, TrackedPageHealthResult } from "@sarge/core";

type Fetcher = typeof fetch;

export interface CheckTrackedPageHealthOptions {
  url: string;
  eventCount?: number;
  conversionLike?: boolean;
  timeoutMs?: number;
  fetcher?: Fetcher;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const USER_AGENT = "Sarge Page Monitoring/1.0";

export const checkTrackedPageHealth = async (
  options: CheckTrackedPageHealthOptions
): Promise<TrackedPageHealthResult> => {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const headResult = await requestPage(fetcher, options.url, "HEAD", timeoutMs);
  if (shouldFallbackToGet(headResult.status)) {
    return requestPage(fetcher, options.url, "GET", timeoutMs, options);
  }

  return {
    ...headResult,
    eventCount: options.eventCount,
    conversionLike: options.conversionLike
  };
};

export const checkTrackedPageCandidates = async (
  candidates: TrackedPageCandidate[],
  options: { timeoutMs?: number; fetcher?: Fetcher } = {}
) => {
  const results: TrackedPageHealthResult[] = [];

  for (const candidate of candidates) {
    results.push(
      await checkTrackedPageHealth({
        url: candidate.url,
        eventCount: candidate.eventCount,
        conversionLike: candidate.conversionLike,
        timeoutMs: options.timeoutMs,
        fetcher: options.fetcher
      })
    );
  }

  return results;
};

const requestPage = async (
  fetcher: Fetcher,
  url: string,
  method: "HEAD" | "GET",
  timeoutMs: number,
  metadata: Pick<TrackedPageHealthResult, "eventCount" | "conversionLike"> = {}
): Promise<TrackedPageHealthResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await fetcher(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml"
      }
    });

    return {
      url,
      status: response.status,
      finalUrl: response.url || url,
      eventCount: metadata.eventCount,
      conversionLike: metadata.conversionLike
    };
  } catch (error) {
    return {
      url,
      error: isTimeoutError(error) ? "timeout" : "network",
      eventCount: metadata.eventCount,
      conversionLike: metadata.conversionLike
    };
  } finally {
    clearTimeout(timeout);
  }
};

const shouldFallbackToGet = (status: number | undefined) =>
  status === 403 || status === 405 || status === 501;

const isTimeoutError = (error: unknown) => {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error && typeof error === "object" && "name" in error) {
    return (error as { name?: string }).name === "AbortError";
  }
  return false;
};
```

- [ ] **Step 4: Run checker tests**

Run:

```bash
pnpm --filter @sarge/worker test -- page-health-checker
```

Expected: PASS.

- [ ] **Step 5: Commit checker**

Run:

```bash
git add apps/worker/src/page-health-checker.ts apps/worker/src/page-health-checker.test.ts
git commit -m "Add worker page health checker"
```

## Task 3: Merge Page Health Findings into Scheduled Diagnostics

**Files:**
- Modify: `apps/worker/src/diagnostic-runner.ts`
- Modify: `apps/worker/src/worker.test.ts`

- [ ] **Step 1: Write failing scheduled diagnostics tests**

Modify `apps/worker/src/worker.test.ts` imports:

```ts
import type { TrackedPageHealthResult } from "@sarge/core";
```

Add two tests inside `describe("Cloudflare Worker hosted API", () => { ... })`:

```ts
  it("adds tracked page health failures to scheduled diagnostics", async () => {
    const { ctx, promises } = createExecutionContext();
    const { diagnosticEvents, diagnosticRuns, store } = createMemoryStore();
    const handler = createWorkerHandler({
      store,
      pageHealthChecker: async () => [
        {
          url: "https://shop.example.com/checkout",
          status: 500,
          eventCount: 1,
          conversionLike: true
        } satisfies TrackedPageHealthResult
      ]
    });
    diagnosticEvents.push({
      id: "evt_checkout",
      siteId: "env_shared_production",
      name: "checkout.started",
      occurredAt: "2026-06-19T12:00:00.000Z",
      sessionId: "sess_checkout",
      userId: "user_123",
      properties: { value: 84, currency: "USD" },
      url: "https://shop.example.com/checkout",
      title: "Checkout"
    });

    await handler.scheduled(createScheduledController(), createEnv(), ctx);
    await Promise.all(promises);

    expect(diagnosticRuns).toHaveLength(1);
    expect(diagnosticRuns[0].findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "tracked_page_server_error",
          severity: "critical",
          evidence: expect.arrayContaining([
            "https://shop.example.com/checkout returned HTTP 500 during the scheduled page health check."
          ])
        })
      ])
    );
  });

  it("continues scheduled diagnostics when tracked page checks throw", async () => {
    const { ctx, promises } = createExecutionContext();
    const { diagnosticEvents, diagnosticRuns, store } = createMemoryStore();
    const handler = createWorkerHandler({
      store,
      pageHealthChecker: async () => {
        throw new Error("fetch platform unavailable");
      }
    });
    diagnosticEvents.push({
      id: "evt_page",
      siteId: "env_shared_production",
      name: "page.view",
      occurredAt: "2026-06-19T12:00:00.000Z",
      sessionId: "sess_page",
      userId: "user_123",
      properties: {},
      url: "https://shop.example.com",
      title: "Shop"
    });

    await handler.scheduled(createScheduledController(), createEnv(), ctx);
    await Promise.all(promises);

    expect(diagnosticRuns).toHaveLength(1);
    expect(diagnosticRuns[0]).toMatchObject({
      status: "completed"
    });
  });
```

- [ ] **Step 2: Run Worker tests to verify they fail**

Run:

```bash
pnpm --filter @sarge/worker test -- worker
```

Expected: FAIL because `createWorkerHandler` does not accept `pageHealthChecker` and the runner does not merge page health findings.

- [ ] **Step 3: Add runner injection type and merge logic**

Modify `apps/worker/src/diagnostic-runner.ts`:

```ts
import {
  analyzeEvents,
  buildTrackedPageFinding,
  selectTrackedPageCandidates,
  type DiagnosticEvent,
  type TrackedPageCandidate,
  type TrackedPageHealthResult
} from "@sarge/core";
import { checkTrackedPageCandidates } from "./page-health-checker.js";
```

Add these types and defaults near the constants:

```ts
const DEFAULT_PAGE_HEALTH_URL_LIMIT = 25;
const DEFAULT_PAGE_HEALTH_TIMEOUT_MS = 5_000;

export type PageHealthChecker = (
  candidates: TrackedPageCandidate[],
  options: { timeoutMs: number }
) => Promise<TrackedPageHealthResult[]>;

export interface RunScheduledDiagnosticsOptions {
  pageHealthChecker?: PageHealthChecker;
}
```

Change `runScheduledDiagnostics` signature and call:

```ts
export const runScheduledDiagnostics = async (
  store: EventStore,
  env: WorkerEnv,
  scheduledTime: number,
  options: RunScheduledDiagnosticsOptions = {}
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
  const pageHealthUrlLimit = readPositiveInteger(
    env.PAGE_HEALTH_URL_LIMIT,
    DEFAULT_PAGE_HEALTH_URL_LIMIT
  );
  const pageHealthTimeoutMs = readPositiveInteger(
    env.PAGE_HEALTH_TIMEOUT_MS,
    DEFAULT_PAGE_HEALTH_TIMEOUT_MS
  );
  const eventWindowStart = new Date(eventWindowEnd.getTime() - lookbackMinutes * 60_000);
  const sites = await store.listActiveSitesForDiagnostics(DEFAULT_SITE_LIMIT);

  for (const site of sites) {
    await runSiteDiagnostics(store, env, site, eventWindowStart, eventWindowEnd, eventLimit, {
      pageHealthChecker: options.pageHealthChecker ?? defaultPageHealthChecker,
      pageHealthUrlLimit,
      pageHealthTimeoutMs
    });
  }
};
```

Change `runSiteDiagnostics` signature and finding construction:

```ts
const runSiteDiagnostics = async (
  store: EventStore,
  env: WorkerEnv,
  site: SiteRecord,
  eventWindowStart: Date,
  eventWindowEnd: Date,
  eventLimit: number,
  options: {
    pageHealthChecker: PageHealthChecker;
    pageHealthUrlLimit: number;
    pageHealthTimeoutMs: number;
  }
) => {
  const startedAt = new Date();
  const events = await store.listRecentEventsForSite(site.id, eventWindowStart, eventLimit);
  const diagnosticEvents = events.map(toDiagnosticEvent);
  const eventFindings = events.length > 0 ? analyzeEvents(diagnosticEvents).map(toStoredFinding) : [];
  const pageFindings = events.length > 0
    ? await buildTrackedPageFindings(diagnosticEvents, options)
    : [];
  const findings = [...eventFindings, ...pageFindings];
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
```

Add helper functions:

```ts
const buildTrackedPageFindings = async (
  events: DiagnosticEvent[],
  options: {
    pageHealthChecker: PageHealthChecker;
    pageHealthUrlLimit: number;
    pageHealthTimeoutMs: number;
  }
): Promise<StoredDiagnosticFinding[]> => {
  const candidates = selectTrackedPageCandidates(events, { limit: options.pageHealthUrlLimit });
  if (candidates.length === 0) return [];

  try {
    const results = await options.pageHealthChecker(candidates, {
      timeoutMs: options.pageHealthTimeoutMs
    });

    return results
      .map(buildTrackedPageFinding)
      .filter((finding): finding is NonNullable<typeof finding> => Boolean(finding))
      .map(toStoredFinding);
  } catch (error) {
    console.error("Unable to run tracked page health checks", error);
    return [];
  }
};

const defaultPageHealthChecker: PageHealthChecker = (candidates, options) =>
  checkTrackedPageCandidates(candidates, options);
```

- [ ] **Step 4: Add env typing**

Modify `apps/worker/src/types.ts`:

```ts
export interface WorkerEnv {
  DATABASE_URL: string;
  SARGE_BASE_DOMAIN?: string;
  DEFAULT_ATTRIBUTION_TTL_DAYS?: string;
  DIAGNOSTIC_EVENT_LOOKBACK_MINUTES?: string;
  DIAGNOSTIC_EVENT_LIMIT_PER_SITE?: string;
  PAGE_HEALTH_URL_LIMIT?: string;
  PAGE_HEALTH_TIMEOUT_MS?: string;
  AI_SUMMARY_MODEL?: string;
  AI?: AiBinding;
}
```

- [ ] **Step 5: Wire handler injection**

Modify `apps/worker/src/index.ts` where `createWorkerHandler` is defined. Add `PageHealthChecker` import:

```ts
import { runScheduledDiagnostics, type PageHealthChecker } from "./diagnostic-runner.js";
```

Update handler options:

```ts
interface WorkerHandlerOptions {
  store?: EventStore;
  pageHealthChecker?: PageHealthChecker;
}
```

Update scheduled call:

```ts
ctx.waitUntil(runScheduledDiagnostics(store, env, controller.scheduledTime, {
  pageHealthChecker: options.pageHealthChecker
}));
```

- [ ] **Step 6: Run Worker tests**

Run:

```bash
pnpm --filter @sarge/worker test
```

Expected: PASS.

- [ ] **Step 7: Commit runner integration**

Run:

```bash
git add apps/worker/src/diagnostic-runner.ts apps/worker/src/index.ts apps/worker/src/types.ts apps/worker/src/worker.test.ts
git commit -m "Add tracked page monitoring to scheduled diagnostics"
```

## Task 4: AI Evidence and No-URL Guardrails

**Files:**
- Modify: `apps/worker/src/worker.test.ts`
- Modify: `apps/worker/src/diagnostic-runner.ts`

- [ ] **Step 1: Add tests for AI prompt context and no URL checks**

Add tests to `apps/worker/src/worker.test.ts`:

```ts
  it("includes tracked page evidence in the AI summary prompt", async () => {
    const { ctx, promises } = createExecutionContext();
    const { diagnosticEvents, store } = createMemoryStore();
    const aiCalls: unknown[] = [];
    const handler = createWorkerHandler({
      store,
      pageHealthChecker: async () => [
        {
          url: "https://shop.example.com/checkout",
          status: 404,
          eventCount: 3
        } satisfies TrackedPageHealthResult
      ]
    });
    diagnosticEvents.push({
      id: "evt_page",
      siteId: "env_shared_production",
      name: "page.view",
      occurredAt: "2026-06-19T12:00:00.000Z",
      sessionId: "sess_page",
      userId: "user_123",
      properties: {},
      url: "https://shop.example.com/checkout",
      title: "Checkout"
    });

    await handler.scheduled(createScheduledController(), createEnv({
      AI: {
        async run(model, input) {
          aiCalls.push(input);
          return { response: "The checkout page returned 404." };
        }
      }
    }), ctx);
    await Promise.all(promises);

    expect(JSON.stringify(aiCalls[0])).toContain("tracked_page_missing");
    expect(JSON.stringify(aiCalls[0])).toContain("https://shop.example.com/checkout returned HTTP 404");
  });

  it("does not run tracked page checks when recent events have no valid URLs", async () => {
    const { ctx, promises } = createExecutionContext();
    const { diagnosticEvents, diagnosticRuns, store } = createMemoryStore();
    const pageHealthChecker = vi.fn(async () => []);
    const handler = createWorkerHandler({ store, pageHealthChecker });
    diagnosticEvents.push({
      id: "evt_page",
      siteId: "env_shared_production",
      name: "page.view",
      occurredAt: "2026-06-19T12:00:00.000Z",
      sessionId: "sess_page",
      userId: "user_123",
      properties: {},
      url: null,
      title: "Shop"
    });

    await handler.scheduled(createScheduledController(), createEnv(), ctx);
    await Promise.all(promises);

    expect(pageHealthChecker).not.toHaveBeenCalled();
    expect(diagnosticRuns).toHaveLength(1);
  });
```

Ensure the top import includes `vi`:

```ts
import { describe, expect, it, vi } from "vitest";
```

- [ ] **Step 2: Run tests to verify behavior**

Run:

```bash
pnpm --filter @sarge/worker test -- worker
```

Expected: PASS if Task 3 was implemented correctly. If the no-URL test fails, update `buildTrackedPageFindings` to return early when `candidates.length === 0` exactly as shown in Task 3.

- [ ] **Step 3: Commit guardrail tests**

Run:

```bash
git add apps/worker/src/worker.test.ts apps/worker/src/diagnostic-runner.ts
git commit -m "Cover tracked page monitoring diagnostic guardrails"
```

## Task 5: Documentation and Verification

**Files:**
- Modify: `docs/AI_FEATURES.md`
- Modify: `docs/INSTALLATION.md`

- [ ] **Step 1: Document tracked page monitoring in AI features**

Add this section to `docs/AI_FEATURES.md` after the scheduled diagnostic pipeline section:

```md
## Tracked Page Monitoring

Scheduled diagnostics also check a bounded set of Production page URLs that recently emitted Sarge events. Sarge normalizes and deduplicates recent event URLs, checks up to 25 pages per environment by default, and reports failures through the same AI review findings list.

The monitor flags missing pages (`404` and `410`), server errors (`5xx`), DNS/TLS failures, request timeouts, and redirects to a different host. It does not crawl a site, check every incoming event URL, or require users to configure pinned URLs.

These checks run outside the ingestion path, so page monitoring cannot slow down event collection.
```

- [ ] **Step 2: Document install expectations**

Add this paragraph to `docs/INSTALLATION.md` near the AI recommendations note:

```md
Sarge active monitoring uses URLs already captured from Production events. Once pages emit events, scheduled AI review can re-check those same URLs and flag `404`, `5xx`, timeout, DNS/TLS, or redirect regressions without extra setup.
```

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm --dir www build
git diff --check
pattern='<<<<''<<<|>>>>''>>>|===''===='
rg -n "$pattern" . -g '!node_modules' -g '!www/node_modules' -g '!dist' -g '!www/dist'
```

Expected:

- `pnpm test`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm --dir www build`: PASS. The existing Vite chunk-size warning is acceptable if it remains the only warning.
- `git diff --check`: no output.
- conflict marker scan: no output and exit code `1`.

- [ ] **Step 4: Commit docs and verification fixes**

Run:

```bash
git add docs/AI_FEATURES.md docs/INSTALLATION.md
git commit -m "Document tracked page monitoring"
```

## Self-Review Checklist

- Spec coverage:
  - Previously captured Production pages are selected from recent event URLs in Task 1 and Task 3.
  - URL normalization, deduplication, and cap behavior are implemented in Task 1.
  - `HEAD` with `GET` fallback, timeout, redirect handling, and no credentials are implemented in Task 2.
  - Diagnostic findings use the existing `DiagnosticRun`/`DiagnosticFinding` persistence in Task 3.
  - AI review receives URL health evidence in Task 4.
  - No ingestion-path latency is introduced because checks only run in the scheduled runner.
  - Documentation is covered in Task 5.
- Placeholder scan:
  - The plan uses concrete file paths, commands, code snippets, and expected outcomes.
  - Every task has executable detail.
- Type consistency:
  - `TrackedPageCandidate`, `TrackedPageHealthResult`, `PageHealthChecker`, and `StoredDiagnosticFinding` are introduced before use.
  - Rule IDs match the approved design.
  - Worker env fields match their usage in the runner.
