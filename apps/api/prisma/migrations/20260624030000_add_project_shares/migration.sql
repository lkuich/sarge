CREATE TABLE "ProjectShare" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "invitedByUserId" TEXT NOT NULL,
  "acceptedUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),

  CONSTRAINT "ProjectShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectShare_siteId_email_key" ON "ProjectShare"("siteId", "email");
CREATE INDEX "ProjectShare_email_idx" ON "ProjectShare"("email");
CREATE INDEX "ProjectShare_acceptedUserId_idx" ON "ProjectShare"("acceptedUserId");

ALTER TABLE "ProjectShare"
  ADD CONSTRAINT "ProjectShare_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
