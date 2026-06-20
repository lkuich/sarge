import { describe, expect, it, vi } from "vitest";
import { createSargeClient } from "./client.js";
import type { BrowserLike } from "./types.js";

const createMemoryStorage = () => {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values
  };
};

const createBrowser = (overrides: Partial<BrowserLike> = {}) => {
  const storage = createMemoryStorage();
  const sendBeacon = vi.fn((_url: string, _data?: BodyInit | null) => true);
  const fetch = vi.fn(() => Promise.resolve());
  const images: string[] = [];

  class FakeImage {
    set src(value: string) {
      images.push(value);
    }
  }

  const browser: BrowserLike = {
    location: {
      href: "https://example.com/?sarge_ref=campaign-a&sarge_aff=affiliate-1",
      search: "?sarge_ref=campaign-a&sarge_aff=affiliate-1"
    },
    document: {
      title: "Example"
    },
    localStorage: storage,
    navigator: {
      sendBeacon
    },
    fetch,
    Image: FakeImage,
    crypto: {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("sess_123")
        .mockReturnValueOnce("user_123")
    },
    now: () => new Date("2026-06-19T12:00:00.000Z"),
    ...overrides
  };

  return { browser, fetch, images, sendBeacon, storage };
};

describe("Sarge pixel", () => {
  it("auto-initializes hosted pixels from embedded config before replaying queued calls", async () => {
    vi.resetModules();
    const { browser, sendBeacon } = createBrowser({
      __SARGE_CONFIG__: {
        siteId: "site_hosted",
        endpoint: "https://sarge.example.com",
        attributionTtlDays: 28
      },
      _sarge: {
        queue: [["track", "Page View", { path: "/" }]]
      }
    } as Partial<BrowserLike>);

    vi.stubGlobal("window", browser);
    await import("./index.js");

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, body] = sendBeacon.mock.calls[0];
    expect(url).toBe("https://sarge.example.com/v2/events");
    expect(JSON.parse(String(body))).toMatchObject({
      siteId: "site_hosted",
      name: "Page View",
      properties: {
        path: "/"
      }
    });

    vi.unstubAllGlobals();
  });

  it("stores attribution and sends events with sendBeacon first", () => {
    const { browser, sendBeacon, storage } = createBrowser();
    const client = createSargeClient(browser);

    client.init({
      siteId: "site_123",
      endpoint: "https://events.example.com",
      attributionTtlDays: 28
    });
    client.track("Purchase", { value: 129.99, currency: "USD" });

    expect(storage.values.get("sarge_ref")).toBe("campaign-a");
    expect(storage.values.get("sarge_aff")).toBe("affiliate-1");
    expect(storage.values.get("sarge_exp")).toBe("2026-07-17T12:00:00.000Z");
    expect(sendBeacon).toHaveBeenCalledTimes(1);

    const [url, body] = sendBeacon.mock.calls[0];
    expect(url).toBe("https://events.example.com/v2/events");
    expect(JSON.parse(String(body))).toMatchObject({
      siteId: "site_123",
      name: "Purchase",
      occurredAt: "2026-06-19T12:00:00.000Z",
      sessionId: "sess_123",
      userId: "user_123",
      attribution: {
        ref: "campaign-a",
        aff: "affiliate-1",
        expiresAt: "2026-07-17T12:00:00.000Z"
      },
      properties: {
        value: 129.99,
        currency: "USD"
      }
    });
  });

  it("omits empty context fields from outgoing events", () => {
    const { browser, sendBeacon } = createBrowser({
      document: {
        referrer: "",
        title: ""
      }
    });
    const client = createSargeClient(browser);

    client.init({ siteId: "site_123", endpoint: "https://events.example.com" });
    client.track("Page View");

    const [, body] = sendBeacon.mock.calls[0];
    const payload = JSON.parse(String(body));
    expect(payload.context).toEqual({
      url: "https://example.com/?sarge_ref=campaign-a&sarge_aff=affiliate-1"
    });
  });

  it("falls back to fetch when sendBeacon is unavailable", () => {
    const { browser, fetch } = createBrowser({
      navigator: {}
    });
    const client = createSargeClient(browser);

    client.init({ siteId: "site_123", endpoint: "https://events.example.com" });
    client.track("Lead");

    expect(fetch).toHaveBeenCalledWith(
      "https://events.example.com/v2/events",
      expect.objectContaining({
        keepalive: true,
        method: "POST"
      })
    );
  });

  it("falls back to compact image GET when structured transports are unavailable", () => {
    const { browser, images } = createBrowser({
      navigator: {},
      fetch: undefined
    });
    const client = createSargeClient(browser);

    client.init({ siteId: "site_123", endpoint: "https://events.example.com" });
    client.track("Lead", { form: "contact" });

    expect(images).toHaveLength(1);
    const url = new URL(images[0]);
    expect(url.origin + url.pathname).toBe("https://events.example.com/v2/e");
    expect(url.searchParams.get("sid")).toBe("site_123");
    expect(url.searchParams.get("n")).toBe("Lead");
    expect(url.searchParams.get("p")).toBe(JSON.stringify({ form: "contact" }));
  });
});
