# Pricing and Feature Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Implementation note: code, tests, build, typecheck, and diff review were completed in the working tree. Commit steps are intentionally left unchecked because the user explicitly requested no commit or push.

**Goal:** Implement Sarge pricing tiers, entitlement gates, usage limits, and upgrade surfaces around the recommended Free, Starter, Growth, Scale, and Enterprise packaging.

**Architecture:** Keep billing decisions centralized in a small entitlement module before adding any payment provider. Store the selected workspace plan and basic usage counters in Postgres, expose entitlement state through `getViewerAccount()`, and have Astro pages render disabled controls, upgrade prompts, and plan-limit copy from the same source of truth.

**Tech Stack:** Astro 6, React 19 islands where interactive dialogs are needed, Neon SQL, Prisma migrations, TypeScript service helpers in `www/src/lib/sarge-demo.ts`, Vitest source tests, existing shadcn-style components. Payment provider integration is explicitly deferred until the entitlement model and UI gates are shipped.

---

## Pricing Model To Implement

| Plan | Monthly price | Core limits | Primary buyer |
| --- | ---: | --- | --- |
| Free | `$0` | 1 project, 50k events/month, 7-day retention, basic install/debug/verify, default 28-day attribution | solo evaluator |
| Starter | `$49` | 3 projects, 250k events/month, 30-day retention, 1 server secret, 1 postback token, 3 webhooks, view-only sharing | small team validating tracking |
| Growth | `$149` | 10 projects, 2M events/month, 90-day retention, configurable attribution windows, AI Production review, edit/view sharing, exports, alerts | ecommerce team with real traffic |
| Scale | `$399` | 25 projects, 10M events/month, 180-day retention, client workspaces, unlimited webhooks, multiple postback tokens, scheduled AI audits, API export | agency or multi-brand team |
| Enterprise | custom | custom volume, 1-year+ retention, dedicated endpoint, SSO/SAML, audit logs, RBAC, warehouse sync, SLA, security review | procurement/security buyer |

Market anchors used for this packaging:
- PostHog pricing: https://posthog.com/pricing
- Segment usage model: https://www.twilio.com/docs/segment/guides/usage-and-billing/mtus-and-throughput
- Triple Whale pricing/package positioning: https://www.triplewhale.com/pricing
- Attribution platform comparison/pricing context: https://www.cometly.com/post/triple-whale-vs-attribution-platforms

---

### Task 1: Central Plan Definitions and Entitlement Tests

**Files:**
- Create: `www/src/lib/pricing.ts`
- Create: `www/src/lib/pricing.test.ts`
- Modify: `www/src/lib/sarge-demo.ts`

- [x] **Step 1: Write failing tests for plan definitions**

Create `www/src/lib/pricing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getPlanDefinition, planDefinitions, canUseFeature, formatPlanLimit } from "./pricing";

describe("pricing plan definitions", () => {
  it("defines the public Sarge plan ladder", () => {
    expect(planDefinitions.map((plan) => plan.id)).toEqual(["free", "starter", "growth", "scale", "enterprise"]);
    expect(getPlanDefinition("starter")).toMatchObject({
      id: "starter",
      name: "Starter",
      monthlyPriceUsd: 49,
      limits: {
        projects: 3,
        eventsPerMonth: 250_000,
        retentionDays: 30,
        serverSecrets: 1,
        postbackTokens: 1,
        webhooks: 3,
      },
    });
    expect(getPlanDefinition("growth")).toMatchObject({
      monthlyPriceUsd: 149,
      limits: {
        projects: 10,
        eventsPerMonth: 2_000_000,
        retentionDays: 90,
      },
      features: expect.arrayContaining(["aiReview", "exports", "configurableAttributionWindow", "editSharing"]),
    });
    expect(getPlanDefinition("scale")).toMatchObject({
      monthlyPriceUsd: 399,
      limits: {
        projects: 25,
        eventsPerMonth: 10_000_000,
        retentionDays: 180,
      },
      features: expect.arrayContaining(["clientWorkspaces", "scheduledAiAudits", "apiExport"]),
    });
  });

  it("keeps core installation and basic attribution available on Free", () => {
    expect(canUseFeature("free", "installPixel")).toBe(true);
    expect(canUseFeature("free", "debugStream")).toBe(true);
    expect(canUseFeature("free", "publicVerify")).toBe(true);
    expect(canUseFeature("free", "basicAffiliateAttribution")).toBe(true);
    expect(canUseFeature("free", "aiReview")).toBe(false);
    expect(canUseFeature("free", "webhooks")).toBe(false);
  });

  it("formats finite and unlimited limits for UI copy", () => {
    expect(formatPlanLimit(50_000, "events")).toBe("50,000 events");
    expect(formatPlanLimit(null, "webhooks")).toBe("Unlimited webhooks");
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --dir www test -- src/lib/pricing.test.ts
```

