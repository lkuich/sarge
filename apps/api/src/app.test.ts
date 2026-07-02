import request from "supertest";
import { UsageLimitExceededError } from "@sarge/core";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { EventExportQuery, ExportedEvent, EventRepository } from "./event-repository.js";

const createMemoryRepository = () => {
  const events: unknown[] = [];
  const exportEvents: ExportedEvent[] = [
    {
      id: "evt_purchase",
      siteId: "site_parent_123",
      siteEnvironmentId: "site_123",
      source: "browser",
      name: "purchase.completed",
      occurredAt: "2026-06-25T12:00:00.000Z",
      receivedAt: "2026-06-25T12:00:01.000Z",
      sessionId: "sess_123",
      userId: "user_123",
      ref: "summer-campaign",
      affiliate: "partner-42",
      attributionExpiresAt: null,
      url: "https://example.com/checkout",
      referrer: null,
      title: "Checkout",
      properties: {
        value: 129.99,
        currency: "USD"
      }
    },
    {
      id: "evt_page",
      siteId: "site_parent_123",
      siteEnvironmentId: "site_123",
      source: "browser",
      name: "page.view",
      occurredAt: "2026-06-25T11:00:00.000Z",
      receivedAt: "2026-06-25T11:00:01.000Z",
      sessionId: "sess_123",
      userId: "user_123",
      ref: null,
      affiliate: null,
      attributionExpiresAt: null,
      url: "https://example.com/",
      referrer: null,
      title: "Home",
      properties: {}
    },
    {
      id: "evt_other_env",
      siteId: "site_parent_123",
      siteEnvironmentId: "site_other",
      source: "browser",
      name: "purchase.completed",
      occurredAt: "2026-06-25T13:00:00.000Z",
      receivedAt: "2026-06-25T13:00:01.000Z",
      sessionId: "sess_other",
      userId: "user_other",
      ref: null,
      affiliate: null,
      attributionExpiresAt: null,
      url: "https://example.com/other",
      referrer: null,
      title: "Other",
      properties: {}
    }
  ];
  const repository: EventRepository = {
    async findSiteById(siteId) {
      if (siteId !== "site_123") return null;

      return {
        id: "site_123",
        siteId: "site_parent_123",
        environment: "production",
        serverEventSecretHash: "82f1c19229bdefda9e677f85bcacf68d8a173a21dae2ac685dbb91ed54a83fd3",
        postbackTokenHash: "22bf18421c010149a42fa386fe4a2fbd28e36da37ac813025b1293c9700c1e5b"
      };
    },
    async createEvent(event) {
      events.push(event);
    },
    async findReadToken(token) {
      if (token !== "sarge_read_valid") return null;

      return {
        id: "api_token_123",
        siteEnvironmentId: "site_123"
      };
    },
    async listEventsForExport(siteEnvironmentId, query) {
      const matchingEvents = filterExportEvents(exportEvents, siteEnvironmentId, query);
      const page = matchingEvents.slice(0, query.limit + 1);
      const events = page.slice(0, query.limit);
      const lastEvent = events.at(-1);

      return {
        events,
        nextCursor: page.length > query.limit && lastEvent
          ? {
              occurredAt: lastEvent.occurredAt,
              id: lastEvent.id
            }
          : null
      };
    }
  };

  return { events, repository };
};

const filterExportEvents = (events: ExportedEvent[], siteEnvironmentId: string, query: EventExportQuery) =>
  events
    .filter((event) => event.siteEnvironmentId === siteEnvironmentId)
    .filter((event) => !query.start || event.occurredAt >= query.start)
    .filter((event) => !query.end || event.occurredAt <= query.end)
    .filter((event) => !query.name || event.name === query.name)
    .filter((event) => !query.source || event.source === query.source)
    .filter((event) => !query.sessionId || event.sessionId === query.sessionId)
    .filter((event) => !query.userId || event.userId === query.userId)
    .filter(
      (event) =>
        !query.cursor ||
        event.occurredAt < query.cursor.occurredAt ||
        (event.occurredAt === query.cursor.occurredAt && event.id < query.cursor.id)
    )
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));

