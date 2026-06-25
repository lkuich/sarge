import type { TrackedPageCandidate, TrackedPageHealthResult } from "@sarge/core";

type Fetcher = typeof fetch;

export interface CheckTrackedPageHealthOptions {
  url: string;
  eventCount?: number;
  conversionLike?: boolean;
  timeoutMs?: number;
  fetcher?: Fetcher;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const USER_AGENT = "Sarge Page Monitoring/1.0";

export const checkTrackedPageHealth = async (
  options: CheckTrackedPageHealthOptions
): Promise<TrackedPageHealthResult> => {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const headResult = await requestPage(fetcher, options.url, "HEAD", timeoutMs);
  if (shouldFallbackToGet(headResult.status)) {
    return requestPage(fetcher, options.url, "GET", timeoutMs, options);
  }

  return {
    ...headResult,
    eventCount: options.eventCount,
    conversionLike: options.conversionLike
  };
};

export const checkTrackedPageCandidates = async (
  candidates: TrackedPageCandidate[],
  options: { timeoutMs?: number; fetcher?: Fetcher } = {}
) => {
  const results: TrackedPageHealthResult[] = [];

  for (const candidate of candidates) {
    results.push(
      await checkTrackedPageHealth({
        url: candidate.url,
        eventCount: candidate.eventCount,
        conversionLike: candidate.conversionLike,
        timeoutMs: options.timeoutMs,
        fetcher: options.fetcher
      })
    );
  }

  return results;
};

const requestPage = async (
  fetcher: Fetcher,
  url: string,
  method: "HEAD" | "GET",
  timeoutMs: number,
  metadata: Pick<TrackedPageHealthResult, "eventCount" | "conversionLike"> = {}
): Promise<TrackedPageHealthResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await fetcher(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml"
      }
    });

    return {
      url,
      status: response.status,
      finalUrl: response.url || url,
      eventCount: metadata.eventCount,
      conversionLike: metadata.conversionLike
    };
  } catch (error) {
    return {
      url,
      error: isTimeoutError(error) ? "timeout" : "network",
      eventCount: metadata.eventCount,
      conversionLike: metadata.conversionLike
    };
  } finally {
    clearTimeout(timeout);
  }
};

const shouldFallbackToGet = (status: number | undefined) =>
  status === 403 || status === 405 || status === 501;

const isTimeoutError = (error: unknown) => {
  if (error === "timeout") return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error && typeof error === "object" && "name" in error) {
    return (error as { name?: string }).name === "AbortError";
  }
  return false;
};
