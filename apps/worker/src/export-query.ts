import { z } from "zod";
import type { EventExportCursor } from "./types.js";

export class InvalidExportQueryError extends Error {
  constructor() {
    super("Invalid export query");
    this.name = "InvalidExportQueryError";
  }
}

const readOptionalQueryString = (params: URLSearchParams, key: string) => {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
};

const isoDateQueryString = z.string().trim().min(1).refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Expected an ISO 8601 date string"
});

const exportCursorSchema = z.object({
  occurredAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  id: z.string().min(1)
});

export const parseExportQuery = (params: URLSearchParams) => {
  const start = readOptionalQueryString(params, "start");
  const end = readOptionalQueryString(params, "end");
  const source = readOptionalQueryString(params, "source");
  const limitValue = readOptionalQueryString(params, "limit");
  const cursor = readOptionalQueryString(params, "cursor");

  return {
    start: start ? isoDateQueryString.parse(start) : undefined,
    end: end ? isoDateQueryString.parse(end) : undefined,
    name: readOptionalQueryString(params, "name"),
    source: source ? z.enum(["browser", "server", "postback"]).parse(source) : undefined,
    sessionId: readOptionalQueryString(params, "sessionId"),
    userId: readOptionalQueryString(params, "userId"),
    limit: parseExportLimit(limitValue),
    cursor: cursor ? decodeExportCursor(cursor) : undefined
  };
};

const parseExportLimit = (value: string | undefined) => {
  if (!value) return 100;
  if (!/^\d+$/.test(value)) throw new InvalidExportQueryError();

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) throw new InvalidExportQueryError();
  return Math.min(limit, 1000);
};

const decodeExportCursor = (value: string): EventExportCursor => {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as unknown;
    return exportCursorSchema.parse(parsed);
  } catch {
    throw new InvalidExportQueryError();
  }
};

export const encodeExportCursor = (cursor: EventExportCursor) =>
  btoa(JSON.stringify(cursor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

