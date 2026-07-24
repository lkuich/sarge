import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("./migration.sql", import.meta.url), "utf8");

describe("Clerk organization workspace migration", () => {
  it("adds unique organization ownership and allows users to own multiple organization workspaces", () => {
    expect(migration).toContain('ADD COLUMN "clerkOrganizationId" TEXT');
    expect(migration).toContain('DROP INDEX IF EXISTS "Workspace_ownerUserId_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "Workspace_clerkOrganizationId_key"');
  });
});
