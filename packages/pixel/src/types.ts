export interface InitOptions {
  siteId: string;
  endpoint?: string;
  attributionTtlDays?: number;
}

export type EventProperties = Record<string, unknown>;

export interface BrowserLike {
  __SARGE_CONFIG__?: InitOptions;
  location: {
    href: string;
    search: string;
  };
  document: {
    title?: string;
    referrer?: string;
  };
  localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  navigator: {
    sendBeacon?: (url: string, data?: BodyInit | null) => boolean;
  };
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
  Image: new () => { src: string };
  crypto: {
    randomUUID(): string;
  };
  now?: () => Date;
}

export interface EventPayload {
  siteId: string;
  name: string;
  occurredAt: string;
  sessionId: string;
  userId: string;
  attribution?: {
    ref?: string;
    aff?: string;
    expiresAt?: string;
  };
  context?: {
    url?: string;
    referrer?: string;
    title?: string;
  };
  properties?: EventProperties;
}

export interface SargeClient {
  init(options?: InitOptions): void;
  track(name: string, properties?: EventProperties): void;
}
