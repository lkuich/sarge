ALTER TABLE "Workspace"
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "termsAcceptedVersion" TEXT,
  ADD COLUMN "privacyAcceptedVersion" TEXT,
  ADD COLUMN "termsAcceptedIp" TEXT,
  ADD COLUMN "termsAcceptedUserAgent" TEXT;
