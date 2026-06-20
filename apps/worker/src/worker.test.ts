import { describe, expect, it } from "vitest";
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
          id: "site_123",
          endpointHost: "acme.sarge.events",
          attributionTtlDays: 14,
          pixelEnabled: true
        };
      }

      return null;
    },
    async findSiteById(id) {
      if (id === "site_shared") {
        return {
          id: "site_shared",
          endpointHost: "shared.sarge.events",
          attributionTtlDays: 28,
          pixelEnabled: true
        };
      }

      return null;
    },
    async listActiveSitesForDiagnostics() {
      return [
        {
          id: "site_shared",
          endpointHost: "shared.sarge.events",
          attributionTtlDays: 28,
          pixelEnabled: true
        }
      ];
    },
    async listRecentEventsForSite(siteId) {
      return diagnosticEvents.filter((event) => event.siteId === siteId);
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
    expect(body).toContain('"siteId":"site_123"');
    expect(body).toContain('"endpoint":"https://acme.sarge.events"');
    expect(body).toContain("SargePixel");
  });

  it("serves a shared-host pixel selected by site query parameter", async () => {
    const { store } = createMemoryStore();
    const handler = createWorkerHandler({ store });

    const response = await handler.fetch(new Request("https://sarge.events/pixel.js?site=site_shared"), createEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('"siteId":"site_shared"');
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
          siteId: "site_123",
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
      siteId: "site_123",
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
          siteId: "site_shared",
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
      siteId: "site_shared",
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
    const handler = createWorkerHandler({ store });
    diagnosticEvents.push(
      {
        id: "evt_page",
        siteId: "site_shared",
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
        siteId: "site_shared",
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
      siteId: "site_shared",
      status: "completed",
      findingCount: 1,
      aiSummary: "Checkout started but no purchase event arrived. Ask an agent to wire purchase.completed."
    });
    expect(diagnosticRuns[0].findings[0]).toMatchObject({
      ruleId: "checkout-without-purchase",
      severity: "critical"
    });
  });

  it("stores diagnostics without calling AI when there are no findings", async () => {
    const { ctx, promises } = createExecutionContext();
    const { diagnosticEvents, diagnosticRuns, store } = createMemoryStore();
    const aiCalls: unknown[] = [];
    const handler = createWorkerHandler({ store });
    diagnosticEvents.push(
      {
        id: "evt_page",
        siteId: "site_shared",
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
        siteId: "site_shared",
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
        siteId: "site_shared",
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
      siteId: "site_shared",
      status: "completed",
      findingCount: 0,
      aiSummary: null,
      findings: []
    });
  });
});
