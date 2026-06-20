CREATE TABLE "DiagnosticRun" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "eventWindowStart" TIMESTAMP(3) NOT NULL,
  "eventWindowEnd" TIMESTAMP(3) NOT NULL,
  "findingCount" INTEGER NOT NULL DEFAULT 0,
  "aiSummary" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DiagnosticRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiagnosticFinding" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "recommendation" TEXT NOT NULL,
  "agentPrompt" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DiagnosticFinding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiagnosticRun_siteId_createdAt_idx" ON "DiagnosticRun"("siteId", "createdAt");
CREATE INDEX "DiagnosticRun_status_createdAt_idx" ON "DiagnosticRun"("status", "createdAt");
CREATE INDEX "DiagnosticFinding_siteId_createdAt_idx" ON "DiagnosticFinding"("siteId", "createdAt");
CREATE INDEX "DiagnosticFinding_runId_idx" ON "DiagnosticFinding"("runId");
CREATE INDEX "DiagnosticFinding_ruleId_severity_idx" ON "DiagnosticFinding"("ruleId", "severity");

ALTER TABLE "DiagnosticRun"
  ADD CONSTRAINT "DiagnosticRun_siteId_fkey"
  FOREIGN KEY ("siteId")
  REFERENCES "Site"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "DiagnosticFinding"
  ADD CONSTRAINT "DiagnosticFinding_runId_fkey"
  FOREIGN KEY ("runId")
  REFERENCES "DiagnosticRun"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "DiagnosticFinding"
  ADD CONSTRAINT "DiagnosticFinding_siteId_fkey"
  FOREIGN KEY ("siteId")
  REFERENCES "Site"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
