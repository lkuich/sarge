import { describe, expect, it } from "vitest";
import type { TrackedPageHealthResult } from "@sarge/core";
import { createWorkerHandler } from "./index.js";
import type { EventStore, StoredDiagnosticRun, StoredEvent, WorkerEnv } from "./types.js";

const createEnv = (overrides: Partial<WorkerEnv> = {}): WorkerEnv => ({
  DATABASE_URL: "postgresql://example",
  DEFAULT_ATTRIBUTION_TTL_DAYS: "28",
  SARGE_BASE_DOMAIN: "sarge.events",
  ...overrides
});

const createMemoryStore = () => {
  const events: unknown[] = [];
  const diagnosticRuns: StoredDiagnosticRun[] = [];
  const diagnosticEvents: StoredEvent[] = [];
  const store: EventStore = {
    async createEvent(event) {
      events.push(event);
    },
    async findSiteByHost(host) {
      if (host === "acme.sarge.events") {
        return {
          id: "env_123_production",
          siteId: "site_123",
          environment: "production",
          endpointHost: "acme.sarge.events",
          attributionTtlDays: 14,
          pixelEnabled: true,
          serverEventSecretHash: "82f1c19229bdefda9e677f85bcacf68d8a173a21dae2ac685dbb91ed54a83fd3",
          postbackTokenHash: "22bf18421c010149a42fa386fe4a2fbd28e36da37ac813025b1293c9700c1e5b"
        };
      }

      return null;
    },
    async findSiteById(id) {
      if (id === "env_shared_production") {
        return {
          id: "env_shared_production",
          siteId: "site_shared",
          environment: "production",
          endpointHost: "shared.sarge.events",
          attributionTtlDays: 28,
          pixelEnabled: true,
          serverEventSecretHash: "82f1c19229bdefda9e677f85bcacf68d8a173a21dae2ac685dbb91ed54a83fd3",
          postbackTokenHash: "22bf18421c010149a42fa386fe4a2fbd28e36da37ac813025b1293c9700c1e5b"
        };
      }

      return null;
    },
    async listActiveSitesForDiagnostics() {
      return [
        {
          id: "env_shared_production",
          siteId: "site_shared",
          environment: "production",
          endpointHost: "shared.sarge.events",
          attributionTtlDays: 28,
          pixelEnabled: true,
          serverEventSecretHash: "82f1c19229bdefda9e677f85bcacf68d8a173a21dae2ac685dbb91ed54a83fd3",
          postbackTokenHash: "22bf18421c010149a42fa386fe4a2fbd28e36da37ac813025b1293c9700c1e5b"
        }
      ];
    },
    async listRecentEventsForSite(siteEnvironmentId) {
      return diagnosticEvents.filter((event) => event.siteId === siteEnvironmentId);
    },
    async saveDiagnosticRun(run) {
      diagnosticRuns.push(run);
    }
  };

  return { diagnosticEvents, diagnosticRuns, events, store };
};

const createScheduledController = (): ScheduledController =>
  ({
    cron: "*/30 * * * *",
    scheduledTime: Date.parse("2026-06-19T12:30:00.000Z"),
    noRetry() {}
  }) as ScheduledController;

const createExecutionContext = () => {
  const promises: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      promises.push(promise);
    },
    passThroughOnException() {}
  } as unknown as ExecutionContext;

  return { ctx, promises };
};

