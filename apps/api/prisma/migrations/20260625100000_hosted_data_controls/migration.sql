CREATE TABLE "WorkspacePrivacySettings" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "piiRedactionEnabled" BOOLEAN NOT NULL DEFAULT true,
  "propertyPolicyMode" TEXT NOT NULL DEFAULT 'blocklist',
  "blockedPropertyKeys" JSONB NOT NULL DEFAULT '[]',
  "allowedPropertyKeys" JSONB NOT NULL DEFAULT '[]',
  "customRedactionKeys" JSONB NOT NULL DEFAULT '[]',
  "customRedactionPatterns" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkspacePrivacySettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SitePrivacySettings" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "piiRedactionEnabled" BOOLEAN,
  "propertyPolicyMode" TEXT,
  "blockedPropertyKeys" JSONB,
  "allowedPropertyKeys" JSONB,
  "customRedactionKeys" JSONB,
  "customRedactionPatterns" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SitePrivacySettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeletionRequest" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "targetWorkspaceId" TEXT,
  "targetSiteId" TEXT,
  "requestedByUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspacePrivacySettings_workspaceId_key" ON "WorkspacePrivacySettings"("workspaceId");
CREATE UNIQUE INDEX "SitePrivacySettings_siteId_key" ON "SitePrivacySettings"("siteId");
CREATE INDEX "DeletionRequest_status_createdAt_idx" ON "DeletionRequest"("status", "createdAt");
CREATE INDEX "DeletionRequest_targetWorkspaceId_idx" ON "DeletionRequest"("targetWorkspaceId");
CREATE INDEX "DeletionRequest_targetSiteId_idx" ON "DeletionRequest"("targetSiteId");
CREATE INDEX "DeletionRequest_requestedByUserId_idx" ON "DeletionRequest"("requestedByUserId");

ALTER TABLE "WorkspacePrivacySettings"
  ADD CONSTRAINT "WorkspacePrivacySettings_workspaceId_fkey"
  FOREIGN KEY ("workspaceId")
  REFERENCES "Workspace"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "SitePrivacySettings"
  ADD CONSTRAINT "SitePrivacySettings_siteId_fkey"
  FOREIGN KEY ("siteId")
  REFERENCES "Site"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
