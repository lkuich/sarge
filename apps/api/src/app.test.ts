import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { EventRepository } from "./event-repository.js";

const createMemoryRepository = () => {
  const events: unknown[] = [];
  const repository: EventRepository = {
    async createEvent(event) {
      events.push(event);
    }
  };

  return { events, repository };
};

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

  it("returns health status", async () => {
    const { repository } = createMemoryRepository();
    const app = createApp({ repository });

    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.text).toBe("ok");
  });
});