Expected: FAIL because `www/src/lib/pricing.ts` does not exist.

- [x] **Step 3: Implement the pricing module**

Create `www/src/lib/pricing.ts`:

```ts
export type PlanId = "free" | "starter" | "growth" | "scale" | "enterprise";

export type PlanFeature =
  | "installPixel"
  | "debugStream"
  | "publicVerify"
  | "basicAffiliateAttribution"
  | "sessionFlowExplorer"
  | "serverEvents"
  | "postbacks"
  | "webhooks"
  | "viewSharing"
  | "editSharing"
  | "aiReview"
  | "exports"
  | "alerts"
  | "configurableAttributionWindow"
  | "clientWorkspaces"
  | "scheduledAiAudits"
  | "apiExport"
  | "dedicatedEndpoint"
  | "sso"
  | "auditLogs"
  | "warehouseSync";

export interface PlanLimits {
  projects: number | null;
  eventsPerMonth: number | null;
  retentionDays: number | null;
  serverSecrets: number | null;
  postbackTokens: number | null;
  webhooks: number | null;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  monthlyPriceUsd: number | null;
  description: string;
  limits: PlanLimits;
  features: PlanFeature[];
}

export const planDefinitions: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    description: "Install Sarge, verify events, and debug one project.",
    limits: {
      projects: 1,
      eventsPerMonth: 50_000,
      retentionDays: 7,
      serverSecrets: 0,
      postbackTokens: 0,
      webhooks: 0,
    },
    features: ["installPixel", "debugStream", "publicVerify", "basicAffiliateAttribution"],
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPriceUsd: 49,
    description: "Small-team tracking validation with basic server and partner callbacks.",
    limits: {
      projects: 3,
      eventsPerMonth: 250_000,
      retentionDays: 30,
      serverSecrets: 1,
      postbackTokens: 1,
      webhooks: 3,
    },
    features: [
      "installPixel",
      "debugStream",
      "publicVerify",
      "basicAffiliateAttribution",
      "sessionFlowExplorer",
      "serverEvents",
      "postbacks",
      "webhooks",
      "viewSharing",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    monthlyPriceUsd: 149,
    description: "Production diagnostics, exports, and configurable attribution for ecommerce teams.",
    limits: {
      projects: 10,
      eventsPerMonth: 2_000_000,
      retentionDays: 90,
      serverSecrets: 10,
      postbackTokens: 10,
      webhooks: 10,
    },
    features: [
      "installPixel",
      "debugStream",
      "publicVerify",
      "basicAffiliateAttribution",
      "sessionFlowExplorer",
      "serverEvents",
      "postbacks",
      "webhooks",
      "viewSharing",
      "editSharing",
      "aiReview",
      "exports",
      "alerts",
      "configurableAttributionWindow",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    monthlyPriceUsd: 399,
    description: "Agency and multi-brand controls with deeper retention and automation.",
    limits: {
      projects: 25,
      eventsPerMonth: 10_000_000,
      retentionDays: 180,
      serverSecrets: null,
      postbackTokens: null,
      webhooks: null,
    },
    features: [
      "installPixel",
      "debugStream",
      "publicVerify",
      "basicAffiliateAttribution",
      "sessionFlowExplorer",
      "serverEvents",
      "postbacks",
      "webhooks",
      "viewSharing",
      "editSharing",
      "aiReview",
      "exports",
      "alerts",
      "configurableAttributionWindow",
      "clientWorkspaces",
      "scheduledAiAudits",
      "apiExport",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPriceUsd: null,
    description: "Custom volume, dedicated infrastructure, security controls, and SLA.",
    limits: {
      projects: null,
      eventsPerMonth: null,
      retentionDays: null,
      serverSecrets: null,
      postbackTokens: null,
      webhooks: null,
    },
    features: [
      "installPixel",
      "debugStream",
      "publicVerify",
      "basicAffiliateAttribution",
      "sessionFlowExplorer",
      "serverEvents",
      "postbacks",
      "webhooks",
      "viewSharing",
      "editSharing",
      "aiReview",
      "exports",
      "alerts",
      "configurableAttributionWindow",
      "clientWorkspaces",
      "scheduledAiAudits",
      "apiExport",
      "dedicatedEndpoint",
      "sso",
      "auditLogs",
      "warehouseSync",
    ],
  },
];

export const getPlanDefinition = (planId: PlanId) =>
  planDefinitions.find((plan) => plan.id === planId) ?? planDefinitions[0];

export const canUseFeature = (planId: PlanId, feature: PlanFeature) =>
  getPlanDefinition(planId).features.includes(feature);

export const formatPlanLimit = (value: number | null, noun: string) => {
  if (value === null) return `Unlimited ${noun}`;
  return `${new Intl.NumberFormat("en-US").format(value)} ${noun}`;
};
```

