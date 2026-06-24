import { describe, expect, it } from "vitest";
import { normalizePostbackEvent, normalizeServerEvent } from "./event-schema.js";

describe("server and postback event normalization", () => {
  it("normalizes authenticated server events into stored event payloads", () => {
    const event = normalizeServerEvent(
      {
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
      },
      { randomId: () => "evt_fallback" }
    );

    expect(event).toEqual({
      siteId: "site_123",
      source: "server",
      name: "purchase.completed",
      occurredAt: "2026-06-24T12:00:00.000Z",
      sessionId: "server:order_123",
      userId: "customer_123",
      properties: {
        order_id: "order_123",
        value: 129.99,
        currency: "USD"
      }
    });
  });

  it("normalizes URL postbacks and preserves partner identifiers", () => {
    const event = normalizePostbackEvent(
      {
        event: "affiliate.conversion",
        ts: "2026-06-24T12:05:00.000Z",
        click_id: "click_123",
        order_id: "order_123",
        value: "42.50",
        currency: "USD",
        ref: "partner-a"
      },
      "site_123",
      { randomId: () => "evt_fallback" }
    );

    expect(event).toEqual({
      siteId: "site_123",
      source: "postback",
      name: "affiliate.conversion",
      occurredAt: "2026-06-24T12:05:00.000Z",
      sessionId: "postback:click_123",
      userId: "click_123",
      attribution: {
        ref: "partner-a"
      },
      properties: {
        click_id: "click_123",
        order_id: "order_123",
        value: 42.5,
        currency: "USD"
      }
    });
  });
});
