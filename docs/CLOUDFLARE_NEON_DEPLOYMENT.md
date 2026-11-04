# Cloudflare + Neon Hosted Deployment

This is the primary hosted shared deployment path for Sarge.

## Architecture

```text
Customer site
  -> https://track.sargetrack.app/pixel.js?env={siteEnvironmentId}
  -> Cloudflare Worker
  -> Neon Postgres
```

Cloudflare owns the hosted edge, routing, TLS, CDN, and future custom-hostname path. Neon remains the Postgres source of truth.

## Required Accounts

- Cloudflare account with the `sargetrack.app` zone
- Neon project/database
- GitHub repository with Actions enabled

## Required GitHub Secrets

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
NEON_DATABASE_URL
```

The Cloudflare token needs permission to deploy Workers, manage Worker secrets, and manage Worker routes for `sargetrack.app`.

Minimum Cloudflare token permissions:

```text
Account > Workers Scripts > Read
Account > Workers Scripts > Edit or Write
Zone > Zone > Read
Zone > Workers Routes > Read
Zone > Workers Routes > Edit or Write
```

Scope the account permissions to `Loren.jk3@gmail.com's Account` and the zone permissions to `sargetrack.app`.

Cloudflare's docs list both Dashboard and API permission names. In the dashboard, some permissions are labeled `Edit`; in the API list, the same permission may be labeled `Write`.

When creating the token, add separate policies:

1. Account policy scoped to `Loren.jk3@gmail.com's Account`.
2. Zone policy scoped to `sargetrack.app`.

If you only edit an `Entire Account` policy, Cloudflare will not show zone-only permissions like `Workers Routes`.

## Worker Configuration

Worker package:

```text
apps/worker/
```

Wrangler config:

```text
apps/worker/wrangler.jsonc
```

Default route:

```text
track.sargetrack.app/*
*.sargetrack.app/*
```

The shared-host deployment uses the exact `track.sargetrack.app` hostname for smoke testing. Tenant subdomains such as `demo.sargetrack.app` are covered by Cloudflare's default one-level wildcard certificate for the `sargetrack.app` zone.

Default Worker name:

```text
sarge-hosted
```

## Neon Setup

1. Create a Neon project.
2. Create the production database.
3. Copy the pooled or serverless-compatible connection string.
4. Add it to GitHub as `NEON_DATABASE_URL`.
5. Run Prisma migrations against the Neon database.

Development migration command:

```bash
DATABASE_URL="postgresql://..." pnpm prisma:migrate
```

Production/CI migration command:

```bash
DATABASE_URL="postgresql://..." pnpm prisma:deploy
```

Use `prisma:migrate` while developing migrations locally. Use `prisma:deploy` for Neon production or GitHub Actions because it applies committed migrations without trying to create a new migration.

## Cloudflare Setup

1. Confirm `sargetrack.app` is active in Cloudflare.
2. Confirm Cloudflare manages DNS for the zone.
3. Create a Cloudflare API token for Worker deploys.
4. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to GitHub secrets.
5. Confirm `apps/worker/wrangler.jsonc` has the right route and zone.

## Deployment

Deploy from CI:

```text
push to main
```

The CI pipeline:

1. installs dependencies
2. generates the Prisma client
3. runs typecheck/tests/build
4. applies committed Prisma migrations to Neon
5. deploys the Cloudflare Worker
6. sets the Worker `DATABASE_URL` secret

The portal is deployed separately by `.github/workflows/cloudflare-www.yml` when `www/**` changes on main. It builds the Astro app, checks the docs bundle and tests, deploys `www/dist/server/wrangler.json` with `--keep-vars`, then sets `DATABASE_URL`. Portal builds also use Clerk secrets; see [www/README.md](../www/README.md).

Deploy the ingestion Worker manually from the repository root:

```bash
pnpm --filter @sarge/worker run deploy
```

Set or update the Worker database secret manually:

```bash
cd apps/worker
printf '%s' "$NEON_DATABASE_URL" | pnpm wrangler secret put DATABASE_URL
```

## Hosted Endpoints

Health:

```http
GET https://track.sargetrack.app/healthz
```

Pixel:

```http
GET https://track.sargetrack.app/pixel.js?env={siteEnvironmentId}
```

Event ingestion:

```http
POST https://track.sargetrack.app/v2/events
GET  https://track.sargetrack.app/v2/e
POST https://track.sargetrack.app/v2/server/events
GET  https://track.sargetrack.app/v2/postback/{siteEnvironmentId}/{token}
GET  https://track.sargetrack.app/v2/export/events
POST https://track.sargetrack.app/mcp
```

## Current Limitations

- The portal provisions Clerk-organization workspaces, projects, and three environments. There is no public `/admin/*` provisioning API.
- Setup provides custom tracking-subdomain instructions and a downloadable pixel. Customer DNS, TLS, and routing verification remain manual; automated custom-hostname provisioning is not implemented.
- Cloudflare Hyperdrive is documented as a future Neon connectivity optimization, not enabled yet.
- The Worker expects the current Prisma schema in `apps/api/prisma/schema.prisma`.
- Outbound webhook delivery is not implemented.
- The existing 30-minute Worker cron runs deletion/retention maintenance before diagnostics. Each run handles up to ten 5,000-event deletion batches and purges up to 5,000 expired Free/Starter/Growth events. Scale cleanup is excluded pending an agreed policy. Monitor the `Data maintenance completed` log counts and failed `DeletionRequest` rows; large backlogs require multiple runs. Workspace deletion requires a canceled Stripe subscription.
- Event cursor queries use the concurrent `(siteEnvironmentId, occurredAt, id)` index added in November 2026. Apply the committed migrations before deploying dependent changes.

For maintenance SQL verification, create an empty loopback PostgreSQL database named `sarge_maintenance_test...`, apply the Prisma migrations, and run `SARGE_MAINTENANCE_TEST_DATABASE_URL=postgresql://.../sarge_maintenance_test... node scripts/verify-data-maintenance.mjs` with Node 24+. The script exercises the real maintenance queries against local Postgres, including rollback, tenant isolation, concurrent claims, ingestion locks, and retention bounds. It refuses non-local or populated databases and leaves its fixture data for inspection; use a fresh database for another run.

## Historical traffic reporting verification (2026-10-27)

Portal traffic reporting was deployed to `sarge-www` at `sargetrack.app` and
`www.sargetrack.app`, version `3b5a785b-e5a1-46f2-a340-4f400a795fb5`, using the
framework-generated `www/dist/server/wrangler.json` with `--keep-vars`. No
migration or ingestion-Worker deployment was needed.

Validation: 151 portal tests passed, Astro production build and Wrangler dry run
passed, and live read-only queries reconciled event mix with the 24-hour total.
For the investigated three-day interval, all 9 conversion events (including 3
purchases) were returned without sampling. Timestamp/ID pagination returned each
event once. Authenticated production-browser checks confirmed conversions and
loading the second page; unauthenticated requests still return HTTP 401.
The standalone TypeScript check reports the same 21 errors as the unchanged HEAD
baseline (Clerk appearance, Neon generic types, and a notification test).
