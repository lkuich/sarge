ALTER TABLE "Workspace"
  ADD COLUMN "clerkOrganizationId" TEXT;

DROP INDEX IF EXISTS "Workspace_ownerUserId_key";

CREATE UNIQUE INDEX "Workspace_clerkOrganizationId_key"
  ON "Workspace"("clerkOrganizationId");
