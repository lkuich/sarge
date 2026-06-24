import cors from "cors";
import express, { type Express } from "express";
import {
  eventPayloadSchema,
  normalizePostbackEvent,
  normalizeServerEvent,
  parseCompactEventQuery,
  tokenMatchesHash
} from "@sarge/core";
import { ZodError } from "zod";
import type { EventRepository } from "./event-repository.js";

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

  app.post("/v2/events", async (req, res) => {
    try {
      const event = eventPayloadSchema.parse(req.body);
      await repository.createEvent(event);
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

      await repository.createEvent(event);
      res.status(202).json({ success: true });
    } catch (error) {
      handleIngestError(error, res);
    }
  });

  app.get("/v2/e", async (req, res) => {
    try {
      const event = parseCompactEventQuery(req.query);
      await repository.createEvent(event);
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
    await repository.createEvent(event);
    res.status(202).json({ success: true });
  } catch (error) {
    handleIngestError(error, res);
  }
};

const readBearerToken = (header: string | undefined) => {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return match?.[1]?.trim();
};

const handleIngestError = (error: unknown, res: express.Response) => {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    res.status(400).json({ success: false, error: "Invalid event payload" });
    return;
  }

  console.error(error);
  res.status(500).json({ success: false, error: "Unable to store event" });
};
