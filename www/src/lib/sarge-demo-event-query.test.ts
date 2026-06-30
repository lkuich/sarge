import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const readSource = (path: string) => readFileSync(sourcePath(path), "utf8");

describe("project environment event queries", () => {
  it("samples bounded journey windows across the requested time range", () => {
    const demoData = readSource("./sarge-demo.ts");
    const eventStreamApi = readSource("../pages/api/project-events/[environmentId].ts");

    expect(eventStreamApi).toContain('Astro.url.searchParams.get("startAt")');
    expect(eventStreamApi).toContain('Astro.url.searchParams.get("endAt")');
    expect(demoData).toContain("const hasTimeWindow = Boolean(startAt || endAt);");
    expect(demoData).toContain("NTILE(${limit}) OVER (ORDER BY e.\"occurredAt\" ASC)");
    expect(demoData).toContain("DISTINCT ON (sample_bucket)");
  });

  it("filters event traffic and manual AI reviews to the configured project host", () => {
    const demoData = readSource("./sarge-demo.ts");

    expect(demoData).toContain("configuredHostSql");
    expect(demoData).toContain("configuredHostEventSql");
    expect(demoData).toContain("configuredHostEventMixSql");
    expect(demoData).toContain("configuredHostEventTrendSql");
    expect(demoData).toContain('WHERE e."siteEnvironmentId" = ${siteEnvironment.id}');
    expect(demoData).toContain("configuredHostEventSql('e', 's')");
  });

  it("supports one-time manual test marking for a user or session", () => {
    const demoData = readSource("./sarge-demo.ts");
    const markTestApi = readSource("../pages/api/project-events/[environmentId]/mark-test.ts");

    expect(markTestApi).toContain("export const POST");
    expect(markTestApi).toContain("markProjectTrafficAsTest");
    expect(markTestApi).toContain('kind === "user" || kind === "session"');
    expect(markTestApi).toContain("canManageProject(project)");
    expect(markTestApi).toContain('import { env } from "cloudflare:workers";');
    expect(markTestApi).toContain("env.DATABASE_URL");
    expect(markTestApi).not.toContain("runtimeEnv.DATABASE_URL");

    expect(demoData).toContain("export type TestTrafficSubjectKind = 'user' | 'session';");
    expect(demoData).toContain("export const markProjectTrafficAsTest");
    expect(demoData).toContain("jsonb_set");
    expect(demoData).toContain("sarge_test_mode");
    expect(demoData).toContain("manual");
    expect(demoData).toContain('e."userId" = ${subjectId}');
    expect(demoData).toContain('e."sessionId" = ${subjectId}');
  });
});
