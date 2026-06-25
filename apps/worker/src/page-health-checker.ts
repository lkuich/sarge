import type { TrackedPageCandidate, TrackedPageHealthResult } from "@sarge/core";

type Fetcher = typeof fetch;

export interface CheckTrackedPageHealthOptions {
  url: string;
  eventCount?: number;
  conversionLike?: boolean;
  timeoutMs?: number;
  fetcher?: Fetcher;
}

interface CheckTrackedPageCandidatesOptions {
  timeoutMs?: number;
  fetcher?: Fetcher;
  concurrency?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_CONCURRENCY = 5;
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
  options: CheckTrackedPageCandidatesOptions = {}
) => {
  const results = new Array<TrackedPageHealthResult>(candidates.length);
  const concurrency = Math.min(normalizeConcurrency(options.concurrency), candidates.length);
  let nextIndex = 0;

  const checkNextCandidate = async () => {
    while (nextIndex < candidates.length) {
      const index = nextIndex;
      nextIndex += 1;
      const candidate = candidates[index];

      results[index] = await checkTrackedPageHealth({
        url: candidate.url,
        eventCount: candidate.eventCount,
        conversionLike: candidate.conversionLike,
        timeoutMs: options.timeoutMs,
        fetcher: options.fetcher
      });
    }
  };

  if (concurrency > 0) {
    await Promise.all(Array.from({ length: concurrency }, checkNextCandidate));
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

const normalizeConcurrency = (concurrency: number | undefined) => {
  if (typeof concurrency !== "number" || !Number.isFinite(concurrency) || concurrency <= 0) {
    return DEFAULT_CONCURRENCY;
  }
  return Math.max(1, Math.floor(concurrency));
};

const isTimeoutError = (error: unknown) => {
  if (error === "timeout") return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error && typeof error === "object" && "name" in error) {
    return (error as { name?: string }).name === "AbortError";
  }
  return false;
};
