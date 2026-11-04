import { createContext, runInContext, type Context } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  init: vi.fn(), track: vi.fn(), impersonate: vi.fn(), clearImpersonation: vi.fn()
}));
vi.mock("./client.js", () => ({ createSargeClient: () => client, buildCompactUrl: vi.fn() }));

let context: Context;
let events: EventTarget;
let scriptRequests: { src: string }[];
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  events = new EventTarget();
  scriptRequests = [];
  context = createContext({
    document: {
      createElement: () => ({ src: "" }),
      head: { appendChild: (script: { src: string }) => scriptRequests.push(script) }
    },
    addEventListener: events.addEventListener.bind(events)
  });
  runInContext("window = globalThis", context);
  vi.stubGlobal("window", context);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// Meta's bootstrap guard, queued function, and retained _fbq reference are the compatibility contract.
const loadMeta = () => runInContext(`
  (function (browser) {
    if (browser.fbq) return;
    const pixel = function () {
      if (pixel.callMethod) return pixel.callMethod.apply(pixel, arguments);
      pixel.queue.push(arguments);
    };
    browser.fbq = pixel;
    browser._fbq = pixel;
    pixel.queue = [];
    pixel.loaded = true;
    pixel.version = '2.0';
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  })(window);
`, context);

describe("vendor watchdog compatibility", () => {
  it.each(["before", "after"])("preserves Meta bootstrap, queues, and SDK properties when Sarge loads %s Meta", async (order) => {
    if (order === "after") loadMeta();
    await import("./index.js");
    if (order === "before") {
      expect(window.fbq).toBeUndefined();
      expect(window.gtag).toBeUndefined();
      expect(window.dataLayer).toBeUndefined();
      loadMeta();
    }

    expect(scriptRequests).toEqual([{ src: "https://connect.facebook.net/en_US/fbevents.js" }]);
    const fbq = window.fbq!;
    const retained = Reflect.get(window, "_fbq");
    fbq("track", "Purchase", { value: 42 });
    expect(Reflect.get(fbq, "queue")).toBe(Reflect.get(retained, "queue"));
    expect(Array.from(Reflect.get(fbq, "queue")[0])).toEqual(["track", "Purchase", { value: 42 }]);
    expect(Reflect.get(fbq, "loaded")).toBe(true);
    expect(Reflect.get(fbq, "version")).toBe("2.0");

    const dispatch = vi.fn(() => "vendor-result");
    Reflect.set(fbq, "callMethod", dispatch);
    expect(Reflect.get(retained, "callMethod")).toBe(dispatch);
    expect(fbq("track", "Lead")).toBe("vendor-result");
    expect(dispatch).toHaveBeenCalledWith("track", "Lead");
    expect(client.track).toHaveBeenCalledWith("meta.pixel.fire", expect.objectContaining({ event_name: "Purchase" }));
  });

  it("preserves late Google definitions and replacement data layers", async () => {
    await import("./index.js");
    runInContext(`
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { return window.dataLayer.push(arguments); };
      window.gtag('event', 'purchase', { value: 42 });
    `, context);
    expect(window.dataLayer).toHaveLength(1);
    expect(client.track).toHaveBeenCalledWith("google.tag.fire", expect.objectContaining({ event_name: "purchase" }));
    expect(client.track).toHaveBeenCalledWith("data_layer.push", expect.objectContaining({ vendor: "google" }));

    window.dataLayer = new Array<unknown>();
    expect(window.dataLayer.push({ event: "replacement" })).toBe(1);
    expect(client.track).toHaveBeenCalledWith("data_layer.push", { vendor: "google", payload: { event: "replacement" } });
  });

  it("allows global function declarations and reattaches after their script loads", async () => {
    await import("./index.js");
    runInContext(`
      window.dataLayer = [];
      function gtag() { return window.dataLayer.push(arguments); }
      gtag('event', 'initial');
    `, context);
    expect(window.dataLayer).toHaveLength(1);
    expect(client.track).toHaveBeenCalledWith("data_layer.push", expect.anything());
    events.dispatchEvent(new Event("load"));
    window.gtag!("event", "after-load");
    expect(client.track).toHaveBeenCalledWith("google.tag.fire", expect.objectContaining({ event_name: "after-load" }));
  });

  it("preserves receiver, return value, and exceptions while isolating observation errors", async () => {
    const receiver = {};
    const vendor = vi.fn(function (this: unknown) { return this; });
    window.fbq = vendor;
    await import("./index.js");
    client.track.mockImplementation(() => { throw new Error("storage unavailable"); });
    expect(window.fbq!.call(receiver, "track", "Purchase")).toBe(receiver);
    expect(vendor).toHaveBeenCalledWith("track", "Purchase");

    const error = new Error("vendor failure");
    window.fbq = () => { throw error; };
    expect(() => window.fbq!("track", "Lead")).toThrow(error);
  });

  it("observes chained dataLayer push replacements only once and forwards every item", async () => {
    window.dataLayer = new Array<unknown>();
    await import("./index.js");
    const priorPush = window.dataLayer.push;
    window.dataLayer.push = function (...items) { return priorPush.apply(this, items); };
    const items = [{ event: "one" }, { event: "two" }];
    expect(window.dataLayer.push(...items)).toBe(2);
    expect(Array.from(window.dataLayer)).toEqual(items);
    expect(client.track).toHaveBeenCalledTimes(2);
    client.track.mockImplementation(() => { throw new Error("tracker failed"); });
    expect(window.dataLayer.push({ event: "three" })).toBe(3);
  });

  it("does not break frozen functions, read-only globals, or provider accessors", async () => {
    const vendor = Object.freeze(vi.fn(() => 42));
    Object.defineProperty(window, "fbq", { configurable: false, writable: false, value: vendor });
    const getter = vi.fn(() => vendor);
    Object.defineProperty(window, "gtag", { configurable: true, get: getter });
    Reflect.set(window, "dataLayer", Object.freeze([]));
    await import("./index.js");
    expect(window.fbq!("track", "Purchase")).toBe(42);
    expect(Object.getOwnPropertyDescriptor(window, "gtag")?.get).toBe(getter);
    expect(window.gtag!("event", "purchase")).toBe(42);
  });
});
