import type { BrowserLike, EventPayload, EventProperties, InitOptions, SargeClient } from "./types.js";

const DEFAULT_ENDPOINT = "https://white-dawn-6379.fly.dev";
const DEFAULT_ATTRIBUTION_TTL_DAYS = 28;
const sessionStorageKey = "sarge_sess";
const refStorageKey = "sarge_ref";
const affiliateStorageKey = "sarge_aff";
const expirationStorageKey = "sarge_exp";

const userStorageKey = (siteId: string) => `sarge_user:${siteId}`;
const impersonationStorageKey = (siteId: string) => `sarge_impersonate:${siteId}`;

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

    refreshAttribution(options.siteId, options.attributionTtlDays);
  };

  const track = (name: string, properties?: EventProperties) => {
    if (!options) {
      throw new Error("Sarge must be initialized before tracking events");
    }

    const payload = buildPayload(options.siteId, name, properties);
    sendPayload(options.endpoint, payload);
  };

  const impersonate = (userId: string) => {
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) {
      throw new Error("Sarge impersonation requires a user id");
    }

    const currentOptions = requireOptions("impersonating users");
    ensureProjectUserId(currentOptions.siteId);
    localStore.set(impersonationStorageKey(currentOptions.siteId), trimmedUserId);
  };

  const clearImpersonation = () => {
    const currentOptions = requireOptions("clearing impersonation");
    localStore.remove(impersonationStorageKey(currentOptions.siteId));
  };

  const refreshAttribution = (siteId: string, attributionTtlDays: number) => {
    localStore.set(sessionStorageKey, browser.crypto.randomUUID());
    ensureProjectUserId(siteId);

    const params = new URLSearchParams(browser.location.search);
    const ref = params.get("sarge_ref");
    const aff = params.get("sarge_aff");
    const hasCurrentAttribution = Boolean(ref || aff);
    const existingExpiration = localStore.get(expirationStorageKey);
    if (!hasCurrentAttribution && existingExpiration && Date.parse(existingExpiration) > getNow().getTime()) {
      return;
    }

    if (!hasCurrentAttribution) {
      localStore.remove(refStorageKey);
      localStore.remove(affiliateStorageKey);
      localStore.remove(expirationStorageKey);
      return;
    }

    localStore.remove(refStorageKey);
    localStore.remove(affiliateStorageKey);
    if (ref) {
      localStore.set(refStorageKey, ref);
    }

    if (aff) {
      localStore.set(affiliateStorageKey, aff);
    }

    localStore.set(expirationStorageKey, addDays(getNow(), attributionTtlDays).toISOString());
  };

  const buildPayload = (siteId: string, name: string, properties?: EventProperties): EventPayload => {
    const ref = localStore.get(refStorageKey) ?? undefined;
    const aff = localStore.get(affiliateStorageKey) ?? undefined;
    const expiresAt = localStore.get(expirationStorageKey) ?? undefined;
    const sessionId = localStore.get(sessionStorageKey) ?? browser.crypto.randomUUID();
    const testerUserId = ensureProjectUserId(siteId);
    const impersonatedUserId = localStore.get(impersonationStorageKey(siteId)) ?? undefined;
    const userId = impersonatedUserId ?? testerUserId;

    if (!localStore.get(sessionStorageKey)) {
      localStore.set(sessionStorageKey, sessionId);
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
      properties: mergeImpersonationProperties(properties, testerUserId, impersonatedUserId)
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

  const ensureProjectUserId = (siteId: string) => {
    const key = userStorageKey(siteId);
    const existingUserId = localStore.get(key);
    if (existingUserId) return existingUserId;

    const userId = browser.crypto.randomUUID();
    localStore.set(key, userId);
    return userId;
  };

  const requireOptions = (action: string) => {
    if (!options) {
      throw new Error(`Sarge must be initialized before ${action}`);
    }

    return options;
  };

  return {
    init,
    track,
    impersonate,
    clearImpersonation
  };
};

const mergeImpersonationProperties = (
  properties: EventProperties | undefined,
  testerUserId: string,
  impersonatedUserId: string | undefined
) => {
  if (!impersonatedUserId) return properties;

  return {
    ...properties,
    sarge_test: true,
    sarge_test_mode: "impersonation",
    sarge_tester_user_id: testerUserId,
    sarge_impersonated_user_id: impersonatedUserId
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
