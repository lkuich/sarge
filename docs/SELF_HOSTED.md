# Self-Hosted Sarge

Self-hosted Sarge is for teams that want to run the event API and database in their own infrastructure while using the same lightweight browser pixel.

## What You Get

- Sarge API Docker image
- Prisma/Postgres schema and migrations, including persisted Production, Staging, and Development environments per site
- Browser pixel bundle
- Docker Compose example
- Platform guides for hosts such as Fly.io, Render, Railway, and VPS deployments
- Cloudflare + Neon reference notes for teams that want to mirror the hosted architecture
- Full control over database, retention, networking, and access logs

## When To Choose Self-Hosted

Choose self-hosted when:

- your team wants infrastructure control
- event data must stay in your cloud/account
- you want to evaluate Sarge before using hosted plans
- you already run Postgres and containerized services
- you need custom networking, private VPC access, or regional control

Choose hosted Sarge when you want us to operate the infrastructure and provide a ready-to-install endpoint.

## Deployment Shape

Minimum production deployment:

```text
Website/App
  -> Sarge pixel
  -> Sarge API container
  -> Postgres
```

Recommended services:

- one Sarge API container or autoscaled service
- one Postgres database
- HTTPS endpoint for event ingestion
- static hosting or CDN for the pixel bundle
- log drain or platform logs for operational debugging

## Required Environment Variables

```bash
DATABASE_URL="postgresql://user:password@host:5432/sarge?schema=public"
PORT="49828"
NODE_ENV="production"
```

## Setup Flow

1. Provision Postgres.
2. Run Prisma migrations.
3. Start the Sarge API container.
4. Host the pixel bundle from your domain or CDN.
5. Create a `Workspace`, `Site`, and three `SiteEnvironment` rows for each site you want to track.
6. Install the pixel snippet for the target environment on the target website or app.
7. Send a test event and confirm it appears in the database with the matching `siteEnvironmentId`.

## Example Pixel Snippet

```html
<script src="https://events.example.com/index.global.js"></script>
<script>
  sarge('init', {
    siteId: 'env_123_development',
    endpoint: 'https://events.example.com',
    attributionTtlDays: 28
  });

  sarge('track', 'PageView');
</script>
```

## Example Event Test

```bash
curl -X POST "https://events.example.com/v2/events" \
  -H "content-type: application/json" \
  -d '{
    "siteId": "env_123_development",
    "name": "TestEvent",
    "occurredAt": "2026-06-19T12:00:00.000Z",
    "sessionId": "manual_test_session",
    "userId": "manual_test_user",
    "properties": { "source": "curl" }
  }'
```

Expected response:

```json
{ "success": true }
```

## Server-Side and Postback Events

For backend events, set `SiteEnvironment.serverEventSecretHash` to the SHA-256 hash of a per-environment secret and call:

```bash
curl -X POST "https://events.example.com/v2/server/events" \
  -H "authorization: Bearer sarge_sk_example" \
  -H "content-type: application/json" \
  -d '{
    "siteId": "env_123_production",
    "name": "purchase.completed",
    "eventId": "order_123",
    "userId": "customer_123",
    "properties": { "order_id": "order_123", "value": 129.99, "currency": "USD" }
  }'
```

For affiliate or partner systems that only support URL callbacks, set `SiteEnvironment.postbackTokenHash` and use:

```text
https://events.example.com/v2/postback/env_123_production/postback_token_example?event=affiliate.conversion&click_id=click_123&order_id=order_123&value=42.50&currency=USD
```

Generate a token and hash:

```bash
node -e "const { createHash, randomBytes } = require('node:crypto'); const token = 'sarge_sk_' + randomBytes(32).toString('base64url'); console.log('token=' + token); console.log('sha256=' + createHash('sha256').update(token).digest('hex'));"
```

## Fly.io Deployment Guide Target

The Fly.io guide should include:

- creating a Fly app for the API
- attaching or configuring Postgres
- setting `DATABASE_URL`
- running Prisma migrations
- exposing HTTPS
- setting a custom domain such as `events.example.com`
- hosting the pixel bundle from the same domain or a CDN

## Operational Notes

- Sarge v2 does not preserve legacy `/pageView`, `/purchase`, or `/atc` routes.
- The API stores events only for known `SiteEnvironment` IDs. The request field is still named `siteId` for compatibility.
- The current Docker Compose file is optimized for local development; production packaging should use a dedicated API image.
- Browser pixel ingestion is public by design. Server-side and postback ingestion use per-environment credential hashes.
- Rate limiting, dashboard credential rotation UI, watchdog capture, and LLM querying are future product layers.

## Support Boundary

Self-hosted customers operate their own infrastructure. Sarge can provide setup docs, upgrade notes, and paid support, but uptime, backups, database retention, and platform security are owned by the self-hosting team.
