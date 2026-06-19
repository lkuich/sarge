# Project Audit

Audit date: 2026-06-19

## Summary

The workspace originally contained separate old JavaScript projects for the tracking API and browser client. The implementation has now been modernized into a root TypeScript `pnpm` workspace.

Active code:

- `apps/api/` - TypeScript Express API
- `packages/pixel/` - TypeScript browser pixel
- `apps/api/prisma/` - Prisma schema and migrations
- `docker-compose.yml` - root local development stack

The old JavaScript projects and previously present `www/` bundle are no longer kept in this workspace.

## What Sarge Does

Sarge is a lightweight event pixel and ingestion API. It is intended to help teams debug tracking implementations by recording what events fired, when they fired, and which payloads were present.

Current v2 flow:

1. A site loads the Sarge browser pixel.
2. The pixel initializes with a `siteId` and API endpoint.
3. The pixel stores `sarge_ref` and `sarge_aff` attribution from URL params.
4. The site calls `sarge('track', eventName, properties)`.
5. The pixel sends an event to `POST /v2/events`, with fallback to `GET /v2/e`.
6. The API validates the payload and stores it through Prisma/Postgres.

## Historical Findings Addressed

- Mixed npm/yarn package metadata replaced by a root `pnpm` workspace.
- Plain JavaScript API and pixel replaced with TypeScript packages.
- Knex/manual SQL path replaced with Prisma schema and migrations.
- Date contract fixed at the boundary: v2 uses ISO 8601 strings.
- Broken legacy route and client call shapes are no longer part of the v2 public API.
- Root Docker Compose now runs API and Postgres together for local development.
- Unit tests now cover API ingestion and pixel transport/storage behavior.

## Remaining Product/Engineering Gaps

- Deployment strategy is intentionally deferred.
- No dashboard UI exists yet.
- No auth, billing, rate limiting, or tenant management exists yet.
- No third-party pixel watchdog exists yet.
- No LLM event-query interface exists yet.
- Prisma migrations require a seeded `Client` record before events for a `siteId` can be stored.

## Verification Targets

Use these commands as the current baseline:

```bash
pnpm test
pnpm typecheck
pnpm build
docker compose config
```

Some tests use Supertest, which opens ephemeral local sockets. In restricted sandboxes, `pnpm test` may need to run outside the sandbox.