- [x] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --dir www test -- src/lib/pricing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit** (skipped: user requested no commits)

```bash
git add www/src/lib/pricing.ts www/src/lib/pricing.test.ts
git commit -m "Add pricing plan definitions"
```

### Task 2: Persist Workspace Plan and Usage Shape

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260625010000_add_workspace_plan/migration.sql`
- Modify: `www/src/lib/sarge-demo.ts`
- Modify: `www/src/pages/app/navigation.test.ts`

- [x] **Step 1: Add failing source test for persisted plan fields**

Add this test to `www/src/pages/app/navigation.test.ts`:

```ts
it("models billing plan and usage on the workspace account", () => {
  const demoData = readSource("../../lib/sarge-demo.ts");
  const schema = readSource("../../../../apps/api/prisma/schema.prisma");
  const layout = readSource("../../layouts/AppLayout.astro");

  expect(schema).toContain("planId");
  expect(schema).toContain("billingStatus");
  expect(schema).toContain("currentPeriodEventCount");
  expect(demoData).toContain("planId: PlanId;");
  expect(demoData).toContain("plan: PlanDefinition;");
  expect(demoData).toContain("currentPeriodEventCount: number;");
  expect(layout).toContain("account.plan.name");
});
```

- [x] **Step 2: Run targeted test and confirm failure**

Run:

```bash
pnpm --dir www test -- src/pages/app/navigation.test.ts
```

Expected: FAIL because schema/account/layout do not contain the new plan shape.

- [x] **Step 3: Add Prisma fields and migration**

Modify `Workspace` in `apps/api/prisma/schema.prisma`:

```prisma
model Workspace {
  id                      String   @id @default(cuid())
  slug                    String   @unique
  name                    String
  ownerUserId             String?  @unique
  planId                  String   @default("free")
  billingStatus           String   @default("active")
  currentPeriodStart      DateTime @default(now())
  currentPeriodEventCount Int      @default(0)
  createdAt               DateTime @default(now())
  sites                   Site[]
}
```

Create `apps/api/prisma/migrations/20260625010000_add_workspace_plan/migration.sql`:

```sql
ALTER TABLE "Workspace"
  ADD COLUMN "planId" TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN "billingStatus" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "currentPeriodEventCount" INTEGER NOT NULL DEFAULT 0;
