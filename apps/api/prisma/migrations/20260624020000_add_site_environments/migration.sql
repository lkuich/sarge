CREATE TABLE "SiteEnvironment" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "endpointHost" TEXT NOT NULL,
  "attributionTtlDays" INTEGER NOT NULL DEFAULT 28,
  "pixelEnabled" BOOLEAN NOT NULL DEFAULT true,
  "serverEventSecretHash" TEXT,
  "postbackTokenHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SiteEnvironment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteEnvironment_endpointHost_key" ON "SiteEnvironment"("endpointHost");
CREATE UNIQUE INDEX "SiteEnvironment_siteId_environment_key" ON "SiteEnvironment"("siteId", "environment");
CREATE INDEX "SiteEnvironment_environment_pixelEnabled_idx" ON "SiteEnvironment"("environment", "pixelEnabled");

ALTER TABLE "SiteEnvironment"
  ADD CONSTRAINT "SiteEnvironment_siteId_fkey"
  FOREIGN KEY ("siteId")
  REFERENCES "Site"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

INSERT INTO "SiteEnvironment" (
  "id",
  "siteId",
  "environment",
  "endpointHost",
  "attributionTtlDays",
  "pixelEnabled",
  "serverEventSecretHash",
  "postbackTokenHash",
  "createdAt"
)
SELECT
  s.id || '_production',
  s.id,
  'production',
  s."endpointHost",
  s."attributionTtlDays",
  s."pixelEnabled",
  s."serverEventSecretHash",
  s."postbackTokenHash",
  s."createdAt"
FROM "Site" s;

INSERT INTO "SiteEnvironment" (
  "id",
  "siteId",
  "environment",
  "endpointHost",
  "attributionTtlDays",
  "pixelEnabled",
  "createdAt"
)
SELECT
  s.id || '_' || env.environment,
  s.id,
  env.environment,
  s.slug || '-' || env.environment || '-' || right(regexp_replace(s."workspaceId", '[^a-zA-Z0-9]', '', 'g'), 8) || '.sargetrack.app',
  s."attributionTtlDays",
  true,
  s."createdAt"
FROM "Site" s
CROSS JOIN (VALUES ('staging'), ('development')) AS env(environment);

ALTER TABLE "Event" ADD COLUMN "siteEnvironmentId" TEXT;
UPDATE "Event" SET "siteEnvironmentId" = "siteId" || '_production';
ALTER TABLE "Event" ALTER COLUMN "siteEnvironmentId" SET NOT NULL;

ALTER TABLE "DiagnosticRun" ADD COLUMN "siteEnvironmentId" TEXT;
UPDATE "DiagnosticRun" SET "siteEnvironmentId" = "siteId" || '_production';
ALTER TABLE "DiagnosticRun" ALTER COLUMN "siteEnvironmentId" SET NOT NULL;

ALTER TABLE "DiagnosticFinding" ADD COLUMN "siteEnvironmentId" TEXT;
UPDATE "DiagnosticFinding" SET "siteEnvironmentId" = "siteId" || '_production';
ALTER TABLE "DiagnosticFinding" ALTER COLUMN "siteEnvironmentId" SET NOT NULL;

ALTER TABLE "WebhookEndpoint" ADD COLUMN "siteEnvironmentId" TEXT;
UPDATE "WebhookEndpoint" SET "siteEnvironmentId" = "siteId" || '_production';
ALTER TABLE "WebhookEndpoint" ALTER COLUMN "siteEnvironmentId" SET NOT NULL;

CREATE INDEX "Event_siteEnvironmentId_occurredAt_idx" ON "Event"("siteEnvironmentId", "occurredAt");
CREATE INDEX "DiagnosticRun_siteEnvironmentId_createdAt_idx" ON "DiagnosticRun"("siteEnvironmentId", "createdAt");
CREATE INDEX "DiagnosticFinding_siteEnvironmentId_createdAt_idx" ON "DiagnosticFinding"("siteEnvironmentId", "createdAt");
CREATE INDEX "WebhookEndpoint_siteEnvironmentId_createdAt_idx" ON "WebhookEndpoint"("siteEnvironmentId", "createdAt");

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_siteEnvironmentId_fkey"
  FOREIGN KEY ("siteEnvironmentId")
  REFERENCES "SiteEnvironment"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "DiagnosticRun"
  ADD CONSTRAINT "DiagnosticRun_siteEnvironmentId_fkey"
  FOREIGN KEY ("siteEnvironmentId")
  REFERENCES "SiteEnvironment"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "DiagnosticFinding"
  ADD CONSTRAINT "DiagnosticFinding_siteEnvironmentId_fkey"
  FOREIGN KEY ("siteEnvironmentId")
  REFERENCES "SiteEnvironment"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "WebhookEndpoint"
  ADD CONSTRAINT "WebhookEndpoint_siteEnvironmentId_fkey"
  FOREIGN KEY ("siteEnvironmentId")
  REFERENCES "SiteEnvironment"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
