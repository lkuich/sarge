CREATE TABLE "ManagementToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdByUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3)
);
CREATE INDEX "ManagementToken_workspaceId_createdAt_idx" ON "ManagementToken"("workspaceId", "createdAt");
