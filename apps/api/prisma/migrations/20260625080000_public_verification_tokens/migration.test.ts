import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public verification token migration", () => {
  it("stores short-lived public verify tokens as hashes scoped to site environments", () => {
    const migration = readFileSync("apps/api/prisma/migrations/20260625080000_public_verification_tokens/migration.sql", "utf8");
    const schema = readFileSync("apps/api/prisma/schema.prisma", "utf8");

    expect(migration).toContain('CREATE TABLE "PublicVerificationToken"');
    expect(migration).toContain('"siteEnvironmentId" TEXT NOT NULL');
    expect(migration).toContain('"tokenHash" TEXT NOT NULL');
    expect(migration).toContain('"expiresAt" TIMESTAMP(3) NOT NULL');
    expect(migration).toContain('CREATE INDEX "PublicVerificationToken_siteEnvironmentId_expiresAt_idx"');
    expect(migration).toContain('FOREIGN KEY ("siteEnvironmentId") REFERENCES "SiteEnvironment"("id") ON DELETE CASCADE');

    expect(schema).toContain("model PublicVerificationToken");
    expect(schema).toContain("tokenHash         String");
    expect(schema).toContain("expiresAt         DateTime");
    expect(schema).toContain("siteEnvironment   SiteEnvironment");
    expect(schema).toContain("@@index([siteEnvironmentId, expiresAt])");
  });
});
