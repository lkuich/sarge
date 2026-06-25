import { describe, expect, it, vi } from "vitest";
import { checkTrackedPageHealth } from "./page-health-checker.js";

const response = (status: number, url = "https://shop.example.com/page") =>
  new Response(null, { status, headers: { "content-type": "text/html" } }) as Response & { url: string };

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
});
