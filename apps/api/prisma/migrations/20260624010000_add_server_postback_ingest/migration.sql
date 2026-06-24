ALTER TABLE "Site"
  ADD COLUMN "serverEventSecretHash" TEXT,
  ADD COLUMN "postbackTokenHash" TEXT;

ALTER TABLE "Event"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'browser';

CREATE INDEX "Event_siteId_source_occurredAt_idx" ON "Event"("siteId", "source", "occurredAt");
