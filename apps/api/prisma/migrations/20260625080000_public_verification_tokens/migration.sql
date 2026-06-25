CREATE TABLE "PublicVerificationToken" (
  "id" TEXT NOT NULL,
  "siteEnvironmentId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PublicVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicVerificationToken_siteEnvironmentId_expiresAt_idx" ON "PublicVerificationToken"("siteEnvironmentId", "expiresAt");
CREATE INDEX "PublicVerificationToken_expiresAt_idx" ON "PublicVerificationToken"("expiresAt");

ALTER TABLE "PublicVerificationToken"
  ADD CONSTRAINT "PublicVerificationToken_siteEnvironmentId_fkey"
  FOREIGN KEY ("siteEnvironmentId") REFERENCES "SiteEnvironment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
