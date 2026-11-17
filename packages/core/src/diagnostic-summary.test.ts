import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeEvents, type DiagnosticEvent } from "./diagnostics.js";
import { buildTrackedPageFinding } from "./tracked-page-monitoring.js";
import { createOpenAiSummaryProvider, summarizeDiagnosticFindings } from "./diagnostic-summary.js";

const event = (name: string, properties = {}): DiagnosticEvent => ({
  name, properties, occurredAt: "2026-11-16T12:00:00Z",
  sessionId: "private-session\nwith whitespace", userId: "private-user",
});
const findings = analyzeEvents([event("checkout.started")]);
const response = (text: unknown = "- Check checkout.\n- Ask an agent to verify purchase tracking.") => ({
  status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
});
const summarize = (key: string | undefined = "test-key", model?: string) =>
  summarizeDiagnosticFindings(findings, createOpenAiSummaryProvider(key, model));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("diagnostic summaries", () => {
  it("uses the direct Responses API, Luna by default, and the existing concise prompt", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(response()));
    vi.stubGlobal("fetch", fetcher);
    expect(await summarize()).toContain("- Check checkout.");
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toMatchObject({
      model: "gpt-6-luna", store: false, reasoning: { effort: "none" }, max_output_tokens: 300,
      instructions: expect.stringContaining("at most 80 words total. Use 2-4 bullets"),
    });
    fetcher.mockResolvedValue(Response.json(response("  - Custom model summary.  ")));
    expect(await summarize("test-key", "custom-model")).toBe("- Custom model summary.");
    expect(JSON.parse(fetcher.mock.calls[1][1].body).model).toBe("custom-model");
  });

  it("redacts customer identifiers, URLs and notes without mutating any findings", async () => {
    const page = buildTrackedPageFinding({ url: "https://private.example/orders/private-order?email=private-email#secret", status: 404, eventCount: 7 })!;
    const privateFindings = [
      ...findings,
      ...analyzeEvents([event("purchase.completed", { order_id: "private-order", value: 1, currency: "USD" }), event("purchase.completed", { order_id: "private-order" })]),
      ...analyzeEvents([event("meta.pixel.fire", { event_name: "Purchase", implementation: { note: "private-email and secret instructions" } })]),
      page,
    ];
    const before = structuredClone(privateFindings);
    const provider = vi.fn().mockResolvedValue("summary");
    await summarizeDiagnosticFindings(privateFindings, provider);
    const input = provider.mock.calls[0][0].input;
    expect(input).not.toMatch(/private-|secret instructions|Implementation note|https:/);
    expect(input).toContain("An order appeared 2 times.");
    expect(input).toContain("[tracked page] returned HTTP 404");
    expect(input).toContain("Sarge observed 7 recent event(s)");
    expect(input).toContain("critical");
    expect(input).toContain("purchase.completed");
    expect(privateFindings).toEqual(before);
  });

  it("does not call OpenAI without a key or findings", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await summarize(" ")).toBeNull();
    expect(await summarizeDiagnosticFindings(findings, createOpenAiSummaryProvider(undefined))).toBeNull();
    expect(await summarizeDiagnosticFindings([], createOpenAiSummaryProvider("test-key"))).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 429, 500, 503])("falls back on HTTP %s without logging response bodies", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private-body", { status })));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await summarize()).toBeNull();
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-body");
  });

  it.each([null, {}, response(""), response("  "), response(42), { ...response(), status: "incomplete" },
    { ...response(), output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "No" }] }] },
  ])("falls back on malformed, incomplete, refused or empty responses: %j", async (body) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    expect(await summarize()).toBeNull();
  });

  it("falls back on invalid JSON and network failure without logging errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("not json")).mockRejectedValueOnce(new Error("private-key"));
    vi.stubGlobal("fetch", fetcher);
    expect(await summarize()).toBeNull();
    expect(await summarize()).toBeNull();
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-key");
  });

  it("aborts a stalled response body after 10 seconds and preserves fallback", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let signal: AbortSignal;
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      signal = init.signal;
      return { ok: true, json: () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) };
    }));
    const pending = summarize();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();
    expect(signal!.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
