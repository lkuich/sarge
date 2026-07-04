import cors from "cors";
import express, { type Express } from "express";
import {
  eventPayloadSchema,
  normalizePostbackEvent,
  normalizeServerEvent,
  parseCompactEventQuery,
  sanitizeEventPayload,
  tokenMatchesHash,
  UsageLimitExceededError
} from "@sarge/core";
import { z, ZodError } from "zod";
import type { EventExportCursor, EventRepository } from "./event-repository.js";

export interface AppDependencies {
  repository: EventRepository;
}

export const createApp = ({ repository }: AppDependencies): Express => {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "64kb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));

  app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
  });

  app.get("/v2/export/events", async (req, res) => {
    try {
      const token = readBearerToken(req.get("authorization"));
      if (!token) {
        res.status(401).json({ success: false, error: "Invalid credentials" });
        return;
      }

      const readToken = await repository.findReadToken(token);
      if (!readToken) {
        res.status(401).json({ success: false, error: "Invalid credentials" });
        return;
      }

      const query = parseExportQuery(req.query);
      const page = await repository.listEventsForExport(readToken.siteEnvironmentId, query);

      res.status(200).json({
        events: page.events,
        nextCursor: page.nextCursor ? encodeExportCursor(page.nextCursor) : null
      });
    } catch (error) {
      if (error instanceof InvalidExportQueryError || error instanceof ZodError) {
        res.status(400).json({ success: false, error: "Invalid export query" });
        return;
      }

      console.error(error);
      res.status(500).json({ success: false, error: "Unable to export events" });
    }
  });

  app.post("/v2/events", async (req, res) => {
    try {
      const event = deriveAttributionFromUrl(eventPayloadSchema.parse(req.body));
      const site = await repository.findSiteById(event.siteId);
      if (!site) {
        res.status(404).json({ success: false, error: "Unknown site" });
        return;
      }

      await repository.createEvent(sanitizeEventPayload(event, site.privacySettings));
      res.status(202).json({ success: true });
    } catch (error) {
      handleIngestError(error, res);
    }
  });

  app.post("/v2/server/events", async (req, res) => {
    try {
      const event = normalizeServerEvent(req.body);
      const site = await repository.findSiteById(event.siteId);
      if (!site) {
        res.status(404).json({ success: false, error: "Unknown site" });
        return;
      }

      const token = readBearerToken(req.get("authorization"));
      if (!(await tokenMatchesHash(token, site.serverEventSecretHash))) {
        res.status(401).json({ success: false, error: "Invalid credentials" });
        return;
      }

      await repository.createEvent(sanitizeEventPayload(event, site.privacySettings));
      res.status(202).json({ success: true });
    } catch (error) {
      handleIngestError(error, res);
    }
  });

  app.get("/v2/e", async (req, res) => {
    try {
      const event = parseCompactEventQuery(req.query);
      const site = await repository.findSiteById(event.siteId);
      if (!site) {
        res.status(404).json({ success: false, error: "Unknown site" });
        return;
      }

      await repository.createEvent(sanitizeEventPayload(event, site.privacySettings));
      res.status(202).json({ success: true });
    } catch (error) {
      handleIngestError(error, res);
    }
  });

  app.get("/v2/postback/:siteId/:token", async (req, res) => {
    await handlePostback(req.params.siteId, req.params.token, req.query, repository, res);
  });

  app.post("/v2/postback/:siteId/:token", async (req, res) => {
    await handlePostback(req.params.siteId, req.params.token, req.body, repository, res);
  });

  return app;
};

const handlePostback = async (
  siteId: string,
  token: string,
  payload: unknown,
  repository: EventRepository,
  res: express.Response
) => {
  try {
    const site = await repository.findSiteById(siteId);
    if (!site) {
      res.status(404).json({ success: false, error: "Unknown site" });
      return;
    }

    if (!(await tokenMatchesHash(token, site.postbackTokenHash))) {
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }

    const event = normalizePostbackEvent(payload, siteId);
    await repository.createEvent(sanitizeEventPayload(event, site.privacySettings));
    res.status(202).json({ success: true });
  } catch (error) {
    handleIngestError(error, res);
  }
};

const readBearerToken = (header: string | undefined) => {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return match?.[1]?.trim();
};

class InvalidExportQueryError extends Error {
  constructor() {
    super("Invalid export query");
    this.name = "InvalidExportQueryError";
  }
}

const optionalQueryString = z.preprocess(
  (value) => (Array.isArray(value) ? value.at(0) : value),
  z.string().trim().min(1).optional()
);

const isoDateQueryString = optionalQueryString.refine((value) => !value || !Number.isNaN(Date.parse(value)), {
  message: "Expected an ISO 8601 date string"
});

const exportQuerySchema = z.object({
  start: isoDateQueryString,
  end: isoDateQueryString,
  name: optionalQueryString,
  source: z.preprocess((value) => (Array.isArray(value) ? value.at(0) : value), z.enum(["browser", "server", "postback"]).optional()),
  sessionId: optionalQueryString,
  userId: optionalQueryString,
  limit: z
    .preprocess((value) => {
      const candidate = Array.isArray(value) ? value.at(0) : value;
      if (candidate === undefined) return 100;
      if (typeof candidate === "string" && /^\d+$/.test(candidate)) return Number(candidate);
      return candidate;
    }, z.number().int().min(1))
    .transform((value) => Math.min(value, 1000)),
  cursor: optionalQueryString
});

const exportCursorSchema = z.object({
  occurredAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  id: z.string().min(1)
});

const parseExportQuery = (query: unknown) => {
  const parsed = exportQuerySchema.parse(query);

  return {
    start: parsed.start,
    end: parsed.end,
    name: parsed.name,
    source: parsed.source,
    sessionId: parsed.sessionId,
    userId: parsed.userId,
    limit: parsed.limit,
    cursor: parsed.cursor ? decodeExportCursor(parsed.cursor) : undefined
  };
};

const decodeExportCursor = (value: string): EventExportCursor => {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    return exportCursorSchema.parse(parsed);
  } catch {
    throw new InvalidExportQueryError();
  }
};

const encodeExportCursor = (cursor: EventExportCursor) =>
  Buffer.from(JSON.stringify(cursor)).toString("base64url");

const deriveAttributionFromUrl = (event: ReturnType<typeof eventPayloadSchema.parse>) => {
  if (!event.context?.url) return event;

  let url: URL;
  try {
    url = new URL(event.context.url);
  } catch {
    return event;
  }

  const ref = event.attribution?.ref ?? url.searchParams.get("sarge_ref") ?? undefined;
  const aff = event.attribution?.aff ?? url.searchParams.get("sarge_aff") ?? undefined;
  if (!ref && !aff && !event.attribution?.expiresAt) return event;

  return {
    ...event,
    attribution: {
      ...event.attribution,
      ref,
      aff
    }
  };
};

const handleIngestError = (error: unknown, res: express.Response) => {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    res.status(400).json({ success: false, error: "Invalid event payload" });
    return;
  }

  if (error instanceof UsageLimitExceededError) {
    res.status(429).json({ success: false, error: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ success: false, error: "Unable to store event" });
};
