CREATE TABLE "Client" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
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

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_siteId_fkey"
  FOREIGN KEY ("siteId")
  REFERENCES "Client"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
