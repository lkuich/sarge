CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Site" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "endpointHost" TEXT NOT NULL,
  "attributionTtlDays" INTEGER NOT NULL DEFAULT 28,
  "pixelEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Affiliate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rate" DECIMAL(65,30),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Event" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "ref" TEXT,
  "affiliate" TEXT,
  "attributionExpiresAt" TIMESTAMP(3),
  "url" TEXT,
  "referrer" TEXT,
  "title" TEXT,
  "properties" JSONB NOT NULL DEFAULT '{}',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Event_siteId_occurredAt_idx" ON "Event"("siteId", "occurredAt");
CREATE INDEX "Event_name_occurredAt_idx" ON "Event"("name", "occurredAt");
CREATE INDEX "Event_sessionId_idx" ON "Event"("sessionId");
CREATE INDEX "Event_userId_idx" ON "Event"("userId");
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");
CREATE UNIQUE INDEX "Site_slug_key" ON "Site"("slug");
CREATE UNIQUE INDEX "Site_endpointHost_key" ON "Site"("endpointHost");

ALTER TABLE "Site"
  ADD CONSTRAINT "Site_workspaceId_fkey"
  FOREIGN KEY ("workspaceId")
  REFERENCES "Workspace"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_siteId_fkey"
  FOREIGN KEY ("siteId")
  REFERENCES "Site"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
