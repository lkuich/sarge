# Project Share Plan Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce per-project sharing limits by plan and show those limits on pricing, billing, and sharing UI.

**Architecture:** Extend the existing `PlanLimits` model with `projectShares`. Enforce the finite limit in `shareProject` with a database transaction that locks the owning workspace/site and counts existing shares before inserting a new one. Surface the same limit copy in homepage pricing cards, billing cards, and `ProjectShareDialog`.

**Tech Stack:** Astro, React, TypeScript, Neon SQL, Vitest.

---

### Task 1: Pricing Source Of Truth

**Files:**
- Modify: `www/src/lib/pricing.ts`
- Test: `www/src/lib/pricing.test.ts`

- [ ] Write a failing test that expects `projectShares` limits for Free, Starter, Growth, and Scale.
- [ ] Run `pnpm -C www exec vitest run src/lib/pricing.test.ts` and confirm it fails because the new limit is absent.
- [ ] Add `projectShares` to `PlanLimits` and each `planDefinitions` entry.
- [ ] Re-run `pnpm -C www exec vitest run src/lib/pricing.test.ts` and confirm it passes.

### Task 2: Share Mutation Enforcement

**Files:**
- Modify: `www/src/lib/sarge-demo.ts`
- Test: `www/src/pages/app/project-detail.test.ts`

- [ ] Write a failing source-level test that expects `shareProject` to use `projectShareLimitSqlCase`, count existing `ProjectShare` rows, and return `Project share limit reached. Upgrade to invite more people.`
- [ ] Run `pnpm -C www exec vitest run src/pages/app/project-detail.test.ts` and confirm it fails.
- [ ] Implement `projectShareLimitSqlCase` and guard new shares inside `shareProject`.
- [ ] Re-run `pnpm -C www exec vitest run src/pages/app/project-detail.test.ts` and confirm it passes.

### Task 3: UI And Pricing Copy

**Files:**
- Modify: `www/src/components/ProjectShareDialog.tsx`
- Modify: `www/src/pages/app/projects/[projectId].astro`
- Modify: `www/src/pages/app/billing.astro`
- Modify: `www/src/pages/index.astro`
- Test: `www/src/pages/app/navigation.test.ts`
- Test: `www/src/pages/app/project-detail.test.ts`

- [ ] Write failing tests that expect share-limit copy on homepage and billing, and limit state props in `ProjectShareDialog`.
- [ ] Run `pnpm -C www exec vitest run src/pages/app/navigation.test.ts src/pages/app/project-detail.test.ts` and confirm the tests fail.
- [ ] Pass share limit and billing URL into `ProjectShareDialog`, render usage, and disable invite controls at finite limits.
- [ ] Add share-limit feature points to homepage and billing plan cards.
- [ ] Re-run the focused Vitest command and confirm it passes.

### Task 4: Verification

**Files:**
- All files changed above.

- [ ] Run `pnpm -C www exec vitest run src/lib/pricing.test.ts src/pages/app/navigation.test.ts src/pages/app/project-detail.test.ts`.
- [ ] Inspect `git diff --stat` and `git diff` to confirm only intended files changed.
