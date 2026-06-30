import { describe, expect, it } from "vitest";
import {
  normalizePostbackEvent,
  normalizeServerEvent,
  normalizeServerVendorCallProperties
} from "./event-schema.js";

describe("server and postback event normalization", () => {
  it("normalizes server-reported vendor pixel calls with upstream response metadata", () => {
    const properties = normalizeServerVendorCallProperties({
      vendor: "meta",
      command: "track",
      event_name: "Purchase",
      payload: {
        value: 129.99,
        currency: "USD"
      },
      upstream: {
        endpoint: "https://graph.facebook.com/v20.0/123/events",
        status: 200,
        request_id: "fb_req_123"
      },
      implementation: {
        mode: "server_gtm",
        note: "This project does not fire fbq directly. Meta Purchase is dispatched server-side through GTM."
      }
    });

    expect(properties).toEqual({
      vendor: "meta",
      transport: "server",
      command: "track",
      event_name: "Purchase",
      payload: {
        value: 129.99,
        currency: "USD"
      },
      upstream: {
        endpoint: "https://graph.facebook.com/v20.0/123/events",
        status: 200,
        ok: true,
        request_id: "fb_req_123"
      },
      implementation: {
        mode: "server_gtm",
        note: "This project does not fire fbq directly. Meta Purchase is dispatched server-side through GTM."
      }
    });
  });

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
