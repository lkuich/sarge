ALTER TABLE "Workspace"
  ADD COLUMN "ownerUserId" TEXT;

CREATE UNIQUE INDEX "Workspace_ownerUserId_key" ON "Workspace"("ownerUserId");

DROP INDEX "Site_slug_key";

CREATE UNIQUE INDEX "Site_workspaceId_slug_key" ON "Site"("workspaceId", "slug");
