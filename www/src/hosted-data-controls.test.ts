import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const readSource = (path: string) => readFileSync(sourcePath(path), "utf8");

describe("hosted data controls", () => {
  it("exposes owner data controls for redaction, property policies, and deletion requests", () => {
    const projectDetail = readSource("./pages/app/projects/[projectId].astro");
    const account = readSource("./pages/app/account.astro");
    const demoData = readSource("./lib/sarge-demo.ts");

    expect(projectDetail).toContain("data-project-data-controls");
    expect(projectDetail).toContain('intent === "save-site-privacy-settings"');
    expect(projectDetail).toContain('intent === "request-site-deletion"');
    expect(projectDetail).toContain("PII redaction");
    expect(projectDetail).toContain("Blocked property keys");
    expect(projectDetail).toContain("Allowed property keys");
    expect(projectDetail).toContain("Request site deletion");
    expect(projectDetail).not.toContain("Event hosts");

    expect(account).toContain("data-workspace-data-controls");
    expect(account).toContain('intent === "save-workspace-privacy-settings"');
    expect(account).toContain('intent === "request-workspace-deletion"');
    expect(account).toContain("Request workspace deletion");

    expect(demoData).toContain("loadWorkspacePrivacySettings");
    expect(demoData).toContain("saveWorkspacePrivacySettings");
    expect(demoData).toContain("saveSitePrivacySettings");
    expect(demoData).toContain("createDeletionRequest");
    expect(demoData).toContain("processPendingDeletionRequests");
  });

  it("removes self-hosting from public launch docs and navigation", () => {
    const homepage = readSource("./pages/index.astro");
    const docsIndex = readSource("./pages/docs/index.astro");
    const llms = readSource("../public/llms.txt");
    const llmsFull = readSource("../public/llms-full.txt");

    for (const source of [homepage, docsIndex, llms, llmsFull]) {
      expect(source.toLowerCase()).not.toContain("self-host");
      expect(source).not.toContain("/docs/self-hosting");
    }

    expect(existsSync(sourcePath("./pages/docs/self-hosting.astro"))).toBe(false);
    expect(existsSync(sourcePath("../public/docs/self-hosting.md"))).toBe(false);
  });
});
