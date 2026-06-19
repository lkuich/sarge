# Cloudflare + Neon Hosted Deployment

This is the primary hosted shared deployment path for Sarge.

## Architecture

```text
Customer site
  -> https://{site}.sarge.lkuich.com/pixel.js
  -> Cloudflare Worker
  -> Neon Postgres
```

Cloudflare owns the hosted edge, routing, TLS, CDN, and future custom-hostname path. Neon remains the Postgres source of truth.

## Required Accounts

- Cloudflare account with the `lkuich.com` zone
- Neon project/database
- GitHub repository with Actions enabled

## Required GitHub Secrets

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
NEON_DATABASE_URL
```

The Cloudflare token needs permission to deploy Workers, manage Worker secrets, and manage Worker routes for `lkuich.com`.

Minimum Cloudflare token permissions:

```text
Account > Workers Scripts > Read
Account > Workers Scripts > Edit or Write
Zone > Zone > Read
Zone > Workers Routes > Read
Zone > Workers Routes > Edit or Write
```

Scope the account permissions to `Loren.jk3@gmail.com's Account` and the zone permissions to `lkuich.com`.

Cloudflare's docs list both Dashboard and API permission names. In the dashboard, some permissions are labeled `Edit`; in the API list, the same permission may be labeled `Write`.

When creating the token, add separate policies:

1. Account policy scoped to `Loren.jk3@gmail.com's Account`.
2. Zone policy scoped to `lkuich.com`.

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
*.sarge.lkuich.com/*
```

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

1. Confirm `lkuich.com` is active in Cloudflare.
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

Deploy manually from local machine:

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
GET https://acme.sarge.lkuich.com/healthz
```

Pixel:

```http
GET https://acme.sarge.lkuich.com/pixel.js
```

Event ingestion:

```http
POST https://acme.sarge.lkuich.com/v2/events
GET  https://acme.sarge.lkuich.com/v2/e
```

## Current Limitations

- Provisioning `Workspace`/`Site` records is not automated yet.
- Custom customer domains are not implemented yet.
- Cloudflare Hyperdrive is documented as a future Neon connectivity optimization, not enabled yet.
- The Worker expects the hosted schema shape described in `docs/HOSTED_SHARED_TECHNICAL_SPEC.md`.
