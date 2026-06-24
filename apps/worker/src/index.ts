import {
  eventPayloadSchema,
  normalizePostbackEvent,
  normalizeServerEvent,
  parseCompactEventQuery,
  tokenMatchesHash
} from "@sarge/core";
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
    const siteId = url.searchParams.get("env") ?? url.searchParams.get("site");
    if (!siteId) {
      return json({ success: false, error: "Missing environment" }, 400);
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

  if (isSharedHost && url.pathname === "/v2/server/events" && request.method === "POST") {
    return handleServerEvent(request, store);
  }

  if (isSharedHost && url.pathname === "/v2/e" && request.method === "GET") {
    return handleSharedCompactEvent(url, store);
  }

  const sharedPostback = parsePostbackPath(url.pathname);
  if (isSharedHost && sharedPostback && (request.method === "GET" || request.method === "POST")) {
    return handlePostbackEvent(request, url, store, sharedPostback.siteId, sharedPostback.token);
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

  if (url.pathname === "/v2/server/events" && request.method === "POST") {
    return handleServerEvent(request, store, site);
  }

  if (url.pathname === "/v2/e" && request.method === "GET") {
    return handleCompactEvent(url, store, site);
  }

  const postback = parsePostbackPath(url.pathname);
  if (postback && (request.method === "GET" || request.method === "POST")) {
    if (postback.siteId !== site.id) {
      return json({ success: false, error: "Site mismatch" }, 403);
    }

    return handlePostbackEvent(request, url, store, postback.siteId, postback.token);
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

const handleServerEvent = async (request: Request, store: EventStore, expectedSite?: SiteRecord) => {
  try {
    const body = await request.json();
    const event = normalizeServerEvent(body);
    if (expectedSite && event.siteId !== expectedSite.id) {
      return json({ success: false, error: "Site mismatch" }, 403);
    }

    const site = expectedSite ?? (await store.findSiteById(event.siteId));
    if (!site) {
      return json({ success: false, error: "Unknown site" }, 404);
    }

    const token = readBearerToken(request.headers.get("authorization"));
    if (!(await tokenMatchesHash(token, site.serverEventSecretHash))) {
      return json({ success: false, error: "Invalid credentials" }, 401);
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

const handlePostbackEvent = async (request: Request, url: URL, store: EventStore, siteId: string, token: string) => {
  try {
    const site = await store.findSiteById(siteId);
    if (!site) {
      return json({ success: false, error: "Unknown site" }, 404);
    }

    if (!(await tokenMatchesHash(token, site.postbackTokenHash))) {
      return json({ success: false, error: "Invalid credentials" }, 401);
    }

    const event = normalizePostbackEvent(await readPostbackPayload(request, url), siteId);
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

const parsePostbackPath = (pathname: string) => {
  const match = /^\/v2\/postback\/([^/]+)\/([^/]+)$/.exec(pathname);
  if (!match) return null;

  return {
    siteId: decodeURIComponent(match[1]),
    token: decodeURIComponent(match[2])
  };
};

const readBearerToken = (header: string | null) => {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return match?.[1]?.trim();
};

const readPostbackPayload = async (request: Request, url: URL) => {
  if (request.method === "GET") {
    return Object.fromEntries(url.searchParams.entries());
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return request.json();
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const values: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === "string") {
        values[key] = value;
      }
    });
    return values;
  }

  return Object.fromEntries(url.searchParams.entries());
};

export default createWorkerHandler();
