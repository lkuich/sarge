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

  it("observes common third-party pixel calls", async () => {
    vi.resetModules();
    const { browser, sendBeacon } = createBrowser({
      __SARGE_CONFIG__: {
        siteId: "site_hosted",
        endpoint: "https://sarge.example.com",
        attributionTtlDays: 28
      }
    } as Partial<BrowserLike>);

    vi.stubGlobal("window", browser);
    await import("./index.js");

    window.fbq!("track", "Purchase", { value: 129.99 });
    window.gtag!("event", "conversion", { send_to: "AW-123" });
    window.dataLayer!.push({ event: "checkout_started", value: 99 });

    const payloads = sendBeacon.mock.calls.map(([, body]) => JSON.parse(String(body)));
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "meta.pixel.fire",
          properties: {
            vendor: "meta",
            command: "track",
            event_name: "Purchase",
            payload: { value: 129.99 }
          }
        }),
        expect.objectContaining({
          name: "google.tag.fire",
          properties: {
            vendor: "google",
            command: "event",
            event_name: "conversion",
            payload: { send_to: "AW-123" }
          }
        }),
        expect.objectContaining({
          name: "data_layer.push",
          properties: {
            vendor: "google",
            payload: { event: "checkout_started", value: 99 }
          }
        })
      ])
    );

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

  it("captures sarge URL params even when an attribution window already exists", () => {
    const { browser, sendBeacon, storage } = createBrowser({
      location: {
        href: "https://example.com/?sarge_ref=summer-campaign&sarge_aff=partner-42",
        search: "?sarge_ref=summer-campaign&sarge_aff=partner-42"
      }
    });
    storage.values.set("sarge_exp", "2026-07-01T12:00:00.000Z");
    const client = createSargeClient(browser);

    client.init({
      siteId: "site_123",
      endpoint: "https://events.example.com",
      attributionTtlDays: 28
    });
    client.track("Page View");

    const [, body] = sendBeacon.mock.calls[0];
    expect(storage.values.get("sarge_ref")).toBe("summer-campaign");
    expect(storage.values.get("sarge_aff")).toBe("partner-42");
    expect(JSON.parse(String(body))).toMatchObject({
      attribution: {
        ref: "summer-campaign",
        aff: "partner-42",
        expiresAt: "2026-07-17T12:00:00.000Z"
      }
    });
  });

  it("drops expired attribution when the current URL has no sarge params", () => {
    const { browser, sendBeacon, storage } = createBrowser({
      location: {
        href: "https://example.com/products",
        search: ""
      }
    });
    storage.values.set("sarge_ref", "old-campaign");
    storage.values.set("sarge_aff", "old-partner");
    storage.values.set("sarge_exp", "2026-06-01T12:00:00.000Z");
    const client = createSargeClient(browser);

    client.init({
      siteId: "site_123",
      endpoint: "https://events.example.com",
      attributionTtlDays: 28
    });
    client.track("Page View");

    const [, body] = sendBeacon.mock.calls[0];
    expect(storage.values.get("sarge_ref")).toBeUndefined();
    expect(storage.values.get("sarge_aff")).toBeUndefined();
    expect(storage.values.get("sarge_exp")).toBeUndefined();
    expect(JSON.parse(String(body)).attribution).toBeUndefined();
  });

  it("replaces previous attribution instead of mixing old and new params", () => {
    const { browser, sendBeacon, storage } = createBrowser({
      location: {
        href: "https://example.com/?sarge_ref=new-campaign",
        search: "?sarge_ref=new-campaign"
      }
    });
    storage.values.set("sarge_ref", "old-campaign");
    storage.values.set("sarge_aff", "old-partner");
    storage.values.set("sarge_exp", "2026-07-01T12:00:00.000Z");
    const client = createSargeClient(browser);

    client.init({
      siteId: "site_123",
      endpoint: "https://events.example.com",
      attributionTtlDays: 28
    });
    client.track("Page View");

    const [, body] = sendBeacon.mock.calls[0];
    expect(storage.values.get("sarge_ref")).toBe("new-campaign");
    expect(storage.values.get("sarge_aff")).toBeUndefined();
    expect(JSON.parse(String(body))).toMatchObject({
      attribution: {
        ref: "new-campaign",
        expiresAt: "2026-07-17T12:00:00.000Z"
      }
    });
    expect(JSON.parse(String(body)).attribution.aff).toBeUndefined();
  });

  it("keeps generated user ids scoped to each project", () => {
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce("sess_site_a")
      .mockReturnValueOnce("user_site_a")
      .mockReturnValueOnce("sess_site_b")
      .mockReturnValueOnce("user_site_b");
    const { browser, sendBeacon, storage } = createBrowser({
      crypto: {
        randomUUID
      }
    });
    const client = createSargeClient(browser);

    client.init({ siteId: "site_a", endpoint: "https://events.example.com" });
    client.track("Page View");
    client.init({ siteId: "site_b", endpoint: "https://events.example.com" });
    client.track("Page View");

    const payloads = sendBeacon.mock.calls.map(([, body]) => JSON.parse(String(body)));
    expect(payloads[0]).toMatchObject({ siteId: "site_a", userId: "user_site_a" });
    expect(payloads[1]).toMatchObject({ siteId: "site_b", userId: "user_site_b" });
    expect(storage.values.get("sarge_user:site_a")).toBe("user_site_a");
    expect(storage.values.get("sarge_user:site_b")).toBe("user_site_b");
  });

  it("marks impersonated traffic while using the impersonated user id", () => {
    const { browser, sendBeacon, storage } = createBrowser();
    const client = createSargeClient(browser);

    client.init({ siteId: "site_123", endpoint: "https://events.example.com" });
    client.impersonate("abc123");
    client.track("Purchase", {
      currency: "USD",
      sarge_test: false
    });
    client.clearImpersonation();
    client.track("Page View");

    const payloads = sendBeacon.mock.calls.map(([, body]) => JSON.parse(String(body)));
    expect(storage.values.get("sarge_impersonate:site_123")).toBeUndefined();
    expect(payloads[0]).toMatchObject({
      userId: "abc123",
      properties: {
        currency: "USD",
        sarge_test: true,
        sarge_test_mode: "impersonation",
        sarge_tester_user_id: "user_123",
        sarge_impersonated_user_id: "abc123"
      }
    });
    expect(payloads[1]).toMatchObject({
      userId: "user_123"
    });
    expect(payloads[1].properties).toBeUndefined();
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

  it("exposes page-console helpers for impersonation", async () => {
    vi.resetModules();
    const { browser, sendBeacon } = createBrowser({
      __SARGE_CONFIG__: {
        siteId: "site_hosted",
        endpoint: "https://sarge.example.com",
        attributionTtlDays: 28
      }
    } as Partial<BrowserLike>);

    vi.stubGlobal("window", browser);
    await import("./index.js");

    window.impersonate("console_user");
    window.sarge("track", "Page View");
    window.clear_impersonation();
    window.sarge("track", "Page View");

    const payloads = sendBeacon.mock.calls.map(([, body]) => JSON.parse(String(body)));
    expect(payloads[0]).toMatchObject({
      userId: "console_user",
      properties: {
        sarge_test: true,
        sarge_test_mode: "impersonation",
        sarge_tester_user_id: "user_123",
        sarge_impersonated_user_id: "console_user"
      }
    });
    expect(payloads[1]).toMatchObject({
      userId: "user_123"
    });

    vi.unstubAllGlobals();
  });
});
