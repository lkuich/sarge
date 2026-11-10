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
  const expectedHost = normalizeConfiguredEventHost(configuredHost)?.replace(/^sarge\./, "");
  if (!expectedHost) return false;

  const eventHost = normalizeConfiguredEventHost(event.url) ?? normalizeConfiguredEventHost(event.referrer);
  if (!eventHost) return true;

  return eventHost === expectedHost;
};

export const configuredHostEventSql = (eventAlias: 'e' | 'e_mix' | 'e_trend', siteAlias: 's') => {
  // customDomain can be the Sarge collection subdomain, while events come from the tracked website.
  const configuredHost = `regexp_replace(regexp_replace(lower(${siteAlias}."customDomain"), '^www\\.', ''), '^sarge\\.', '')`;
  const capturedHost = `NULLIF(regexp_replace(regexp_replace(coalesce(substring(lower(${eventAlias}.url) from '^[a-z][a-z0-9+.-]*://([^/?#]+)'), substring(lower(${eventAlias}.referrer) from '^[a-z][a-z0-9+.-]*://([^/?#]+)')), '^www\\.', ''), ':\\d+$', ''), '')`;
  return `(${capturedHost} IS NULL OR ${capturedHost} = ${configuredHost})`;
};
