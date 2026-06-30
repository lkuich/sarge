import { z, ZodError } from "zod";

const isoDateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Expected an ISO 8601 date string"
});

const jsonObject = z.record(z.unknown());

export const eventSourceSchema = z.enum(["browser", "server", "postback"]);
export type EventSource = z.infer<typeof eventSourceSchema>;

export const eventPayloadSchema = z.object({
  siteId: z.string().min(1),
  source: eventSourceSchema.default("browser"),
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

export const serverEventPayloadSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().min(1),
  eventId: z.string().min(1).optional(),
  occurredAt: isoDateString.optional(),
  sessionId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  attribution: eventPayloadSchema.shape.attribution,
  context: eventPayloadSchema.shape.context,
  properties: jsonObject.optional()
});

export type ServerEventPayload = z.infer<typeof serverEventPayloadSchema>;

export const serverVendorCallPropertiesSchema = z
  .object({
    vendor: z.enum(["meta", "google"]),
    transport: z.literal("server").default("server"),
    command: z.string().min(1).optional(),
    event_name: z.string().min(1),
    payload: jsonObject.optional(),
    upstream: z.object({
      endpoint: z.string().min(1).optional(),
      status: z.number().int().min(100).max(599),
      ok: z.boolean().optional(),
      request_id: z.string().min(1).optional(),
      response_id: z.string().min(1).optional(),
      error_code: z.string().min(1).optional(),
      error_message: z.string().min(1).optional()
    }),
    implementation: z
      .object({
        mode: z.string().min(1).optional(),
        note: z.string().min(1)
      })
      .optional()
  })
  .passthrough();

export type ServerVendorCallProperties = z.infer<typeof serverVendorCallPropertiesSchema>;

export interface NormalizeEventOptions {
  now?: () => Date;
  randomId?: () => string;
}

export const normalizeServerVendorCallProperties = (input: unknown): ServerVendorCallProperties => {
  const parsed = serverVendorCallPropertiesSchema.parse(input);

  return {
    ...parsed,
    transport: "server",
    upstream: {
      ...parsed.upstream,
      ok: parsed.upstream.ok ?? (parsed.upstream.status >= 200 && parsed.upstream.status < 300)
    }
  };
};

export const normalizeServerEvent = (input: unknown, options: NormalizeEventOptions = {}): EventPayload => {
  const parsed = serverEventPayloadSchema.parse(input);
  const identity = parsed.eventId ?? options.randomId?.() ?? createFallbackId();

  return eventPayloadSchema.parse({
    siteId: parsed.siteId,
    source: "server",
    name: parsed.name,
    occurredAt: parsed.occurredAt ?? getNow(options).toISOString(),
    sessionId: parsed.sessionId ?? `server:${identity}`,
    userId: parsed.userId ?? `server:${identity}`,
    attribution: parsed.attribution,
    context: parsed.context,
    properties: parsed.properties
  });
};

export const normalizePostbackEvent = (
  query: unknown,
  siteId: string,
  options: NormalizeEventOptions = {}
): EventPayload => {
  const values = postbackValuesSchema.parse(query);
  const name = readFirst(values, "n", "name", "event");
  if (!name) {
    throwValidationError("Postback event name is required");
  }

  const occurredAt = readFirst(values, "ts", "occurredAt", "occurred_at") ?? getNow(options).toISOString();
  const clickId = readFirst(values, "click_id", "clickId");
  const orderId = readFirst(values, "order_id", "orderId");
  const transactionId = readFirst(values, "transaction_id", "transactionId");
  const eventId = readFirst(values, "event_id", "eventId");
  const identity = clickId ?? orderId ?? transactionId ?? eventId ?? options.randomId?.() ?? createFallbackId();
  const properties = buildPostbackProperties(values, {
    click_id: clickId,
    order_id: orderId,
    transaction_id: transactionId,
    event_id: eventId
  });
  const ref = readFirst(values, "ref");
  const aff = readFirst(values, "aff", "affiliate");
  const expiresAt = readFirst(values, "exp", "expiresAt", "expires_at");
  const url = readFirst(values, "url");
  const referrer = readFirst(values, "r", "referrer");
  const title = readFirst(values, "t", "title");

  return eventPayloadSchema.parse({
    siteId,
    source: "postback",
    name,
    occurredAt,
    sessionId: readFirst(values, "ss", "session_id", "sessionId") ?? `postback:${identity}`,
    userId: readFirst(values, "u", "user_id", "userId") ?? clickId ?? `postback:${identity}`,
    attribution:
      ref || aff || expiresAt
        ? {
            ref,
            aff,
            expiresAt
          }
        : undefined,
    context:
      url || referrer || title
        ? {
            url,
            referrer,
            title
          }
        : undefined,
    properties: Object.keys(properties).length > 0 ? properties : undefined
  });
};

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
    source: "browser",
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

const postbackValuesSchema = z.record(z.union([z.string(), z.array(z.string()), z.undefined()]));

const getNow = (options: NormalizeEventOptions) => options.now?.() ?? new Date();

const createFallbackId = () => Math.random().toString(36).slice(2);

const readFirst = (values: Record<string, string | string[] | undefined>, ...keys: string[]) => {
  for (const key of keys) {
    const value = values[key];
    const candidate = Array.isArray(value) ? value.at(0) : value;
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }

  return undefined;
};

const buildPostbackProperties = (
  values: Record<string, string | string[] | undefined>,
  identifiers: Record<string, string | undefined>
) => {
  const properties = readProperties(values);
  for (const [key, value] of Object.entries(identifiers)) {
    if (value) properties[key] = value;
  }

  const value = readFirst(values, "value", "amount");
  if (value) {
    const numericValue = Number(value);
    properties.value = Number.isFinite(numericValue) ? numericValue : value;
  }

  const currency = readFirst(values, "currency");
  if (currency) properties.currency = currency;

  return properties;
};

const readProperties = (values: Record<string, string | string[] | undefined>) => {
  const propertiesValue = readFirst(values, "p", "properties");
  if (!propertiesValue) return {};

  return jsonObject.parse(JSON.parse(propertiesValue));
};

const throwValidationError = (message: string): never => {
  throw new ZodError([
    {
      code: "custom",
      path: [],
      message
    }
  ]);
};
