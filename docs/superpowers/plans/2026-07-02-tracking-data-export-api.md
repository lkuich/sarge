# Tracking Data Export API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 environment-scoped raw event export API, including read-token creation from the project dashboard.

**Architecture:** Add a hashed `ApiToken` model related to `SiteEnvironment`, expose `GET /v2/export/events` in `apps/api`, and add a dashboard credential action that rotates one active `events:read` token per environment. Keep tenant scoping in repository methods and reuse a shared plan-retention SQL helper from `@sarge/core`.

**Tech Stack:** TypeScript, Express, Prisma/Postgres, Astro, Neon serverless SQL, Vitest, Supertest, Zod.

---

### Task 1: Shared Retention Helper

**Files:**
- Modify: `packages/core/src/usage-limits.ts`
- Modify: `packages/core/src/usage-limits.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `www/src/lib/pricing.ts`

- [ ] **Step 1: Write the failing core test**

Add assertions in `packages/core/src/usage-limits.test.ts`:

```ts
import {
  buildPlanEventLimitSqlCase,
  buildPlanRetentionFilterSql,
  getPlanEventLimit,
  getPlanRetentionDays
} from "./usage-limits";

it("builds SQL plan retention filters from shared runtime limits", () => {
  const filter = buildPlanRetentionFilterSql('e."occurredAt"', 'w."planId"');

  expect(getPlanRetentionDays("free")).toBe(7);
  expect(getPlanRetentionDays("starter")).toBe(30);
  expect(getPlanRetentionDays("growth")).toBe(90);
  expect(getPlanRetentionDays("scale")).toBeNull();
  expect(filter).toContain("WHEN 'free' THEN 7");
  expect(filter).toContain("WHEN 'scale' THEN NULL");
  expect(filter).toContain('e."occurredAt" >= NOW() - make_interval');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run packages/core/src/usage-limits.test.ts
```

Expected: fail because `buildPlanRetentionFilterSql` and `getPlanRetentionDays` are not exported.

- [ ] **Step 3: Add shared retention implementation**

Add to `packages/core/src/usage-limits.ts`:

```ts
export const planRetentionDays: Record<string, number | null> = {
  free: 7,
  starter: 30,
  growth: 90,
  scale: null
};

export const getPlanRetentionDays = (planId: string) =>
  Object.prototype.hasOwnProperty.call(planRetentionDays, planId)
    ? planRetentionDays[planId]
    : planRetentionDays.free;

export const buildPlanRetentionSqlCase = (planIdExpression: string) => {
  const branches = Object.entries(planRetentionDays)
    .map(([planId, days]) => `WHEN '${planId}' THEN ${days === null ? "NULL" : days}`)
    .join("\n            ");

  return `CASE ${planIdExpression}
            ${branches}
            ELSE ${planRetentionDays.free}
          END`;
};

export const buildPlanRetentionFilterSql = (occurredAtExpression: string, planIdExpression: string) => {
  const retentionDaysSqlCase = buildPlanRetentionSqlCase(planIdExpression);

  return `(${retentionDaysSqlCase} IS NULL
            OR ${occurredAtExpression} >= NOW() - make_interval(days => ${retentionDaysSqlCase}))`;
};
```

Export these from `packages/core/src/index.ts`.

In `www/src/lib/pricing.ts`, import and re-export the shared helper:

```ts
export { buildPlanRetentionFilterSql } from "@sarge/core";
```

Remove the local `buildPlanRetentionFilterSql` implementation from `pricing.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run packages/core/src/usage-limits.test.ts www/src/lib/pricing.test.ts
```

Expected: both files pass.

### Task 2: ApiToken Data Model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260702010000_add_api_tokens/migration.sql`
- Modify: `www/src/lib/sarge-demo.ts`

- [ ] **Step 1: Write source-level failing test**

Add a test to `www/src/pages/app/project-detail.test.ts`:

```ts
it("surfaces API export read tokens as project credentials", () => {
  const projectDetail = readSource("./projects/[projectId].astro");
  const demoData = readSource("../../lib/sarge-demo.ts");
  const schema = readSource("../../../../apps/api/prisma/schema.prisma");

  expect(schema).toContain("model ApiToken");
  expect(schema).toContain("apiTokens           ApiToken[]");
  expect(demoData).toContain("apiReadTokenConfigured: boolean;");
  expect(demoData).toContain("createEnvironmentCredential(userId, env.DATABASE_URL, selectedEnvironment.id, kind)");
  expect(projectDetail).toContain('intent === "rotate-api-read-token"');
  expect(projectDetail).toContain("API export token");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir www test src/pages/app/project-detail.test.ts
```

Expected: fail because `ApiToken`, `apiReadTokenConfigured`, and API token UI do not exist.

- [ ] **Step 3: Add Prisma model and migration**

Add `apiTokens           ApiToken[]` to `SiteEnvironment` in `apps/api/prisma/schema.prisma`.

Add:

```prisma
model ApiToken {
  id                String    @id @default(cuid())
  siteEnvironmentId String
  name              String
  scope             String
  tokenHash         String    @unique
  createdAt         DateTime  @default(now())
  revokedAt         DateTime?

  siteEnvironment SiteEnvironment @relation(fields: [siteEnvironmentId], references: [id], onDelete: Cascade)

  @@index([siteEnvironmentId, createdAt])
  @@index([scope, revokedAt])
}
```

Create migration SQL:

```sql
CREATE TABLE "ApiToken" (
  "id" TEXT NOT NULL,
  "siteEnvironmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX "ApiToken_siteEnvironmentId_createdAt_idx" ON "ApiToken"("siteEnvironmentId", "createdAt");
CREATE INDEX "ApiToken_scope_revokedAt_idx" ON "ApiToken"("scope", "revokedAt");

ALTER TABLE "ApiToken"
  ADD CONSTRAINT "ApiToken_siteEnvironmentId_fkey"
  FOREIGN KEY ("siteEnvironmentId") REFERENCES "SiteEnvironment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Add environment state fields**

In `www/src/lib/sarge-demo.ts`, add `apiReadTokenConfigured: boolean` to `SargeProjectEnvironment`, select active `events:read` tokens in environment queries, and map the field as `Boolean(environment.apiReadTokenConfigured)`.

- [ ] **Step 5: Run generation and source test**

Run:

```bash
pnpm prisma:generate
pnpm --dir www test src/pages/app/project-detail.test.ts
```

Expected: Prisma generation succeeds; the source test still fails until dashboard UI is added in Task 4.

### Task 3: Export API Route And Repository

**Files:**
- Modify: `apps/api/src/event-repository.ts`
- Modify: `apps/api/src/prisma-event-repository.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`

- [ ] **Step 1: Write failing API tests**

Add tests in `apps/api/src/app.test.ts` for:

```ts
it("rejects export calls without a read token", async () => {
  const { repository } = createMemoryRepository();
  const response = await request(createApp({ repository })).get("/v2/export/events");
  expect(response.status).toBe(401);
  expect(response.body).toEqual({ success: false, error: "Invalid credentials" });
});

it("exports only events for the read token environment", async () => {
  const { repository } = createMemoryRepository();
  const response = await request(createApp({ repository }))
    .get("/v2/export/events")
    .set("authorization", "Bearer sarge_read_valid")
    .query({ limit: "1" });

  expect(response.status).toBe(200);
  expect(response.body.events).toHaveLength(1);
  expect(response.body.events[0]).toMatchObject({
    siteEnvironmentId: "site_123",
    name: "purchase.completed"
  });
  expect(response.body.nextCursor).toEqual(expect.any(String));
});

it("validates export query parameters", async () => {
  const { repository } = createMemoryRepository();
  const response = await request(createApp({ repository }))
    .get("/v2/export/events")
    .set("authorization", "Bearer sarge_read_valid")
    .query({ source: "invalid" });

  expect(response.status).toBe(400);
  expect(response.body).toEqual({ success: false, error: "Invalid export query" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec vitest run apps/api/src/app.test.ts
```

Expected: fail because the route and repository methods do not exist.

- [ ] **Step 3: Add repository contracts**

In `apps/api/src/event-repository.ts`, add `ReadApiToken`, `ExportedEvent`, `EventExportQuery`, `EventExportPage`, `findReadToken`, and `listEventsForExport`.

- [ ] **Step 4: Add route validation and handler**

In `apps/api/src/app.ts`, add a `GET /v2/export/events` handler before postback routes. Use Zod for query parsing, bearer token auth, and response mapping. Return `401`, `400`, and `500` with the contract from the spec.

- [ ] **Step 5: Implement Prisma methods**

In `apps/api/src/prisma-event-repository.ts`, hash presented read tokens with `tokenMatchesHash` or SHA-256, find active `ApiToken` rows with scope `events:read`, and list events with filters, retention join, and cursor pagination.

- [ ] **Step 6: Run API tests**

Run:

```bash
pnpm --filter @sarge/core build
pnpm prisma:generate
pnpm --filter @sarge/api typecheck
pnpm exec vitest run apps/api/src/app.test.ts
```

Expected: all commands pass.

### Task 4: Dashboard Read Token Rotation

**Files:**
- Modify: `www/src/lib/sarge-demo.ts`
- Modify: `www/src/pages/app/projects/[projectId].astro`
- Modify: `www/src/pages/app/project-detail.test.ts`

- [ ] **Step 1: Extend credential kind and failing tests**

Update tests to expect `EnvironmentCredentialKind = 'server' | 'postback' | 'api-read'`, the `sarge_read_` prefix, and visible API export token controls.

- [ ] **Step 2: Implement token creation**

In `www/src/lib/sarge-demo.ts`, extend `createEnvironmentCredential` so `kind === "api-read"`:

- checks admin/workspace ownership.
- requires the `apiExport` feature.
- generates a `sarge_read_` token.
- revokes active `events:read` tokens for the environment.
- inserts the new `ApiToken`.
- returns endpoint `https://track.sargetrack.app/v2/export/events`.

- [ ] **Step 3: Implement dashboard action and UI**

In `www/src/pages/app/projects/[projectId].astro`, add:

- `canUseApiExport = canUseFeature(account.planId, "apiExport")`.
- `rotate-api-read-token` intent.
- flash handling for `kind: "api-read"`.
- an API export token card in the credentials panel.
- one-time token alert with a `curl` example.

- [ ] **Step 4: Run dashboard tests**

Run:

```bash
pnpm --dir www test src/pages/app/project-detail.test.ts src/lib/pricing.test.ts
```

Expected: tests pass.

### Task 5: Documentation And Verification

**Files:**
- Modify: `docs/API.md`

- [ ] **Step 1: Add API docs**

Document `GET /v2/export/events`, auth, query parameters, response shape, cursor pagination, and errors.

- [ ] **Step 2: Run focused verification**

Run:

```bash
pnpm --filter @sarge/core build
pnpm prisma:generate
pnpm --filter @sarge/api typecheck
pnpm exec vitest run packages/core/src/usage-limits.test.ts apps/api/src/app.test.ts
pnpm --dir www test src/pages/app/project-detail.test.ts src/lib/pricing.test.ts
```

Expected: all commands pass.

- [ ] **Step 3: Review diff**

Run:

```bash
git diff --stat
git diff -- docs/API.md apps/api/src/app.ts apps/api/src/event-repository.ts apps/api/src/prisma-event-repository.ts apps/api/prisma/schema.prisma www/src/lib/sarge-demo.ts 'www/src/pages/app/projects/[projectId].astro'
```

Expected: changes match the approved spec and no unrelated files are modified.
