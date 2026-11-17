import { z } from "zod";
import type { DiagnosticFinding } from "./diagnostics.js";

export interface DiagnosticSummaryRequest {
  instructions: string;
  input: string;
}

export type DiagnosticSummaryProvider = (request: DiagnosticSummaryRequest) => Promise<string | null>;

const SUMMARY_INSTRUCTIONS = "You summarize Sarge tracking diagnostics for a technical marketer or engineer. Return concise Markdown, at most 80 words total. Use 2-4 bullets, cite only supplied evidence, avoid a Summary heading, and end with the most useful agentic coding prompt.";

// Only the outbound copy is redacted; stored evidence and copyable agent prompts stay intact.
// shortcut: redaction follows current finding templates; extend it when adding customer-derived fields.
const summaryText = (text: string) => text
  .replace(/^Session [\s\S]*$/, "A session started checkout with no purchase event.")
  .replace(/^Order [\s\S]* appeared (\d+) times\.$/, "An order appeared $1 times.")
  .replace(/ in session [\s\S]*$/, " in a session.")
  .split(" Implementation note:")[0]
  .split("\n\nImplementation notes from Sarge watchdog events:")[0]
  .replace(/https?:\/\/[^\s]+/g, "[tracked page]");

export const summarizeDiagnosticFindings = async (
  findings: readonly (DiagnosticFinding & { ruleId?: string })[],
  provider: DiagnosticSummaryProvider,
): Promise<string | null> => {
  if (findings.length === 0) return null;

  try {
    return (await provider({
      instructions: SUMMARY_INSTRUCTIONS,
      input: JSON.stringify({
        findings: findings.map((finding) => ({
          ruleId: (finding.ruleId ?? finding.id).split(":")[0],
          severity: finding.severity,
          title: summaryText(finding.title),
          summary: summaryText(finding.summary),
          evidence: finding.evidence.map(summaryText),
          recommendation: summaryText(finding.recommendation),
          agentPrompt: summaryText(finding.agentPrompt),
        })),
      }),
    }))?.trim() || null;
  } catch {
    // Provider errors may contain credentials or customer data; never log their bodies.
    console.error("Unable to summarize diagnostic findings; using deterministic findings");
    return null;
  }
};

const responseSchema = z.object({
  status: z.literal("completed"),
  output: z.array(z.object({
    type: z.string(),
    role: z.string().optional(),
    content: z.array(z.object({
      type: z.literal("output_text"),
      text: z.string().trim().min(1),
    })).optional(),
  })),
});

export const createOpenAiSummaryProvider = (
  apiKey: string | undefined,
  model?: string,
): DiagnosticSummaryProvider => async (request) => {
  if (!apiKey?.trim()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: model?.trim() || "gpt-6-luna",
        ...request,
        store: false,
        reasoning: { effort: "none" },
        max_output_tokens: 300,
      }),
    });
    if (!response.ok) {
      console.error("OpenAI diagnostic summary request failed", { status: response.status });
      await response.body?.cancel();
      return null;
    }

    const result = responseSchema.parse(await response.json());
    return result.output
      .filter((item) => item.type === "message" && item.role === "assistant")
      .flatMap((item) => item.content ?? [])
      .filter((content) => content.type === "output_text")
      .map((content) => content.text ?? "")
      .join("\n").trim() || null;
  } finally {
    clearTimeout(timeout);
  }
};
