# Project Sharing and Workspace Controls

**Date:** 2026-06-24
**Status:** Approved design, pending spec review
**Scope:** `www/` portal, Prisma schema in `apps/api/prisma/`

## Problem

Project access is currently tied to a single user-owned workspace. A signed-in user can
create a workspace and then create projects inside it, but there is no way to share a
project with another person. The Overview page also assumes a workspace, while the product
needs explicit controls to create or delete an empty workspace and a clear separation
between projects owned by the viewer's workspace and projects shared with the viewer.

## Goals

1. Keep the current single-owned-workspace model for this pass.
2. Let a user create their owned workspace from Overview when they do not have one.
3. Let a user delete their owned workspace only when it has no projects.
4. Add a share button on each owned project.
5. Show a modal listing existing shares and a form for inviting a person by email.
6. Support `view` and `edit` roles for project shares.
7. Send invite email through the SendGrid SDK when `SENDGRID_API_KEY` is configured, while
   allowing the invite record to be created before the key exists.
8. Split Overview projects into "Your workspace" and "Shared with you".

## Non-goals

- No multiple owned workspaces per user yet.
- No workspace switcher.
- No account-wide membership management changes.
- No invite acceptance page or tokenized accept flow in this pass.
- No project sharing from the public verify page.
- No deleting non-empty workspaces.

## Current State

`Workspace.ownerUserId` is unique, so one signed-in Clerk user can own one workspace. Sites
belong to a workspace through `Site.workspaceId`. The portal reads project data through
`www/src/lib/sarge-demo.ts`, with `getViewerAccount()` returning a single `SargeAccount`
containing `projects`. Project write actions are guarded by the coarse
`canAdministerAccount()` role, which is currently derived from `SARGE_ADMIN_USER_IDS`.

The Overview page already has workspace creation UI for first setup. It does not expose a
delete action, and it renders all projects as one list.

## Data Model

Add a project share table:

```prisma
model ProjectShare {
  id              String   @id @default(cuid())
  siteId          String
  email           String
  role            String
  invitedByUserId String
  acceptedUserId  String?
  createdAt       DateTime @default(now())
  acceptedAt      DateTime?

  site Site @relation(fields: [siteId], references: [id], onDelete: Cascade)

  @@unique([siteId, email])
  @@index([email])
  @@index([acceptedUserId])
}
```

Add `projectShares ProjectShare[]` to `Site`.

Emails are stored lowercased and trimmed. Valid roles are `view` and `edit`; validation
lives in the portal service layer rather than relying on a database enum, matching the
current string-based schema style for environments and statuses.

## Access Model

Owned projects are projects whose `Site.workspaceId` belongs to the viewer's owned
workspace.

Shared projects are projects with a `ProjectShare` row where:

- `acceptedUserId` equals the viewer's Clerk user id, or
- the share email matches one of the viewer's email addresses.

Routes that load authenticated project data must call `Astro.locals.currentUser()` and pass
the viewer's verified email addresses into the project loader. The project loader uses
those emails, plus `acceptedUserId`, to find shared projects. If Clerk user loading fails,
the route still loads owned projects by `userId` and logs the shared-project lookup as
unavailable for that request.

Role behavior:

- `view`: can open the project detail page and inspect events, diagnostics, install
  snippets, flows, and public verify links.
- `edit`: includes `view` plus project-level management actions: webhooks and
  environment credentials.
- Owned workspace admin: can share projects, change share roles, remove shares, create
  projects, and delete the empty owned workspace.

Shared users cannot create projects in the owner's workspace and cannot delete the
workspace.

## Service API

Extend `www/src/lib/sarge-demo.ts` with focused helpers:

