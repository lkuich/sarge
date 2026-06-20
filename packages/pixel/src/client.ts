import type { BrowserLike, EventPayload, EventProperties, InitOptions, SargeClient } from "./types.js";

const DEFAULT_ENDPOINT = "https://white-dawn-6379.fly.dev";
const DEFAULT_ATTRIBUTION_TTL_DAYS = 28;

export const createSargeClient = (browser: BrowserLike): SargeClient => {
  let options: Required<InitOptions> | null = null;

  const getNow = () => browser.now?.() ?? new Date();

  const localStore = {
    get: (name: string) => browser.localStorage.getItem(name),
    set: (name: string, value: string) => browser.localStorage.setItem(name, value),
    remove: (name: string) => browser.localStorage.removeItem(name)
  };

  const init = (initOptions?: InitOptions) => {
    const resolvedOptions = initOptions ?? getGlobalConfig(browser);
    if (!resolvedOptions?.siteId) {
      throw new Error("Sarge init requires a siteId");
    }

    options = {
      siteId: resolvedOptions.siteId,
      endpoint: trimTrailingSlash(resolvedOptions.endpoint ?? DEFAULT_ENDPOINT),
      attributionTtlDays: resolvedOptions.attributionTtlDays ?? DEFAULT_ATTRIBUTION_TTL_DAYS
    };

    refreshAttribution(options.attributionTtlDays);
  };

  const track = (name: string, properties?: EventProperties) => {
    if (!options) {
      throw new Error("Sarge must be initialized before tracking events");
    }

    const payload = buildPayload(options.siteId, name, properties);
    sendPayload(options.endpoint, payload);
  };

  const refreshAttribution = (attributionTtlDays: number) => {
    localStore.set("sarge_sess", browser.crypto.randomUUID());

    const existingExpiration = localStore.get("sarge_exp");
    if (existingExpiration && Date.parse(existingExpiration) > getNow().getTime()) {
      return;
    }

    const params = new URLSearchParams(browser.location.search);
    const ref = params.get("sarge_ref");
    const aff = params.get("sarge_aff");

    if (ref) {
      localStore.set("sarge_ref", ref);
    }

    if (aff) {
      localStore.set("sarge_aff", aff);
    }

    localStore.set("sarge_exp", addDays(getNow(), attributionTtlDays).toISOString());
    localStore.set("sarge_user", browser.crypto.randomUUID());
  };

  const buildPayload = (siteId: string, name: string, properties?: EventProperties): EventPayload => {
    const ref = localStore.get("sarge_ref") ?? undefined;
    const aff = localStore.get("sarge_aff") ?? undefined;
    const expiresAt = localStore.get("sarge_exp") ?? undefined;
    const sessionId = localStore.get("sarge_sess") ?? browser.crypto.randomUUID();
    const userId = localStore.get("sarge_user") ?? browser.crypto.randomUUID();

    if (!localStore.get("sarge_sess")) {
      localStore.set("sarge_sess", sessionId);
    }

    if (!localStore.get("sarge_user")) {
      localStore.set("sarge_user", userId);
    }

    return {
      siteId,
      name,
      occurredAt: getNow().toISOString(),
      sessionId,
      userId,
      attribution:
        ref || aff || expiresAt
          ? {
              ref,
              aff,
              expiresAt
          }
        : undefined,
      context: {
        url: optionalString(browser.location.href),
        referrer: optionalString(browser.document.referrer),
        title: optionalString(browser.document.title)
      },
      properties
    };
  };

  const sendPayload = (endpoint: string, payload: EventPayload) => {
    const url = `${endpoint}/v2/events`;
    const body = JSON.stringify(payload);

    if (browser.navigator.sendBeacon?.(url, body)) {
      return;
    }

    if (browser.fetch) {
      void browser.fetch(url, {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json"
        },
        keepalive: true
      });
      return;
    }

    const image = new browser.Image();
    image.src = buildCompactUrl(endpoint, payload);
  };

  return {
    init,
    track
  };
};

export const buildCompactUrl = (endpoint: string, payload: EventPayload) => {
  const url = new URL(`${endpoint}/v2/e`);

  url.searchParams.set("sid", payload.siteId);
  url.searchParams.set("n", payload.name);
  url.searchParams.set("ts", payload.occurredAt);
  url.searchParams.set("ss", payload.sessionId);
  url.searchParams.set("u", payload.userId);

  if (payload.attribution?.ref) url.searchParams.set("ref", payload.attribution.ref);
  if (payload.attribution?.aff) url.searchParams.set("aff", payload.attribution.aff);
  if (payload.attribution?.expiresAt) url.searchParams.set("exp", payload.attribution.expiresAt);
  if (payload.context?.url) url.searchParams.set("url", payload.context.url);
  if (payload.context?.referrer) url.searchParams.set("r", payload.context.referrer);
  if (payload.context?.title) url.searchParams.set("t", payload.context.title);
  if (payload.properties) url.searchParams.set("p", JSON.stringify(payload.properties));

  return url.href;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const optionalString = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const getGlobalConfig = (browser: BrowserLike): InitOptions | undefined =>
  "__SARGE_CONFIG__" in browser ? (browser.__SARGE_CONFIG__ as InitOptions | undefined) : undefined;