describe("Sarge API v2", () => {
  it("accepts a valid JSON event payload", async () => {
    const { events, repository } = createMemoryRepository();
    const app = createApp({ repository });

    const response = await request(app)
      .post("/v2/events")
      .send({
        siteId: "site_123",
        name: "Purchase",
        occurredAt: "2026-06-19T12:00:00.000Z",
        sessionId: "sess_123",
        userId: "user_123",
        attribution: {
          ref: "campaign-a",
          aff: "affiliate-1",
          expiresAt: "2026-07-19T12:00:00.000Z"
        },
        context: {
          url: "https://example.com/checkout",
          referrer: "https://google.com",
          title: "Checkout"
        },
        properties: {
          value: 129.99,
          currency: "USD"
        }
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ success: true });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      siteId: "site_123",
      name: "Purchase",
      sessionId: "sess_123",
      userId: "user_123"
    });
  });

  it("derives attribution from browser event URLs when the client omits attribution", async () => {
    const { events, repository } = createMemoryRepository();
    const app = createApp({ repository });

    const response = await request(app)
      .post("/v2/events")
      .send({
        siteId: "site_123",
        name: "page.view",
        occurredAt: "2026-06-25T16:03:36.000Z",
        sessionId: "sess_123",
        userId: "user_123",
        context: {
          url: "https://www.thebotoxcourse.com/ca?sarge_ref=summer-campaign&sarge_aff=partner-42",
          title: "Canada's Leading Medical Aesthetics Certification"
        },
        properties: {
          path: "/ca"
        }
      });

    expect(response.status).toBe(202);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      attribution: {
        ref: "summer-campaign",
        aff: "partner-42"
      }
    });
  });

  it("sanitizes browser event properties using site privacy settings before storage", async () => {
    const { events, repository } = createMemoryRepository();
    const privacyRepository: EventRepository = {
      ...repository,
      async findSiteById(siteId) {
        const site = await repository.findSiteById(siteId);
        return site
          ? {
              ...site,
              privacySettings: {
                piiRedactionEnabled: true,
                propertyPolicyMode: "blocklist",
                blockedPropertyKeys: ["internal_note"]
              }
            }
          : null;
      }
    };
    const app = createApp({ repository: privacyRepository });

    const response = await request(app)
      .post("/v2/events")
      .send({
        siteId: "site_123",
        name: "Purchase",
        occurredAt: "2026-06-19T12:00:00.000Z",
        sessionId: "sess_123",
        userId: "user_123",
        properties: {
          email: "buyer@example.com",
          internal_note: "do not store",
          value: 129.99
        }
      });

    expect(response.status).toBe(202);
    expect(events[0]).toMatchObject({
      properties: {
        email: "[REDACTED]",
        value: 129.99
      }
    });
    expect((events[0] as { properties: Record<string, unknown> }).properties.internal_note).toBeUndefined();
  });

  it("rejects malformed JSON event payloads", async () => {
    const { events, repository } = createMemoryRepository();
    const app = createApp({ repository });

    const response = await request(app)
      .post("/v2/events")
      .send({
        siteId: "site_123",
        occurredAt: "not-a-date",
        sessionId: "sess_123",
        userId: "user_123"
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(events).toHaveLength(0);
  });

  it("returns 429 when the workspace event limit is reached", async () => {
    const { repository } = createMemoryRepository();
    const limitedRepository: EventRepository = {
      ...repository,
      async createEvent() {
        throw new UsageLimitExceededError();
      }
    };
    const app = createApp({ repository: limitedRepository });

    const response = await request(app)
      .post("/v2/events")
      .send({
        siteId: "site_123",
        name: "Purchase",
        occurredAt: "2026-06-19T12:00:00.000Z",
        sessionId: "sess_123",
        userId: "user_123"
      });

    expect(response.status).toBe(429);
    expect(response.body).toEqual({ success: false, error: "Monthly event limit reached" });
  });

  it("accepts compact GET fallback events", async () => {
    const { events, repository } = createMemoryRepository();
    const app = createApp({ repository });

    const response = await request(app).get("/v2/e").query({
      sid: "site_123",
      n: "Lead",
      ts: "2026-06-19T13:00:00.000Z",
      ss: "sess_123",
      u: "user_123",
      ref: "campaign-a",
      aff: "affiliate-1",
      exp: "2026-07-19T13:00:00.000Z",
      url: "https://example.com/contact",
      p: JSON.stringify({ form: "contact" })
    });

    expect(response.status).toBe(202);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      siteId: "site_123",
      name: "Lead",
      attribution: {
        ref: "campaign-a",
        aff: "affiliate-1",
        expiresAt: "2026-07-19T13:00:00.000Z"
      },
      properties: {
        form: "contact"
      }
    });
  });

  it("accepts authenticated server-side event calls", async () => {
    const { events, repository } = createMemoryRepository();
    const app = createApp({ repository });

    const response = await request(app)
      .post("/v2/server/events")
      .set("authorization", "Bearer server_secret_123")
      .send({
        siteId: "site_123",
        name: "purchase.completed",
        eventId: "order_123",
        occurredAt: "2026-06-24T12:00:00.000Z",
        userId: "customer_123",
        properties: {
          order_id: "order_123",
          value: 129.99,
          currency: "USD"
        }
      });

    expect(response.status).toBe(202);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      siteId: "site_123",
      source: "server",
      name: "purchase.completed",
      sessionId: "server:order_123",
      userId: "customer_123"
    });
  });

  it("rejects server-side event calls with invalid credentials", async () => {
    const { events, repository } = createMemoryRepository();
    const app = createApp({ repository });

    const response = await request(app)
      .post("/v2/server/events")
      .set("authorization", "Bearer wrong_secret")
      .send({
        siteId: "site_123",
        name: "purchase.completed"
      });

    expect(response.status).toBe(401);
    expect(events).toHaveLength(0);
  });

  it("accepts tokenized postback URLs", async () => {
    const { events, repository } = createMemoryRepository();
    const app = createApp({ repository });

    const response = await request(app).get("/v2/postback/site_123/postback_token_123").query({
      event: "affiliate.conversion",
      ts: "2026-06-24T12:05:00.000Z",
      click_id: "click_123",
      order_id: "order_123",
      value: "42.50",
      currency: "USD"
    });

    expect(response.status).toBe(202);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      siteId: "site_123",
      source: "postback",
      name: "affiliate.conversion",
      sessionId: "postback:click_123",
      userId: "click_123",
      properties: {
        click_id: "click_123",
        order_id: "order_123",
        value: 42.5,
        currency: "USD"
      }
    });
  });

  it("rejects export calls without a read token", async () => {
    const { repository } = createMemoryRepository();
    const app = createApp({ repository });

    const response = await request(app).get("/v2/export/events");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ success: false, error: "Invalid credentials" });
  });

  it("exports only events for the read token environment", async () => {
    const { repository } = createMemoryRepository();
    const app = createApp({ repository });

    const response = await request(app)
      .get("/v2/export/events")
      .set("authorization", "Bearer sarge_read_valid")
      .query({ limit: "1" });

    expect(response.status).toBe(200);
    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0]).toMatchObject({
      siteEnvironmentId: "site_123",
      name: "purchase.completed"
    });
    expect(response.body.nextCursor).toEqual(expect.any(String));
  });

  it("validates export query parameters", async () => {
    const { repository } = createMemoryRepository();
    const app = createApp({ repository });

    const response = await request(app)
      .get("/v2/export/events")
      .set("authorization", "Bearer sarge_read_valid")
      .query({ source: "invalid" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "Invalid export query" });
  });

  it("returns health status", async () => {
    const { repository } = createMemoryRepository();
    const app = createApp({ repository });

    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.text).toBe("ok");
  });
});