```ts
export type ProjectShareRole = "view" | "edit";

export interface ProjectShare {
  id: string;
  email: string;
  role: ProjectShareRole;
  status: "pending" | "accepted";
  createdAt: string;
}

export interface SargeProject {
  // existing fields...
  ownership: "owned" | "shared";
  shareRole?: ProjectShareRole;
  shares: ProjectShare[];
}

export const deleteWorkspace = (...): Promise<DeleteWorkspaceResult>;
export const shareProject = (...): Promise<ShareProjectResult>;
export const updateProjectShare = (...): Promise<UpdateProjectShareResult>;
export const removeProjectShare = (...): Promise<RemoveProjectShareResult>;
```

`getViewerAccount()` returns one account with two project arrays:

```ts
ownedProjects: SargeProject[];
sharedProjects: SargeProject[];
projects: SargeProject[]; // compatibility alias: owned + shared
```

Existing callers can migrate incrementally while Overview uses the explicit arrays.

## Email Sending

Add the SendGrid SDK to `www` and isolate it in a small mail helper:

```ts
sendProjectInviteEmail({
  to,
  projectName,
  inviterLabel,
  role,
  appUrl,
});
```

Behavior:

- If `SENDGRID_API_KEY` is missing, create the share row and return a non-fatal warning:
  invite saved, email not sent.
- If SendGrid returns an error, keep the share row and show a warning so the owner can
  retry by re-saving or updating the share.
- Require `SARGE_EMAIL_FROM` before sending. If it is missing, create the share row and
  return the same non-fatal warning path as a missing `SENDGRID_API_KEY`.
- Email content links to `/app`; once the invitee signs in with the invited email,
  the shared project appears under "Shared with you".

## Overview UX

When no workspace exists, Overview keeps the existing create-workspace setup card.

When an owned workspace exists and has no owned projects, Overview shows a delete workspace
control. The action is a small guarded form with copy that makes the empty-only rule
clear. If projects exist, the delete action is hidden or disabled with "Remove projects
first" copy.

Project sections:

- "Your workspace": owned projects, New project button for admins, existing project cards.
- "Shared with you": shared projects with a small role badge (`view` or `edit`) and owner
  workspace name when available.

If either section is empty, use compact empty states rather than duplicating the setup
guide.

## Project Detail UX

Owned project pages show a share button near the page heading controls. The button opens a
modal or sheet using the existing `@base-ui/react` dialog primitives and local shadcn-style
components.

Modal contents:

- Existing shares list with email, role, and pending/accepted status.
- Role control for each share (`view` / `edit`).
- Remove action for each share.
- Invite form with email input and role selector.
- Inline success/error/warning messages after postback.

Shared project pages do not show the share button unless the viewer owns the project.
Shared `view` pages hide project-management forms. Shared `edit` pages show project-level
management forms.

## Workspace Deletion

`deleteWorkspace()` validates:

1. Viewer owns the workspace.
2. Workspace has zero `Site` rows.

If valid, delete the workspace and redirect to `/app`. If invalid, return a clear error.
The database must not cascade-delete projects from this UI path; empty-only deletion is a
service rule and a product rule.

## Testing

Use TDD for the behavior changes:

1. Data/service tests for empty workspace deletion:
   - succeeds for owned empty workspace,
   - fails for workspace with projects.
2. Data/service tests for sharing:
   - creates or updates a project share by lowercased email,
   - rejects invalid emails and invalid roles,
   - rejects sharing by a non-owner,
   - returns owned and shared project buckets.
3. Source-level Astro tests matching the current test style:
   - Overview contains "Your workspace" and "Shared with you".
   - Project detail imports and renders the share UI.
   - Shared view/edit permissions are reflected in management controls.

Verification runs at least:

```bash
pnpm --filter www test
pnpm --filter www build
```

Run broader workspace tests if shared data model changes affect generated Prisma types or
root package checks.

## Implementation Notes

- Preserve existing uncommitted changes in `www/astro.config.mjs` and
  `www/src/pages/app/index.astro`.
- Prefer a small React island for the share modal rather than adding large inline script
  blocks to `projects/[projectId].astro`.
- Keep the first pass compatible with fallback/demo data so the portal still renders
  without `DATABASE_URL`.
- Avoid introducing full workspace switching until multiple owned workspaces are a stated
  requirement.
