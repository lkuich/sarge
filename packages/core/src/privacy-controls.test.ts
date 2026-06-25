import { describe, expect, it } from "vitest";
import { sanitizeEventPayload } from "./privacy-controls.js";
import type { EventPayload } from "./event-schema.js";

const event = (properties: Record<string, unknown>): EventPayload => ({
  siteId: "env_123",
  source: "browser",
  name: "checkout.started",
  occurredAt: "2026-06-25T12:00:00.000Z",
  sessionId: "sess_123",
  userId: "user_123",
  properties
});

describe("privacy controls", () => {
  it("redacts built-in PII keys and matching string values without mutating the original event", () => {
    const original = event({
      email: "buyer@example.com",
      phone_number: "+1 604 555 1212",
      card: "4242 4242 4242 4242",
      notes: "Reach me at buyer@example.com",
      value: 129.99
    });

    const sanitized = sanitizeEventPayload(original);

    expect(sanitized.properties).toEqual({
      email: "[REDACTED]",
      phone_number: "[REDACTED]",
      card: "[REDACTED]",
      notes: "[REDACTED]",
      value: 129.99
    });
    expect(original.properties?.email).toBe("buyer@example.com");
  });

  it("applies custom redaction rules and drops blocked properties while preserving Sarge debug keys", () => {
    const sanitized = sanitizeEventPayload(
      event({
        coupon: "VIP-123",
        customer_note: "internal priority",
        order_id: "ord_123",
        sarge_test: true
      }),
      {
        customRedactionKeys: ["coupon"],
        blockedPropertyKeys: ["customer_note"]
      }
    );

    expect(sanitized.properties).toEqual({
      coupon: "[REDACTED]",
      order_id: "ord_123",
      sarge_test: true
    });
  });

  it("keeps only allowed properties plus Sarge-owned keys in allowlist mode", () => {
    const sanitized = sanitizeEventPayload(
      event({
        order_id: "ord_123",
        value: 84,
        debug: "drop me",
        sarge_test_mode: "impersonation"
      }),
      {
        propertyPolicyMode: "allowlist",
        allowedPropertyKeys: ["order_id", "value"]
      }
    );

    expect(sanitized.properties).toEqual({
      order_id: "ord_123",
      value: 84,
      sarge_test_mode: "impersonation"
    });
  });
});
