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

    throw new Error(`Unknown Sarge method: ${method}`);
  };

  window._sarge = window.sarge;
  installWatchdogs(client);

  for (const call of queued as QueuedCall[]) {
    window.sarge(...call);
  }
};

const installWatchdogs = (client: ReturnType<typeof createSargeClient>) => {
  const originalFbq = window.fbq;
  window.fbq = (...args: unknown[]) => {
    client.track("meta.pixel.fire", {
      vendor: "meta",
      command: typeof args[0] === "string" ? args[0] : undefined,
      event_name: typeof args[1] === "string" ? args[1] : undefined,
      payload: args[2]
    });

    return originalFbq?.(...args);
  };

  const originalGtag = window.gtag;
  window.gtag = (...args: unknown[]) => {
    client.track("google.tag.fire", {
      vendor: "google",
      command: typeof args[0] === "string" ? args[0] : undefined,
      event_name: typeof args[1] === "string" ? args[1] : undefined,
      payload: args[2]
    });

    return originalGtag?.(...args);
  };

  if (!window.dataLayer) {
    window.dataLayer = [] as unknown[] as DataLayer;
  }

  const dataLayer = window.dataLayer as DataLayer;
  const originalPush = dataLayer.push.bind(dataLayer);
  dataLayer.push = (...items: unknown[]) => {
    for (const item of items) {
      client.track("data_layer.push", {
        vendor: "google",
        payload: item
      });
    }

    return originalPush(...items);
  };
};

declare global {
  interface Window {
    __SARGE_CONFIG__?: InitOptions;
    sarge: ((method: string, ...args: unknown[]) => void) & { queue?: QueuedCall[] };
    _sarge?: ((method: string, ...args: unknown[]) => void) & { queue?: QueuedCall[] };
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
