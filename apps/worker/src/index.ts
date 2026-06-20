import { eventPayloadSchema, parseCompactEventQuery } from "@sarge/core";
import { ZodError } from "zod";
import { runScheduledDiagnostics } from "./diagnostic-runner.js";
import { NeonEventStore } from "./neon-event-store.js";
import { createPixelResponse } from "./pixel-response.js";
import type { EventStore, SiteRecord, WorkerEnv } from "./types.js";

export interface WorkerDependencies {
  store?: EventStore;
}

export const createWorkerHandler = (dependencies: WorkerDependencies = {}) => ({
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const store = dependencies.store ?? new NeonEventStore(env.DATABASE_URL);
    return handleRequest(request, env, store);
  },
  async scheduled(controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    const store = dependencies.store ?? new NeonEventStore(env.DATABASE_URL);
    ctx.waitUntil(runScheduledDiagnostics(store, env, controller.scheduledTime));
  }
});

const handleRequest = async (request: Request, _env: WorkerEnv, store: EventStore) => {
  const url = new URL(request.url);
  const sharedHost = _env.SARGE_BASE_DOMAIN;
  const isSharedHost = Boolean(sharedHost && url.host === sharedHost);

  if (url.pathname === "/healthz") {
    return new Response("ok", { status: 200 });
  }

  if (isSharedHost && url.pathname === "/pixel.js" && request.method === "GET") {
    const siteId = url.searchParams.get("site");
    if (!siteId) {
      return json({ success: false, error: "Missing site" }, 400);
    }

    const site = await store.findSiteById(siteId);
    if (!site) {
      return json({ success: false, error: "Unknown site" }, 404);
    }

    if (!site.pixelEnabled) {
      return json({ success: false, error: "Pixel disabled" }, 403);
    }

    return createPixelResponse(site, url.host);
  }

  if (isSharedHost && url.pathname === "/v2/events" && request.method === "POST") {
    return handleSharedJsonEvent(request, store);
  }

  if (isSharedHost && url.pathname === "/v2/e" && request.method === "GET") {
    return handleSharedCompactEvent(url, store);
  }

  const site = await store.findSiteByHost(url.host);
  if (!site) {
    return json({ success: false, error: "Unknown endpoint" }, 404);
  }

  if (url.pathname === "/pixel.js" && request.method === "GET") {
    if (!site.pixelEnabled) {
      return json({ success: false, error: "Pixel disabled" }, 403);
    }

    return createPixelResponse(site);
  }

  if (url.pathname === "/v2/events" && request.method === "POST") {
    return handleJsonEvent(request, store, site);
  }

  if (url.pathname === "/v2/e" && request.method === "GET") {
    return handleCompactEvent(url, store, site);
  }

  return json({ success: false, error: "Not found" }, 404);
};

const handleJsonEvent = async (request: Request, store: EventStore, site: SiteRecord) => {
  try {
    const body = await request.json();
    const event = eventPayloadSchema.parse(body);
    if (event.siteId !== site.id) {
      return json({ success: false, error: "Site mismatch" }, 403);
    }

    await store.createEvent(event);
    return json({ success: true }, 202);
  } catch (error) {
    return handleIngestError(error);
  }
};

const handleSharedJsonEvent = async (request: Request, store: EventStore) => {
  try {
    const body = await request.json();
    const event = eventPayloadSchema.parse(body);
    const site = await store.findSiteById(event.siteId);
    if (!site) {
      return json({ success: false, error: "Unknown site" }, 404);
    }

    await store.createEvent(event);
    return json({ success: true }, 202);
  } catch (error) {
    return handleIngestError(error);
  }
};

const handleCompactEvent = async (url: URL, store: EventStore, site: SiteRecord) => {
  try {
    const event = parseCompactEventQuery(Object.fromEntries(url.searchParams.entries()));
    await store.createEvent({ ...event, siteId: site.id });
    return json({ success: true }, 202);
  } catch (error) {
    return handleIngestError(error);
  }
};

const handleSharedCompactEvent = async (url: URL, store: EventStore) => {
  try {
    const event = parseCompactEventQuery(Object.fromEntries(url.searchParams.entries()));
    const site = await store.findSiteById(event.siteId);
    if (!site) {
      return json({ success: false, error: "Unknown site" }, 404);
    }

    await store.createEvent(event);
    return json({ success: true }, 202);
  } catch (error) {
    return handleIngestError(error);
  }
};

const handleIngestError = (error: unknown) => {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return json({ success: false, error: "Invalid event payload" }, 400);
  }

  console.error(error);
  return json({ success: false, error: "Unable to store event" }, 500);
};

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "access-control-allow-origin": "*"
    }
  });

export default createWorkerHandler();
