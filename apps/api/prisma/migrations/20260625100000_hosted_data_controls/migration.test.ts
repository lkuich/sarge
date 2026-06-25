import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = () => readFileSync(join(__dirname, "migration.sql"), "utf8");
const schema = () => readFileSync(join(__dirname, "..", "..", "schema.prisma"), "utf8");

describe("hosted data controls migration", () => {
  it("adds privacy settings and async deletion request models", () => {
    const migrationSql = migration();
    const schemaPrisma = schema();

    for (const name of ["WorkspacePrivacySettings", "SitePrivacySettings", "DeletionRequest"]) {
      expect(schemaPrisma).toContain(`model ${name}`);
      expect(migrationSql).toContain(`"${name}"`);
    }

    expect(schemaPrisma).toContain('propertyPolicyMode');
    expect(schemaPrisma).toContain('piiRedactionEnabled');
    expect(schemaPrisma).toContain('blockedPropertyKeys');
    expect(schemaPrisma).toContain('allowedPropertyKeys');
    expect(schemaPrisma).toContain('customRedactionKeys');
    expect(schemaPrisma).toContain('customRedactionPatterns');
    expect(schemaPrisma).toContain('@@index([status, createdAt])');
  });
});
