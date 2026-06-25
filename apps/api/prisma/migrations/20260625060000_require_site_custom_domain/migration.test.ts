import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("require site custom domains migration", () => {
  it("backfills placeholder subdomains before adding the not-null constraint", () => {
    const migration = readFileSync("apps/api/prisma/migrations/20260625060000_require_site_custom_domain/migration.sql", "utf8");

    expect(migration).toContain('UPDATE "Site"');
    expect(migration).toContain(".placeholder.invalid");
    expect(migration.indexOf('UPDATE "Site"')).toBeLessThan(migration.indexOf('ALTER TABLE "Site" ALTER COLUMN "customDomain" SET NOT NULL'));
  });
});
