CREATE TABLE "WebhookEndpoint" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "eventNames" JSONB NOT NULL DEFAULT '[]',
  "signingSecret" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookEndpoint_siteId_createdAt_idx" ON "WebhookEndpoint"("siteId", "createdAt");
CREATE INDEX "WebhookEndpoint_isActive_idx" ON "WebhookEndpoint"("isActive");

ALTER TABLE "WebhookEndpoint"
  ADD CONSTRAINT "WebhookEndpoint_siteId_fkey"
  FOREIGN KEY ("siteId")
  REFERENCES "Site"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