```

- [x] **Step 4: Update account types and live query mapping**

In `www/src/lib/sarge-demo.ts`, import the pricing module:

```ts
import { getPlanDefinition, type PlanDefinition, type PlanId } from './pricing';
```

Change `SargeAccount` plan fields:

```ts
export interface SargeAccount {
  id: string;
  name: string;
  slug: string;
  role: AccountRole;
  planId: PlanId;
  plan: PlanDefinition;
  billingStatus: 'active' | 'past_due' | 'canceled';
  currentPeriodEventCount: number;
  workspaceSetupComplete: boolean;
  ownedProjects: SargeProject[];
  sharedProjects: SargeProject[];
  projects: SargeProject[];
  members: AccountMember[];
}
```

Update `WorkspaceRow`:

```ts
interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  planId: PlanId;
  billingStatus: 'active' | 'past_due' | 'canceled';
  currentPeriodEventCount: number;
}
```

Update the workspace SELECT in `getViewerWorkspace()`:

```ts
SELECT id, slug, name, "planId", "billingStatus", "currentPeriodEventCount"
FROM "Workspace"
WHERE "ownerUserId" = ${userId}
LIMIT 1
```

When returning `getViewerAccount()`, set:

```ts
const planId = workspace?.planId ?? 'free';

return {
  id: workspace?.id ?? 'shared',
  name: workspace ? (isPlaceholderWorkspace ? 'Set up workspace' : workspace.name) : 'Shared projects',
  slug: workspace?.slug ?? 'shared',
  role,
  planId,
  plan: getPlanDefinition(planId),
  billingStatus: workspace?.billingStatus ?? 'active',
  currentPeriodEventCount: workspace?.currentPeriodEventCount ?? 0,
  workspaceSetupComplete: Boolean(workspace && !isPlaceholderWorkspace),
  ownedProjects,
  sharedProjects,
  projects: [...ownedProjects, ...sharedProjects],
  members,
};
```

Update fallback/setup accounts to use `planId: 'free'`, `plan: getPlanDefinition('free')`, `billingStatus: 'active'`, and `currentPeriodEventCount: 0`.

- [x] **Step 5: Update layout display**

In `www/src/layouts/AppLayout.astro`, replace the account plan text with:

```astro
<p class="text-xs text-muted-foreground">{account.role} · {account.plan.name}</p>
```

- [x] **Step 6: Run tests**

Run:

```bash
pnpm --dir www test -- src/pages/app/navigation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit** (skipped: user requested no commits)

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260625010000_add_workspace_plan/migration.sql www/src/lib/sarge-demo.ts www/src/pages/app/navigation.test.ts www/src/layouts/AppLayout.astro
git commit -m "Persist workspace plan state"
```

### Task 3: Gate Project Creation and Usage Limits

**Files:**
- Modify: `www/src/lib/sarge-demo.ts`
- Modify: `www/src/pages/app/index.astro`
- Modify: `www/src/pages/app/projects/new.astro`
- Modify: `www/src/pages/app/navigation.test.ts`

- [x] **Step 1: Add failing tests for project and event limit copy**

Add this test to `www/src/pages/app/navigation.test.ts`:

```ts
it("surfaces project and event usage limits from the active plan", () => {
  const demoData = readSource("../../lib/sarge-demo.ts");
  const overview = readSource("./index.astro");
  const newProject = readSource("./projects/new.astro");

  expect(demoData).toContain("canCreateProjectForPlan");
  expect(demoData).toContain("getAccountUsage");
  expect(overview).toContain("data-plan-usage-panel");
  expect(overview).toContain("account.plan.limits.eventsPerMonth");
  expect(newProject).toContain("canCreateProjectForPlan(account)");
  expect(newProject).toContain("Upgrade to add more projects");
});
```

- [x] **Step 2: Run targeted test and confirm failure**

Run:

```bash
pnpm --dir www test -- src/pages/app/navigation.test.ts
```

Expected: FAIL because usage helpers and UI copy do not exist.

- [x] **Step 3: Add usage helpers**

In `www/src/lib/sarge-demo.ts`, add:

```ts
export const getAccountUsage = (account: SargeAccount) => ({
  projects: account.ownedProjects.length,
  eventsThisPeriod: account.currentPeriodEventCount,
  projectLimit: account.plan.limits.projects,
  eventLimit: account.plan.limits.eventsPerMonth,
});

