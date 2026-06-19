import { createSargeClient } from "./client.js";
import type { InitOptions } from "./types.js";

type QueuedCall = [method: string, ...args: unknown[]];

const install = () => {
  const browser = window;
  const client = createSargeClient(browser);
  const queued = Array.isArray(window._sarge?.queue) ? window._sarge.queue : [];

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

  for (const call of queued as QueuedCall[]) {
    window.sarge(...call);
  }
};

declare global {
  interface Window {
    sarge: ((method: string, ...args: unknown[]) => void) & { queue?: QueuedCall[] };
    _sarge?: ((method: string, ...args: unknown[]) => void) & { queue?: QueuedCall[] };
  }
}

if (typeof window !== "undefined") {
  install();
}

export { buildCompactUrl, createSargeClient } from "./client.js";
export type { BrowserLike, EventPayload, EventProperties, InitOptions, SargeClient } from "./types.js";
