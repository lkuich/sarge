import { describe, expect, it } from "vitest";
import { analyzeEvents } from "./diagnostics.js";
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
  url: overrides.url ?? "https://shop.example.com",
  title: overrides.title ?? "Shop"
});

describe("event diagnostics", () => {
  it("flags checkout sessions that never produce a purchase", () => {
    const findings = analyzeEvents([
      event("page.view"),
      event("checkout.started", {
        sessionId: "sess_checkout",
        properties: { value: 84, currency: "USD" }
      })
    ]);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "checkout-without-purchase",
          severity: "critical"
        })
      ])
    );
  });

  it("flags duplicate completed purchases with the same order id", () => {
    const findings = analyzeEvents([
      event("page.view"),
      event("purchase.completed", {
        sessionId: "sess_a",
        properties: { order_id: "ord_123", value: 42, currency: "USD" }
      }),
      event("purchase.completed", {
        sessionId: "sess_b",
        properties: { order_id: "ord_123", value: 42, currency: "USD" }
      })
    ]);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "duplicate-purchase-order",
          severity: "critical",
          evidence: expect.arrayContaining([expect.stringContaining("ord_123")])
        })
      ])
    );
  });

  it("compares Sarge purchase events with observed Meta Purchase pixel calls", () => {
    const missingSargePurchase = analyzeEvents([
      event("page.view"),
      event("meta.pixel.fire", {
        properties: {
          vendor: "meta",
          command: "track",
          event_name: "Purchase",
          payload: { value: 42, currency: "USD" }
        }
      })
    ]);
    const missingMetaPurchase = analyzeEvents([
      event("page.view"),
      event("purchase.completed", {
        properties: { order_id: "ord_456", value: 42, currency: "USD" }
      })
    ]);

    expect(missingSargePurchase).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "meta-purchase-without-sarge-purchase",
          severity: "warning"
        })
      ])
    );
    expect(missingMetaPurchase).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "sarge-purchase-without-meta-purchase",
          severity: "warning"
        })
      ])
    );
  });

  it("flags tracking plan events missing required properties", () => {
    const findings = analyzeEvents([
      event("page.view"),
      event("cart.added", {
        properties: { product_id: "flask" }
      }),
      event("purchase.completed", {
        properties: { order_id: "ord_789", value: 42 }
      })
    ]);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing-required-properties",
          severity: "warning",
          evidence: expect.arrayContaining([
            expect.stringContaining("cart.added missing price"),
            expect.stringContaining("purchase.completed missing currency")
          ])
        })
      ])
    );
  });

  it("adds an informational finding when no page views are present", () => {
    const findings = analyzeEvents([
      event("cart.added", {
        properties: { product_id: "flask", price: 42 }
      })
    ]);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing-page-view-events",
          severity: "info"
        })
      ])
    );
  });
});
