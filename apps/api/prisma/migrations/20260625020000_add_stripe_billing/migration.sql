ALTER TABLE "Workspace"
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "stripePriceId" TEXT;

CREATE UNIQUE INDEX "Workspace_stripeCustomerId_key"
  ON "Workspace" ("stripeCustomerId")
  WHERE "stripeCustomerId" IS NOT NULL;

CREATE UNIQUE INDEX "Workspace_stripeSubscriptionId_key"
  ON "Workspace" ("stripeSubscriptionId")
  WHERE "stripeSubscriptionId" IS NOT NULL;
