ALTER TABLE "Site" ADD COLUMN "customDomain" TEXT;
CREATE UNIQUE INDEX "Site_customDomain_key" ON "Site"("customDomain");
