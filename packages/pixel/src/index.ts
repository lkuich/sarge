import { createSargeClient } from "./client.js";
import type { InitOptions } from "./types.js";

type QueuedCall = [method: string, ...args: unknown[]];
type DataLayer = unknown[] & { push: (...items: unknown[]) => number };

const install = () => {
  const browser = window;
  const client = createSargeClient(browser);
  const queued = Array.isArray(window._sarge?.queue) ? window._sarge.queue : [];

  if (window.__SARGE_CONFIG__) {
    client.init();
  }

  window.sarge = (method: string, ...args: unknown[]) => {
    if (method === "init") {
      client.init(args[0] as InitOptions);
      return;
    }

    if (method === "track") {
      client.track(args[0] as string, args[1] as Record<string, unknown> | undefined);
      return;
    }

    if (method === "impersonate") {
      client.impersonate(args[0] as string);
      return;
    }

    if (method === "clear_impersonation") {
      client.clearImpersonation();
      return;
    }

    throw new Error(`Unknown Sarge method: ${method}`);
  };

  window._sarge = window.sarge;
  window.impersonate = (userId: string) => client.impersonate(userId);
  window.clear_impersonation = () => client.clearImpersonation();
  installWatchdogs(client);

  for (const call of queued as QueuedCall[]) {
    window.sarge(...call);
  }
};

const installWatchdogs = (client: ReturnType<typeof createSargeClient>) => {
  const wrapCalls = (observe: (args: unknown[]) => void) => {
    const wrappers = new WeakMap<Function, Function>();
    let depth = 0;
    return (value: unknown) => {
      if (typeof value !== "function") return value;
      const existing = wrappers.get(value);
      if (existing) return existing;
      const wrapped = new Proxy(value, {
        apply(target, receiver, args) {
          depth += 1;
          try {
            if (depth === 1) {
              try {
                observe(args);
              } catch {
                // Observation must never prevent the vendor's own call.
              }
            }
            return Reflect.apply(target, receiver, args);
          } finally {
            depth -= 1;
          }
        }
      });
      wrappers.set(value, wrapped);
      wrappers.set(wrapped, wrapped);
      return wrapped;
    };
  };

  const wrapFbq = wrapCalls((args) => client.track("meta.pixel.fire", {
    vendor: "meta",
    command: typeof args[0] === "string" ? args[0] : undefined,
    event_name: typeof args[1] === "string" ? args[1] : undefined,
    payload: args[2]
  }));
  const wrapGtag = wrapCalls((args) => client.track("google.tag.fire", {
    vendor: "google",
    command: typeof args[0] === "string" ? args[0] : undefined,
    event_name: typeof args[1] === "string" ? args[1] : undefined,
    payload: args[2]
  }));
  const wrapPush = wrapCalls((items) => {
    for (const item of items) client.track("data_layer.push", { vendor: "google", payload: item });
  });
  const wrapDataLayer = (value: unknown) => {
    if (Array.isArray(value)) watchProperty(value, "push", wrapPush);
    return value;
  };
  const refresh = () => {
    watchProperty(window, "fbq", wrapFbq);
    watchProperty(window, "gtag", wrapGtag);
    watchProperty(window, "dataLayer", wrapDataLayer);
    wrapDataLayer(window.dataLayer);
  };

  refresh();
  // Script declarations can replace configurable hooks without invoking their setter.
  window.addEventListener?.("load", refresh, true);
  window.addEventListener?.("DOMContentLoaded", refresh, { once: true });
};

const watchProperty = (target: object, key: string, wrap: (value: unknown) => unknown) => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    // shortcut: provider accessors/read-only globals are not observed; add SDK-specific hooks if needed.
    if (descriptor?.get || descriptor?.set || descriptor?.writable === false) return;
    if (descriptor?.configurable === false) {
      Reflect.set(target, key, wrap(Reflect.get(target, key)));
      return;
    }
    let value = wrap(Reflect.get(target, key));
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get: () => value,
      set: (next: unknown) => { value = wrap(next); }
    });
  } catch {
    // Frozen or provider-owned globals must remain usable without a watchdog.
  }
};

declare global {
  interface Window {
    __SARGE_CONFIG__?: InitOptions;
    sarge: ((method: string, ...args: unknown[]) => void) & { queue?: QueuedCall[] };
    _sarge?: ((method: string, ...args: unknown[]) => void) & { queue?: QueuedCall[] };
    impersonate: (userId: string) => void;
    clear_impersonation: () => void;
    fbq?: (...args: unknown[]) => unknown;
    gtag?: (...args: unknown[]) => unknown;
    dataLayer?: DataLayer;
  }
}

if (typeof window !== "undefined") {
  install();
}

export { buildCompactUrl, createSargeClient } from "./client.js";
export type { BrowserLike, EventPayload, EventProperties, InitOptions, SargeClient } from "./types.js";