export const canCreateProjectForPlan = (account: SargeAccount) => {
  const limit = account.plan.limits.projects;
  return limit === null || account.ownedProjects.length < limit;
};

export const isEventUsageOverLimit = (account: SargeAccount) => {
  const limit = account.plan.limits.eventsPerMonth;
  return limit !== null && account.currentPeriodEventCount >= limit;
};
```

- [x] **Step 4: Add overview usage panel**

In `www/src/pages/app/index.astro`, import helpers:

```ts
import { canAdministerAccount, createWorkspace, deleteWorkspace, environmentLabels, formatCount, getAccountUsage, getViewerAccount } from "@/lib/sarge-demo";
```

After `const account = await getViewerAccount(...)`, add:

```ts
const accountUsage = getAccountUsage(account);
```

Add this card near the top stats area:

```astro
<Card data-plan-usage-panel>
  <CardHeader>
    <CardTitle>Plan usage</CardTitle>
  </CardHeader>
  <CardContent className="grid gap-3 text-sm">
    <div class="flex items-center justify-between gap-3">
      <span class="text-muted-foreground">Projects</span>
      <span class="font-medium">
        {formatCount(accountUsage.projects)} / {account.plan.limits.projects === null ? "Unlimited" : formatCount(account.plan.limits.projects)}
      </span>
    </div>
    <div class="flex items-center justify-between gap-3">
      <span class="text-muted-foreground">Events this month</span>
      <span class="font-medium">
        {formatCount(accountUsage.eventsThisPeriod)} / {account.plan.limits.eventsPerMonth === null ? "Unlimited" : formatCount(account.plan.limits.eventsPerMonth)}
      </span>
    </div>
    <a class="text-sm font-medium text-primary hover:underline" href="/app/billing">View plans</a>
  </CardContent>
</Card>
```

- [x] **Step 5: Gate new project creation**

In `www/src/pages/app/projects/new.astro`, import `canCreateProjectForPlan` and add after admin/workspace checks:

```ts
const canCreateMoreProjects = canCreateProjectForPlan(account);
```

When handling create form POST, before `createProject(...)`, add:

```ts
if (!canCreateMoreProjects) {
  projectError = "Upgrade to add more projects.";
} else {
  const result = await createProject(userId, env.DATABASE_URL, projectValues);
  if (result.success) return Astro.redirect(`/app/projects/${result.project.slug}`, 303);
  projectError = result.error;
}
```

Render this warning above the form:

```astro
{!canCreateMoreProjects && (
  <Alert>
    <AlertTitle>Project limit reached</AlertTitle>
    <AlertDescription>Upgrade to add more projects.</AlertDescription>
  </Alert>
)}
```

Disable the submit button when `!canCreateMoreProjects`.

- [x] **Step 6: Run tests**

Run:

```bash
pnpm --dir www test -- src/pages/app/navigation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit** (skipped: user requested no commits)

```bash
git add www/src/lib/sarge-demo.ts www/src/pages/app/index.astro www/src/pages/app/projects/new.astro www/src/pages/app/navigation.test.ts
git commit -m "Gate project creation by plan"
```

### Task 4: Gate Project Detail Features

**Files:**
- Modify: `www/src/pages/app/projects/[projectId].astro`
- Modify: `www/src/pages/app/project-detail.test.ts`

- [x] **Step 1: Add failing source tests for feature gates**

Add this test to `www/src/pages/app/project-detail.test.ts`:

