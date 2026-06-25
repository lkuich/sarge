import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(__dirname, "migration.sql");
const schemaPath = join(__dirname, "..", "..", "schema.prisma");

describe("workspace legal acceptance migration", () => {
  it("stores the current terms and privacy acceptance metadata on workspaces", () => {
    const migration = readFileSync(migrationPath, "utf8");
    const schema = readFileSync(schemaPath, "utf8");

    for (const column of [
      '"termsAcceptedAt"',
      '"termsAcceptedVersion"',
      '"privacyAcceptedVersion"',
      '"termsAcceptedIp"',
      '"termsAcceptedUserAgent"',
    ]) {
      expect(migration).toContain(column);
    }

    expect(schema).toContain("termsAcceptedAt");
    expect(schema).toContain("termsAcceptedVersion");
    expect(schema).toContain("privacyAcceptedVersion");
    expect(schema).toContain("termsAcceptedIp");
    expect(schema).toContain("termsAcceptedUserAgent");
  });
});
