export interface EventHostMatchInput {
  url?: string | null;
  referrer?: string | null;
}

export const normalizeConfiguredEventHost = (value: string | null | undefined): string | null => {
  if (!value?.trim()) return null;

  const rawValue = value.trim();
  const hostValue = rawValue.includes("://") ? rawValue : `https://${rawValue}`;

  try {
    const host = new URL(hostValue).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
};

export const eventMatchesConfiguredHost = (
  event: EventHostMatchInput,
  configuredHost: string | null | undefined,
): boolean => {
  const expectedHost = normalizeConfiguredEventHost(configuredHost);
  if (!expectedHost) return false;

  const eventHost = normalizeConfiguredEventHost(event.url) ?? normalizeConfiguredEventHost(event.referrer);
  if (!eventHost) return true;

  return eventHost === expectedHost;
};
