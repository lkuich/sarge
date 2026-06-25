import { describe, expect, it } from "vitest";
import {
  buildTrackedPageFinding,
  classifyTrackedPageHealth,
  normalizeTrackedPageUrl,
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

  it("strips common tracking query parameters while preserving meaningful parameters", () => {
    expect(
      normalizeTrackedPageUrl(
        "https://shop.example.com/products/flask?variant=blue&utm_source=ad&fbclid=fb&gclid=google&msclkid=ms&sarge_ref=abc&sarge_aff=partner#details"
      )
    ).toBe("https://shop.example.com/products/flask?variant=blue");
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

  it("applies the default candidate cap", () => {
    const candidates = selectTrackedPageCandidates(
      Array.from({ length: 30 }, (_, index) =>
        event("page.view", { url: `https://shop.example.com/page-${index}` })
      )
    );

    expect(candidates).toHaveLength(25);
    expect(candidates[0]?.url).toBe("https://shop.example.com/page-0");
    expect(candidates.at(-1)?.url).toBe("https://shop.example.com/page-24");
  });

  it("classifies unavailable tracked pages", () => {
    expect(classifyTrackedPageHealth({ url: "https://shop.example.com/missing", status: 404 })).toMatchObject({
      ruleId: "tracked_page_missing",
      severity: "warning"
    });
    expect(classifyTrackedPageHealth({ url: "https://shop.example.com/gone", status: 410 })).toMatchObject({
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
    if (!finding) throw new Error("Expected tracked page finding");

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
