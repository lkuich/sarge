export interface EventHostInput {
  occurredAt: string;
  url?: string;
  referrer?: string;
}

export interface EventHostSummary {
  host: string;
  count: number;
  lastEventAt: string;
}

export const summarizeEventHosts = (events: EventHostInput[]): EventHostSummary[] => {
  const hosts = new Map<string, { count: number; lastEventAt: string }>();

  for (const event of events.slice(0, 10)) {
    const host = getHost(event.url) ?? getHost(event.referrer);
    if (!host) continue;

    const existing = hosts.get(host);
    if (!existing) {
      hosts.set(host, { count: 1, lastEventAt: event.occurredAt });
      continue;
    }

    existing.count += 1;
    if (new Date(event.occurredAt).getTime() > new Date(existing.lastEventAt).getTime()) {
      existing.lastEventAt = event.occurredAt;
    }
  }

  return Array.from(hosts.entries()).map(([host, summary]) => ({ host, ...summary }));
};

const getHost = (value: string | undefined) => {
  if (!value) return null;

  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
};
