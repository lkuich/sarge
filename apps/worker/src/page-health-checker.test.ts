import { describe, expect, it, vi } from "vitest";
import { checkTrackedPageCandidates, checkTrackedPageHealth } from "./page-health-checker.js";

const response = (status: number, url = "https://shop.example.com/page") => {
  const result = new Response(null, { status, headers: { "content-type": "text/html" } });
  Object.defineProperty(result, "url", { value: url });
  return result as Response & { url: string };
};

const candidate = (index: number) => ({
  url: `https://shop.example.com/page-${index}`,
  eventCount: index + 1,
  latestEventAt: `2026-06-19T12:0${index}:00.000Z`,
  conversionLike: index % 2 === 0
});

describe("page health checker", () => {
  it("checks pages with HEAD first", async () => {
    const fetcher = vi.fn(async () => response(200));

    const result = await checkTrackedPageHealth({
      url: "https://shop.example.com/page",
      fetcher
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://shop.example.com/page",
      expect.objectContaining({
        method: "HEAD",
        redirect: "follow"
      })
    );
    expect(result).toMatchObject({ url: "https://shop.example.com/page", status: 200 });
  });

  it("falls back to GET when HEAD is method-specific", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(405))
      .mockResolvedValueOnce(response(200));

    const result = await checkTrackedPageHealth({
      url: "https://shop.example.com/page",
      fetcher
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1]).toEqual(expect.objectContaining({ method: "GET" }));
    expect(result).toMatchObject({ status: 200 });
  });

  it("reports timeout errors", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      init?.signal?.throwIfAborted();
      return response(200);
    });

    const result = await checkTrackedPageHealth({
      url: "https://shop.example.com/slow",
      timeoutMs: 1,
      fetcher
    });

    expect(result).toMatchObject({
      url: "https://shop.example.com/slow",
      error: "timeout"
    });
  });

  it("reports network errors", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    const result = await checkTrackedPageHealth({
      url: "https://shop.example.com/down",
      fetcher
    });

    expect(result).toMatchObject({
      url: "https://shop.example.com/down",
      error: "network"
    });
  });

  it("checks all candidates and preserves candidate metadata", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => response(200, `${String(input)}/final`));

    const results = await checkTrackedPageCandidates(
      [
        {
          url: "https://shop.example.com/product",
          eventCount: 3,
          latestEventAt: "2026-06-19T12:00:00.000Z",
          conversionLike: false
        },
        {
          url: "https://shop.example.com/checkout",
          eventCount: 7,
          latestEventAt: "2026-06-19T12:05:00.000Z",
          conversionLike: true
        }
      ],
      { fetcher }
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls).toEqual([
      [
        "https://shop.example.com/product",
        expect.objectContaining({
          method: "HEAD",
          redirect: "follow"
        })
      ],
      [
        "https://shop.example.com/checkout",
        expect.objectContaining({
          method: "HEAD",
          redirect: "follow"
        })
      ]
    ]);
    expect(results).toEqual([
      expect.objectContaining({
        url: "https://shop.example.com/product",
        status: 200,
        finalUrl: "https://shop.example.com/product/final",
        eventCount: 3,
        conversionLike: false
      }),
      expect.objectContaining({
        url: "https://shop.example.com/checkout",
        status: 200,
        finalUrl: "https://shop.example.com/checkout/final",
        eventCount: 7,
        conversionLike: true
      })
    ]);
  });

  it("checks candidate batches with bounded concurrency while preserving result order", async () => {
    const candidates = Array.from({ length: 6 }, (_, index) => candidate(index));
    const pending = new Map<string, { resolve: (response: Response) => void }>();
    const started: string[] = [];
    let active = 0;
    let maxActive = 0;
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      started.push(url);
      active += 1;
      maxActive = Math.max(maxActive, active);

      return new Promise<Response>((resolve) => {
        pending.set(url, {
          resolve: (pageResponse) => {
            active -= 1;
            resolve(pageResponse);
          }
        });
      });
    });

    const resultsPromise = checkTrackedPageCandidates(candidates, { fetcher });
    await Promise.resolve();

    expect(started).toEqual(candidates.slice(0, 5).map((item) => item.url));
    expect(maxActive).toBe(5);

    pending.get(candidates[0].url)?.resolve(response(200, `${candidates[0].url}/final`));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(started).toEqual(candidates.map((item) => item.url));

    for (const current of candidates.slice(1)) {
      pending.get(current.url)?.resolve(response(200, `${current.url}/final`));
    }

    const results = await resultsPromise;

    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(results).toEqual(
      candidates.map((current) =>
        expect.objectContaining({
          url: current.url,
          status: 200,
          finalUrl: `${current.url}/final`,
          eventCount: current.eventCount,
          conversionLike: current.conversionLike
        })
      )
    );
  });
});
