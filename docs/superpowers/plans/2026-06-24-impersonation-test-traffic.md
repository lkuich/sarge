# Impersonation Test Traffic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add console-driven user impersonation that marks events as test traffic and lets the Sarge console filter that traffic.

**Architecture:** The browser pixel keeps a project-scoped tester user id and an optional project-scoped impersonation target in localStorage. Event payloads use the impersonated `userId` when active and merge explicit Sarge-owned test metadata into properties. The portal reads those event properties and adds test-traffic filters/badges without changing the database schema.

**Tech Stack:** TypeScript, Vitest, React, Astro, localStorage-backed browser pixel.

---

### Task 1: Pixel Identity and Impersonation

**Files:**
- Modify: `packages/pixel/src/types.ts`
- Modify: `packages/pixel/src/client.ts`
- Modify: `packages/pixel/src/index.ts`
- Test: `packages/pixel/src/client.test.ts`

- [ ] Write failing tests proving user IDs are project-scoped, `impersonate("abc123")` persists the target, payload `userId` becomes `abc123`, and properties include `sarge_test`, `sarge_test_mode`, `sarge_tester_user_id`, and `sarge_impersonated_user_id`.
- [ ] Run `pnpm --filter @sarge/pixel test -- client.test.ts` and confirm the new tests fail because the methods and markers do not exist yet.
- [ ] Add `impersonate(userId)` and `clearImpersonation()` to `SargeClient`, store impersonation at `sarge_impersonate:${siteId}`, store project user ids at `sarge_user:${siteId}`, and expose global `impersonate` / `clear_impersonation` helpers.
- [ ] Re-run `pnpm --filter @sarge/pixel test -- client.test.ts` and confirm the pixel tests pass.

### Task 2: Console Test-Traffic Filters

**Files:**
- Modify: `www/src/components/SessionFlowExplorer.tsx`
- Test: `www/src/components/SessionFlowExplorer.test.tsx`
- Modify: `www/src/pages/app/projects/[projectId].astro`

- [ ] Write failing tests proving the flow explorer has traffic filters for all/real/test and defaults to real traffic only.
- [ ] Run `pnpm --filter www test -- SessionFlowExplorer.test.tsx` and confirm the new tests fail because the filter does not exist.
- [ ] Add a traffic filter control, identify test events from `event.properties.sarge_test === true`, default to real traffic, and show a test badge in event detail/debug stream entries.
- [ ] Re-run `pnpm --filter www test -- SessionFlowExplorer.test.tsx` and confirm the console tests pass.

### Task 3: Verification

**Files:**
- No additional files.

- [ ] Run targeted package tests:

```bash
pnpm --filter @sarge/pixel test -- client.test.ts
pnpm --filter www test -- SessionFlowExplorer.test.tsx
```

- [ ] Run broader typecheck if targeted tests reveal type risk:

```bash
pnpm typecheck
```
