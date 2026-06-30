import { describe, expect, it } from "vitest";
import { analyzeProjectEvents } from "./project-diagnostics";
import type { SargeEvent } from "./sarge-demo";

const event = (
  name: string,
  overrides: Partial<SargeEvent> = {},
): SargeEvent => ({
  id: overrides.id ?? `evt_${name}`,
  name,
  occurredAt: overrides.occurredAt ?? "2026-06-19T12:00:00.000Z",
  receivedAt: overrides.receivedAt ?? "2026-06-19T12:00:01.000Z",
  sessionId: overrides.sessionId ?? "sess_1",
  userId: overrides.userId ?? "user_1",
  properties: overrides.properties ?? {},
  url: overrides.url ?? "https://shop.example.com",
  referrer: overrides.referrer,
  ref: overrides.ref,
  affiliate: overrides.affiliate,
  title: overrides.title ?? "Shop",
});

describe("project diagnostics fallback", () => {
  it("includes watchdog implementation notes in agent prompts", () => {
    const findings = analyzeProjectEvents([
      event("page.view"),
      event("meta.pixel.fire", {
        properties: {
          vendor: "meta",
          transport: "server",
          command: "track",
          event_name: "Purchase",
          payload: { value: 42, currency: "USD" },
          implementation: {
            mode: "server_gtm",
            note: "This project does not fire fbq directly. Meta Purchase is dispatched server-side through GTM.",
          },
        },
      }),
    ]);

    const finding = findings.find((item) => item.id === "meta-purchase-without-sarge-purchase");

    expect(finding?.evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining("server-side through GTM"),
      ]),
    );
    expect(finding?.agentPrompt).toContain("server-side through GTM");
  });

  it("excludes Sarge test traffic from diagnostics", () => {
    const findings = analyzeProjectEvents([
      event("page.view"),
      event("checkout.started", {
        sessionId: "sess_test_checkout",
        properties: {
          value: 84,
          currency: "USD",
          sarge_test: true,
        },
      }),
    ]);

    expect(findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "checkout-without-purchase" }),
      ]),
    );
  });
});
