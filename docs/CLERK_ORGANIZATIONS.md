# Clerk Organizations

Sarge uses the active Clerk Organization as its tenant boundary.

## Access model

- Every authenticated app request requires an active Clerk Organization.
- Clerk `org:admin` members are Sarge workspace admins.
- Other Organization members receive read-only access to the Organization's projects.
- Project-level email shares remain available for external collaborators. An `edit`
  share can use project editing tools, but Organization-admin access is required for
  credentials, webhooks, billing, workspace controls, project sharing, and deletion.
- `SARGE_ADMIN_USER_IDS` is no longer used.

All authorization is derived server-side from `Astro.locals.auth()`. The active
`orgId` selects the Sarge `Workspace`; client-supplied Organization IDs or Roles are
never trusted.

## Database migration

Deploy Prisma migrations before deploying the updated web application:

```sh
pnpm prisma:deploy
```

The migration adds `Workspace.clerkOrganizationId`, makes it unique, and removes the
old one-workspace-per-user constraint.

Existing personal workspaces have a safe compatibility path: when their original
owner first visits Sarge as an admin of an active Clerk Organization, that unclaimed
workspace is linked to the active Organization. After that, it can only be accessed
through that Organization.

## Clerk configuration

In the Clerk Dashboard:

1. Enable Organizations.
2. Prefer required Organization membership for the Sarge application.
3. Keep the default `org:admin` and `org:member` Roles enabled.
4. Add each user to the appropriate Organization.

The application renders Clerk's Organization switcher in the app header and sends
signed-in users without an active Organization through the Organization selection
flow.