```ts
it("gates paid project detail features by plan entitlements", () => {
  const projectDetail = readSource("./projects/[projectId].astro");

  expect(projectDetail).toContain("canUseFeature(account.planId, \"aiReview\")");
  expect(projectDetail).toContain("canUseFeature(account.planId, \"webhooks\")");
  expect(projectDetail).toContain("canUseFeature(account.planId, \"serverEvents\")");
  expect(projectDetail).toContain("canUseFeature(account.planId, \"postbacks\")");
  expect(projectDetail).toContain("AI review is available on Growth and higher");
  expect(projectDetail).toContain("Webhooks are available on Starter and higher");
  expect(projectDetail).toContain("Server-side calls are available on Starter and higher");
});
```

- [x] **Step 2: Run targeted test and confirm failure**

Run:

```bash
pnpm --dir www test -- src/pages/app/project-detail.test.ts
```

Expected: FAIL because project detail does not use plan entitlements.

- [x] **Step 3: Add entitlement imports and booleans**

In `www/src/pages/app/projects/[projectId].astro`, import:

```ts
import { canUseFeature } from "@/lib/pricing";
```

Add after account/project setup:

```ts
const canUseAiReview = canUseFeature(account.planId, "aiReview");
const canUseWebhooks = canUseFeature(account.planId, "webhooks");
const canUseServerEvents = canUseFeature(account.planId, "serverEvents");
const canUsePostbacks = canUseFeature(account.planId, "postbacks");
```

Update existing booleans:

```ts
const canCreateWebhooks = canManageProject(project) && canUseWebhooks;
const canManageCredentials = canManageProject(project) && (canUseServerEvents || canUsePostbacks);
```

Update AI review enablement:

```ts
const isAiReviewEnabled = selectedEnvironment.environment === "production" && canUseAiReview;
```

- [x] **Step 4: Add upgrade copy in gated panels**

In the AI review disabled branch, include:

```astro
{!canUseAiReview
  ? "AI review is available on Growth and higher."
  : `${selectedEnvironmentLabel} still has its own pixel, session flows, debug stream, event hosts, and webhooks.`}
```

In the server-side calls card, when neither server events nor postbacks are available, render:

```astro
<div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
  Server-side calls are available on Starter and higher.
</div>
```

In the webhooks card, when `!canUseWebhooks`, render:

```astro
<div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
  Webhooks are available on Starter and higher.
</div>
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
pnpm --dir www test -- src/pages/app/project-detail.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit** (skipped: user requested no commits)

```bash
git add www/src/pages/app/projects/[projectId].astro www/src/pages/app/project-detail.test.ts
git commit -m "Gate project features by plan"
```

### Task 5: Billing and Plan Comparison Page

**Files:**
- Create: `www/src/pages/app/billing.astro`
- Modify: `www/src/pages/app/navigation.test.ts`
- Modify: `www/src/layouts/AppLayout.astro`

- [x] **Step 1: Add failing source tests for billing page and navigation**

Add this test to `www/src/pages/app/navigation.test.ts`:

```ts
it("adds a billing page with the recommended pricing ladder", () => {
  const billing = readSource("./billing.astro");
  const layout = readSource("../../layouts/AppLayout.astro");

  expect(layout).toContain('href="/app/billing"');
  expect(billing).toContain("Free");
  expect(billing).toContain("$49");
  expect(billing).toContain("$149");
  expect(billing).toContain("$399");
  expect(billing).toContain("Contact us");
  expect(billing).toContain("50k events/month");
  expect(billing).toContain("2M events/month");
  expect(billing).toContain("10M events/month");
});
```

- [x] **Step 2: Run targeted test and confirm failure**

Run:

```bash
pnpm --dir www test -- src/pages/app/navigation.test.ts
```

Expected: FAIL because `billing.astro` does not exist and navigation lacks billing.

- [x] **Step 3: Create billing page**

Create `www/src/pages/app/billing.astro`:

```astro
---
import { env } from "cloudflare:workers";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AppLayout from "@/layouts/AppLayout.astro";
import { getViewerAccount } from "@/lib/sarge-demo";
import { planDefinitions } from "@/lib/pricing";

