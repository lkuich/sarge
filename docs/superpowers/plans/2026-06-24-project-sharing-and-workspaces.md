# Project Sharing and Workspace Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add empty-workspace deletion, project-level email sharing with `view`/`edit` roles, SendGrid-backed invite email setup, and separate owned/shared project sections on Overview.

**Architecture:** Keep the portal's current single-owned-workspace model. Add a `ProjectShare` table tied to `Site`, extend the `www/src/lib/sarge-demo.ts` service layer to load owned and shared projects, and keep all mutations as Astro form posts. Use a small React dialog island for project sharing while keeping permission checks server-side.

**Tech Stack:** Astro 6, React 19 islands, Clerk Astro locals, Neon SQL, Prisma migrations, Base UI dialog primitives, shadcn-style local components, SendGrid SDK, Vitest source/service tests.

---

### Task 1: Schema and Types

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260624030000_add_project_shares/migration.sql`
- Modify: `www/src/lib/sarge-demo.ts`

- [ ] Add a failing source test in `www/src/pages/app/project-detail.test.ts` that expects `schema.prisma` to contain `model ProjectShare`, `@@unique([siteId, email])`, and `projectShares ProjectShare[]`.
- [ ] Run `pnpm --filter www test -- project-detail.test.ts` and confirm the new test fails because the schema does not contain `ProjectShare`.
- [ ] Add `ProjectShare` to Prisma schema and migration SQL.
- [ ] Add `ProjectShareRole`, `ProjectShare`, `ownership`, `shareRole`, `shares`, `ownedProjects`, and `sharedProjects` types in `sarge-demo.ts`.
- [ ] Run the targeted test and confirm it passes.

### Task 2: Workspace Deletion

**Files:**
- Modify: `www/src/lib/sarge-demo.ts`
- Modify: `www/src/pages/app/index.astro`
- Modify: `www/src/pages/app/navigation.test.ts`

- [ ] Add failing source tests expecting `deleteWorkspace`, `intent === "delete-workspace"`, `data-delete-workspace`, and empty-workspace copy.
- [ ] Run `pnpm --filter www test -- navigation.test.ts` and confirm failure.
- [ ] Implement `deleteWorkspace(userId, databaseUrl)` so it rejects missing DB, missing owned workspace, and any workspace with projects, then deletes the empty owned workspace.
- [ ] Add the Overview post handler and guarded UI.
- [ ] Run the targeted test and confirm it passes.

### Task 3: Owned and Shared Project Loading

**Files:**
- Modify: `www/src/lib/sarge-demo.ts`
- Modify: `www/src/pages/app/index.astro`
- Modify: `www/src/pages/app/projects/[projectId].astro`
- Modify: `www/src/pages/app/projects/new.astro`
- Modify: `www/src/pages/app/account.astro`
- Modify: `www/src/pages/app/navigation.test.ts`

- [ ] Add failing source tests expecting Overview to render `Your workspace` and `Shared with you`, and routes to call `Astro.locals.currentUser()`.
- [ ] Run `pnpm --filter www test -- navigation.test.ts` and confirm failure.
- [ ] Add `getViewerEmails(Astro.locals.currentUser)` usage to authenticated app routes and pass emails into `getViewerAccount(userId, databaseUrl, { viewerEmails })`.
- [ ] Update `getViewerAccount()` to query owned sites and shared sites separately, map `ownership` and `shareRole`, and keep `projects` as `ownedProjects + sharedProjects`.
- [ ] Update Overview to render owned and shared project sections.
- [ ] Run the targeted test and confirm it passes.

### Task 4: Share Mutations and SendGrid Setup

**Files:**
- Modify: `www/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `www/src/lib/project-invite-email.ts`
- Modify: `www/src/lib/sarge-demo.ts`
- Modify: `www/src/pages/app/project-detail.test.ts`

- [ ] Add failing source tests expecting `@sendgrid/mail`, `shareProject`, `updateProjectShare`, `removeProjectShare`, and `SENDGRID_API_KEY`.
- [ ] Run `pnpm --filter www test -- project-detail.test.ts` and confirm failure.
- [ ] Install `@sendgrid/mail` for `www`.
- [ ] Create a mail helper that sends only when `SENDGRID_API_KEY` and `SARGE_EMAIL_FROM` are configured, and otherwise returns a warning.
- [ ] Implement share create/update/remove helpers with email normalization, role validation, owner authorization, and non-fatal email warnings.
- [ ] Run the targeted test and confirm it passes.

### Task 5: Share Modal UI and Permissions

**Files:**
- Create: `www/src/components/ProjectShareDialog.tsx`
- Modify: `www/src/pages/app/projects/[projectId].astro`
- Modify: `www/src/pages/app/project-detail.test.ts`

- [ ] Add failing source tests expecting `ProjectShareDialog`, `data-project-share-dialog`, `canShareProject`, `canManageProject`, and hidden management controls for shared view access.
- [ ] Run `pnpm --filter www test -- project-detail.test.ts` and confirm failure.
- [ ] Implement a compact React dialog with invite form, existing share rows, role selects, remove buttons, and alert messages.
- [ ] Wire project detail POST intents for `share-project`, `update-project-share`, and `remove-project-share`.
- [ ] Gate sharing to owned projects and management forms to owned or shared `edit`.
- [ ] Run the targeted test and confirm it passes.

### Task 6: Verification

**Files:**
- All touched files

- [ ] Run `pnpm --filter www test`.
- [ ] Run `pnpm --filter www build`.
- [ ] Run broader checks if schema/type changes require it: `pnpm prisma:generate` and `pnpm typecheck`.
- [ ] Review `git diff` to confirm existing unrelated edits are preserved and no generated clutter was introduced.
