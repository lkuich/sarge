import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("drop site slug migration", () => {
  it("drops project slug storage after removing the workspace-scoped unique index", () => {
    const migration = readFileSync("apps/api/prisma/migrations/20260625070000_drop_site_slug/migration.sql", "utf8");
    const schema = readFileSync("apps/api/prisma/schema.prisma", "utf8");
    const siteModel = schema.slice(schema.indexOf("model Site {"), schema.indexOf("model SiteEnvironment"));

    expect(migration).toContain('DROP INDEX "Site_workspaceId_slug_key"');
    expect(migration.indexOf('DROP INDEX "Site_workspaceId_slug_key"')).toBeLessThan(
      migration.indexOf('ALTER TABLE "Site" DROP COLUMN "slug"'),
    );
    expect(siteModel).not.toContain("slug");
    expect(siteModel).not.toContain("@@unique([workspaceId, slug])");
  });
});