const { userId } = Astro.locals.auth();
if (!userId) return Astro.redirect("/sign-in");
const currentUser = await Astro.locals.currentUser();
const viewerEmails = currentUser?.emailAddresses.map((email) => email.emailAddress).filter(Boolean) ?? [];
const account = await getViewerAccount(userId, env.DATABASE_URL, { viewerEmails });

const formatPrice = (price: number | null) => (price === null ? "Contact us" : price === 0 ? "$0" : `$${price}`);
const formatEvents = (events: number | null) => {
  if (events === null) return "Custom events/month";
  if (events >= 1_000_000) return `${events / 1_000_000}M events/month`;
  if (events >= 1_000) return `${events / 1_000}k events/month`;
  return `${events} events/month`;
};
---

<AppLayout
  account={account}
  title="Billing | Sarge"
  heading="Billing"
  description="Pick the Sarge plan that matches your tracking assurance workflow."
  active="account"
  breadcrumbs={[{ label: "Overview", href: "/app" }, { label: "Billing" }]}
>
  <section class="grid gap-4 lg:grid-cols-5">
    {planDefinitions.map((plan) => (
      <Card className={plan.id === account.planId ? "border-primary" : ""}>
        <CardHeader>
          <div class="flex items-center justify-between gap-2">
            <CardTitle>{plan.name}</CardTitle>
            {plan.id === account.planId && <Badge>Current</Badge>}
          </div>
          <p class="text-3xl font-semibold">{formatPrice(plan.monthlyPriceUsd)}</p>
          {plan.monthlyPriceUsd !== null && <p class="text-xs text-muted-foreground">per month</p>}
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p class="min-h-12 text-muted-foreground">{plan.description}</p>
          <div class="grid gap-2">
            <p class="flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /> {formatEvents(plan.limits.eventsPerMonth)}</p>
            <p class="flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /> {plan.limits.retentionDays === null ? "Custom retention" : `${plan.limits.retentionDays}-day retention`}</p>
            <p class="flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /> {plan.limits.projects === null ? "Unlimited projects" : `${plan.limits.projects} projects`}</p>
          </div>
          <Button variant={plan.id === account.planId ? "outline" : "default"} disabled={plan.id === account.planId}>
            {plan.monthlyPriceUsd === null ? "Contact us" : plan.id === account.planId ? "Current plan" : "Choose plan"}
          </Button>
        </CardContent>
      </Card>
    ))}
  </section>
</AppLayout>
```

- [x] **Step 4: Add billing navigation**

In `www/src/layouts/AppLayout.astro`, add a billing link near account navigation:

```astro
<a href="/app/billing" class:list={[active === "account" ? "text-foreground" : "text-muted-foreground hover:text-foreground"]}>
  Billing
</a>
```

- [x] **Step 5: Run tests**

Run:

```bash
pnpm --dir www test -- src/pages/app/navigation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit** (skipped: user requested no commits)

```bash
git add www/src/pages/app/billing.astro www/src/pages/app/navigation.test.ts www/src/layouts/AppLayout.astro
git commit -m "Add billing plan comparison"
```

### Task 6: Public Pricing Page Alignment

**Files:**
- Modify: `www/src/pages/index.astro`
- Create: `docs/PRICING.md`
- Modify: `www/src/pages/app/navigation.test.ts`

- [x] **Step 1: Add failing test for public pricing copy**

Add this test to `www/src/pages/app/navigation.test.ts`:

```ts
it("documents the public pricing and feature gating strategy", () => {
  const homepage = readSource("../../index.astro");
  const pricingDoc = readSource("../../../../docs/PRICING.md");

  expect(homepage).toContain("Free");
  expect(homepage).toContain("$49");
  expect(homepage).toContain("$149");
  expect(homepage).toContain("$399");
  expect(pricingDoc).toContain("tracking assurance");
  expect(pricingDoc).toContain("Do not gate the core install path");
  expect(pricingDoc).toContain("Gate these because they map to business value");
});
```

