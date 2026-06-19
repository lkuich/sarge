import { z } from "zod";

const isoDateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Expected an ISO 8601 date string"
});

const jsonObject = z.record(z.unknown());

export const eventPayloadSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().min(1),
  occurredAt: isoDateString,
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  attribution: z
    .object({
      ref: z.string().min(1).optional(),
      aff: z.string().min(1).optional(),
      expiresAt: isoDateString.optional()
    })
    .optional(),
  context: z
    .object({
      url: z.string().url().optional(),
      referrer: z.string().url().optional(),
      title: z.string().optional()
    })
    .optional(),
  properties: jsonObject.optional()
});

export type EventPayload = z.infer<typeof eventPayloadSchema>;

export const compactEventQuerySchema = z.object({
  sid: z.string().min(1),
  n: z.string().min(1),
  ts: isoDateString,
  ss: z.string().min(1),
  u: z.string().min(1),
  ref: z.string().min(1).optional(),
  aff: z.string().min(1).optional(),
  exp: isoDateString.optional(),
  url: z.string().url().optional(),
  r: z.string().url().optional(),
  t: z.string().optional(),
  p: z.string().optional()
});

export const parseCompactEventQuery = (query: unknown): EventPayload => {
  const parsed = compactEventQuerySchema.parse(query);
  let properties: Record<string, unknown> | undefined;

  if (parsed.p) {
    const maybeProperties = JSON.parse(parsed.p) as unknown;
    properties = jsonObject.parse(maybeProperties);
  }

  return {
    siteId: parsed.sid,
    name: parsed.n,
    occurredAt: parsed.ts,
    sessionId: parsed.ss,
    userId: parsed.u,
    attribution:
      parsed.ref || parsed.aff || parsed.exp
        ? {
            ref: parsed.ref,
            aff: parsed.aff,
            expiresAt: parsed.exp
          }
        : undefined,
    context:
      parsed.url || parsed.r || parsed.t
        ? {
            url: parsed.url,
            referrer: parsed.r,
            title: parsed.t
          }
        : undefined,
    properties
  };
};