describe("Cloudflare Worker hosted API", () => {
  it("returns health status", async () => {
    const { store } = createMemoryStore();
    const handler = createWorkerHandler({ store });

    const response = await handler.fetch(new Request("https://acme.sarge.events/healthz"), createEnv());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("serves a host-specific pixel", async () => {
    const { store } = createMemoryStore();
    const handler = createWorkerHandler({ store });

    const response = await handler.fetch(new Request("https://acme.sarge.events/pixel.js"), createEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/javascript");
    expect(body).toContain('"siteId":"env_123_production"');
    expect(body).toContain('"endpoint":"https://acme.sarge.events"');
    expect(body).toContain("SargePixel");
  });

  it("serves a shared-host pixel selected by environment query parameter", async () => {
    const { store } = createMemoryStore();
    const handler = createWorkerHandler({ store });

    const response = await handler.fetch(new Request("https://sarge.events/pixel.js?env=env_shared_production"), createEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('"siteId":"env_shared_production"');
    expect(body).toContain('"endpoint":"https://sarge.events"');
  });

  it("stores events for a matching hosted site", async () => {
    const { events, store } = createMemoryStore();
    const handler = createWorkerHandler({ store });

    const response = await handler.fetch(
      new Request("https://acme.sarge.events/v2/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId: "env_123_production",
          name: "Purchase",
          occurredAt: "2026-06-19T12:00:00.000Z",
          sessionId: "sess_123",
          userId: "user_123",
          properties: { value: 129.99 }
        })
      }),
      createEnv()
    );

    expect(response.status).toBe(202);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      siteId: "env_123_production",
      name: "Purchase"
    });
  });

  it("stores shared-host events by site ID", async () => {
    const { events, store } = createMemoryStore();
    const handler = createWorkerHandler({ store });

    const response = await handler.fetch(
      new Request("https://sarge.events/v2/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId: "env_shared_production",
          name: "Purchase",
          occurredAt: "2026-06-19T12:00:00.000Z",
          sessionId: "sess_123",
          userId: "user_123",
          properties: { value: 129.99 }
        })
      }),
      createEnv()
    );

    expect(response.status).toBe(202);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      siteId: "env_shared_production",
      name: "Purchase"
    });
  });

  it("rejects events with a mismatched site ID for the host", async () => {
    const { events, store } = createMemoryStore();
    const handler = createWorkerHandler({ store });

    const response = await handler.fetch(
      new Request("https://acme.sarge.events/v2/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId: "site_other",
          name: "Purchase",
          occurredAt: "2026-06-19T12:00:00.000Z",
          sessionId: "sess_123",
          userId: "user_123"
        })
      }),
      createEnv()
    );

    expect(response.status).toBe(403);
    expect(events).toHaveLength(0);
  });

  it("stores authenticated server-side events on the shared host", async () => {
    const { events, store } = createMemoryStore();
    const handler = createWorkerHandler({ store });

    const response = await handler.fetch(
      new Request("https://sarge.events/v2/server/events", {
        method: "POST",
        headers: {
          "authorization": "Bearer server_secret_123",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          siteId: "env_shared_production",
          name: "purchase.completed",
          eventId: "order_123",
          occurredAt: "2026-06-24T12:00:00.000Z",
          userId: "customer_123",
          properties: { value: 129.99, currency: "USD" }
        })
      }),
      createEnv()
    );

    expect(response.status).toBe(202);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      siteId: "env_shared_production",
      source: "server",
      name: "purchase.completed",
      sessionId: "server:order_123",
      userId: "customer_123"
    });
  });

  it("rejects server-side events without valid credentials", async () => {
    const { events, store } = createMemoryStore();
    const handler = createWorkerHandler({ store });

    const response = await handler.fetch(
      new Request("https://sarge.events/v2/server/events", {
        method: "POST",
        headers: {
          "authorization": "Bearer wrong_secret",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          siteId: "env_shared_production",
          name: "purchase.completed"
        })
      }),
      createEnv()
    );

    expect(response.status).toBe(401);
    expect(events).toHaveLength(0);
  });

  it("stores tokenized postback URL events", async () => {
    const { events, store } = createMemoryStore();
    const handler = createWorkerHandler({ store });
    const url = new URL("https://sarge.events/v2/postback/env_shared_production/postback_token_123");
    url.searchParams.set("event", "affiliate.conversion");
    url.searchParams.set("ts", "2026-06-24T12:05:00.000Z");
    url.searchParams.set("click_id", "click_123");
    url.searchParams.set("order_id", "order_123");
    url.searchParams.set("value", "42.50");
    url.searchParams.set("currency", "USD");

    const response = await handler.fetch(new Request(url), createEnv());

    expect(response.status).toBe(202);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      siteId: "env_shared_production",
      source: "postback",
      name: "affiliate.conversion",
      sessionId: "postback:click_123",
      userId: "click_123"
    });
  });

  it("returns 404 for unknown hosted domains", async () => {
    const { store } = createMemoryStore();
    const handler = createWorkerHandler({ store });

    const response = await handler.fetch(new Request("https://missing.sarge.events/pixel.js"), createEnv());

    expect(response.status).toBe(404);
  });

  it("runs scheduled diagnostics and stores an AI summary for findings", async () => {
    const { ctx, promises } = createExecutionContext();
    const { diagnosticEvents, diagnosticRuns, store } = createMemoryStore();
    const aiCalls: unknown[] = [];
    const handler = createWorkerHandler({ store, pageHealthChecker: async () => [] });
    diagnosticEvents.push(
      {
        id: "evt_page",
        siteId: "env_shared_production",
        name: "page.view",
        occurredAt: "2026-06-19T12:00:00.000Z",
        sessionId: "sess_checkout",
        userId: "user_123",
        properties: {},
        url: "https://shop.example.com/checkout",
        title: "Checkout"
      },
      {
        id: "evt_checkout",
        siteId: "env_shared_production",
        name: "checkout.started",
        occurredAt: "2026-06-19T12:01:00.000Z",
        sessionId: "sess_checkout",
        userId: "user_123",
        properties: { value: 84, currency: "USD" },
        url: "https://shop.example.com/checkout",
        title: "Checkout"
      }
    );

    await handler.scheduled(createScheduledController(), createEnv({
      AI: {
        async run(model, input) {
          aiCalls.push({ model, input });
          return { response: "Checkout started but no purchase event arrived. Ask an agent to wire purchase.completed." };
        }
      }
    }), ctx);
    await Promise.all(promises);

    expect(aiCalls).toHaveLength(1);
    expect(diagnosticRuns).toHaveLength(1);
    expect(diagnosticRuns[0]).toMatchObject({
      siteId: "env_shared_production",
      status: "completed",
      findingCount: 1,
      aiSummary: "Checkout started but no purchase event arrived. Ask an agent to wire purchase.completed."
    });
    expect(diagnosticRuns[0].findings[0]).toMatchObject({
      ruleId: "checkout-without-purchase",
      severity: "critical"
    });
  });

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

  it("stores diagnostics without calling AI when there are no findings", async () => {
    const { ctx, promises } = createExecutionContext();
    const { diagnosticEvents, diagnosticRuns, store } = createMemoryStore();
    const aiCalls: unknown[] = [];
    const handler = createWorkerHandler({ store, pageHealthChecker: async () => [] });
    diagnosticEvents.push(
      {
        id: "evt_page",
        siteId: "env_shared_production",
        name: "page.view",
        occurredAt: "2026-06-19T12:00:00.000Z",
        sessionId: "sess_purchase",
        userId: "user_123",
        properties: {},
        url: "https://shop.example.com",
        title: "Shop"
      },
      {
        id: "evt_purchase",
        siteId: "env_shared_production",
        name: "purchase.completed",
        occurredAt: "2026-06-19T12:03:00.000Z",
        sessionId: "sess_purchase",
        userId: "user_123",
        properties: { order_id: "ord_123", value: 84, currency: "USD" },
        url: "https://shop.example.com/thanks",
        title: "Thanks"
      },
      {
        id: "evt_meta",
        siteId: "env_shared_production",
        name: "meta.pixel.fire",
        occurredAt: "2026-06-19T12:03:01.000Z",
        sessionId: "sess_purchase",
        userId: "user_123",
        properties: { event_name: "Purchase" },
        url: "https://shop.example.com/thanks",
        title: "Thanks"
      }
    );

    await handler.scheduled(createScheduledController(), createEnv({
      AI: {
        async run(model, input) {
          aiCalls.push({ model, input });
          return { response: "Should not be called" };
        }
      }
    }), ctx);
    await Promise.all(promises);

    expect(aiCalls).toHaveLength(0);
    expect(diagnosticRuns).toHaveLength(1);
    expect(diagnosticRuns[0]).toMatchObject({
      siteId: "env_shared_production",
      status: "completed",
      findingCount: 0,
      aiSummary: null,
      findings: []
    });
  });
});
