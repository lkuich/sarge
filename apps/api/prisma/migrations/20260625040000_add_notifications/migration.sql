CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "siteId" TEXT,
  "siteEnvironmentId" TEXT,
  "userId" TEXT,
  "recipientEmail" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreference_workspaceId_userId_category_key"
  ON "NotificationPreference"("workspaceId", "userId", "category");

CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

CREATE INDEX "NotificationPreference_email_idx" ON "NotificationPreference"("email");

CREATE UNIQUE INDEX "NotificationDelivery_workspaceId_recipientEmail_category_fingerprint_key"
  ON "NotificationDelivery"("workspaceId", "recipientEmail", "category", "fingerprint");

CREATE INDEX "NotificationDelivery_workspaceId_createdAt_idx"
  ON "NotificationDelivery"("workspaceId", "createdAt");

CREATE INDEX "NotificationDelivery_category_status_idx" ON "NotificationDelivery"("category", "status");

CREATE INDEX "NotificationDelivery_siteId_idx" ON "NotificationDelivery"("siteId");

CREATE INDEX "NotificationDelivery_siteEnvironmentId_idx" ON "NotificationDelivery"("siteEnvironmentId");

ALTER TABLE "NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDelivery"
  ADD CONSTRAINT "NotificationDelivery_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
