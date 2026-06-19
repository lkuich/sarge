import cors from "cors";
import express, { type Express } from "express";
import { ZodError } from "zod";
import { eventPayloadSchema, parseCompactEventQuery } from "./event-schema.js";
import type { EventRepository } from "./event-repository.js";

export interface AppDependencies {
  repository: EventRepository;
}

export const createApp = ({ repository }: AppDependencies): Express => {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "64kb" }));

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

  app.get("/v2/e", async (req, res) => {
    try {
      const event = parseCompactEventQuery(req.query);
      await repository.createEvent(event);
      res.status(202).json({ success: true });
    } catch (error) {
      handleIngestError(error, res);
    }
  });

  return app;
};

const handleIngestError = (error: unknown, res: express.Response) => {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    res.status(400).json({ success: false, error: "Invalid event payload" });
    return;
  }

  console.error(error);
  res.status(500).json({ success: false, error: "Unable to store event" });
};
