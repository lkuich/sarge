import { describe, expect, it } from "vitest";
import { summarizeEventHosts } from "./event-hosts";

describe("summarizeEventHosts", () => {
  it("uses distinct hosts from the top 10 most recent event URLs", () => {
    const events = Array.from({ length: 12 }, (_, index) => ({
      occurredAt: new Date(Date.UTC(2026, 5, 20, 12, index)).toISOString(),
      url: index < 9 ? "https://shop.sargetrack.app/products" : `https://older-${index}.example.com`,
    }));

    const hosts = summarizeEventHosts(events);

    expect(hosts).toEqual([
      {
        host: "shop.sargetrack.app",
        count: 9,
        lastEventAt: "2026-06-20T12:08:00.000Z",
      },
      {
        host: "older-9.example.com",
        count: 1,
        lastEventAt: "2026-06-20T12:09:00.000Z",
      },
    ]);
  });

  it("falls back to referrer when an event URL is unavailable", () => {
    const hosts = summarizeEventHosts([
      {
        occurredAt: "2026-06-20T12:00:00.000Z",
        referrer: "https://www.google.com/search?q=sarge",
      },
    ]);

    expect(hosts).toEqual([
      {
        host: "google.com",
        count: 1,
        lastEventAt: "2026-06-20T12:00:00.000Z",
      },
    ]);
  });
});
