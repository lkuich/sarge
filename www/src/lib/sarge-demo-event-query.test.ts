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
});
