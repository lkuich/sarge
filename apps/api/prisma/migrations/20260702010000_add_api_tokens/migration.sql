CREATE TABLE "ApiToken" (
  "id" TEXT NOT NULL,
  "siteEnvironmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX "ApiToken_siteEnvironmentId_createdAt_idx" ON "ApiToken"("siteEnvironmentId", "createdAt");
CREATE INDEX "ApiToken_scope_revokedAt_idx" ON "ApiToken"("scope", "revokedAt");

ALTER TABLE "ApiToken"
  ADD CONSTRAINT "ApiToken_siteEnvironmentId_fkey"
  FOREIGN KEY ("siteEnvironmentId") REFERENCES "SiteEnvironment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