- [x] **Step 2: Run targeted test and confirm failure**

Run:

```bash
pnpm --dir www test -- src/pages/app/navigation.test.ts
```

Expected: FAIL because `docs/PRICING.md` does not exist or homepage pricing is stale.

- [x] **Step 3: Update homepage pricing data**

In `www/src/pages/index.astro`, replace the current `plans` array with values aligned to `www/src/lib/pricing.ts`:

```ts
const plans = [
  {
    name: "Free",
    price: "$0",
    description: "Install Sarge, verify one project, and inspect recent debug events.",
    features: ["1 project", "50k events/month", "7-day retention", "Basic affiliate attribution"],
  },
  {
    name: "Starter",
    price: "$49",
    description: "Small-team tracking validation with server calls and partner postbacks.",
    features: ["3 projects", "250k events/month", "30-day retention", "1 server secret", "1 postback token", "3 webhooks"],
  },
  {
    name: "Growth",
    price: "$149",
    description: "Production diagnostics and configurable attribution for ecommerce teams.",
    features: ["10 projects", "2M events/month", "90-day retention", "AI review", "exports", "alerts"],
  },
  {
    name: "Scale",
    price: "$399",
    description: "Agency and multi-brand controls with deeper retention and automation.",
    features: ["25 projects", "10M events/month", "180-day retention", "client workspaces", "API export"],
  },
];
```

- [x] **Step 4: Create pricing strategy document**

Create `docs/PRICING.md`:

```md
# Sarge Pricing

Sarge is priced as tracking assurance and attribution debugging, not generic product analytics.

## Plans

| Plan | Price | Primary limits |
| --- | ---: | --- |
| Free | $0/mo | 1 project, 50k events/month, 7-day retention |
| Starter | $49/mo | 3 projects, 250k events/month, 30-day retention |
| Growth | $149/mo | 10 projects, 2M events/month, 90-day retention |
| Scale | $399/mo | 25 projects, 10M events/month, 180-day retention |
| Enterprise | Custom | custom volume, dedicated infrastructure, SSO, audit logs, SLA |

## Gate Philosophy

Do not gate the core install path. Users must be able to install Sarge, verify events, see the debug stream, use the public verify page, and understand the default 28-day affiliate attribution window before they feel value.

Gate these because they map to business value:

- retention
- event volume
- AI diagnostics
- server-side secrets
- postback tokens
- webhooks
- team and project sharing
- client workspaces
- exports and API access
- configurable attribution windows
- dedicated infrastructure
- compliance and security controls
```

- [x] **Step 5: Run tests**

Run:

```bash
pnpm --dir www test -- src/pages/app/navigation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit** (skipped: user requested no commits)

```bash
git add www/src/pages/index.astro docs/PRICING.md www/src/pages/app/navigation.test.ts
git commit -m "Document pricing strategy"
```

### Task 7: Full Verification

**Files:**
- All touched files

- [x] **Step 1: Run focused web tests**

Run:

```bash
pnpm --dir www test -- src/lib/pricing.test.ts src/pages/app/navigation.test.ts src/pages/app/project-detail.test.ts
```

Expected: all targeted suites PASS.

- [x] **Step 2: Run web build**

Run:

```bash
pnpm --dir www build
```

Expected: build exits 0. The existing Vite large chunk warning is acceptable if no new build errors appear.

- [x] **Step 3: Run repository typecheck**

Run:

```bash
pnpm typecheck
```

Expected: command exits 0.

- [x] **Step 4: Review diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only pricing, entitlement, billing UI, migration, and docs files are modified.

- [ ] **Step 5: Final commit if verification required fixes** (skipped: user requested no commits)

If any verification fixes were made after Task 6, commit them:

```bash
git add .
git commit -m "Verify pricing gates"
```
