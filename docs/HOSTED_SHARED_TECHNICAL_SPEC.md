# Hosted Shared Infrastructure Technical Spec

This spec describes the standard hosted Sarge option: customers deploy with us, receive a custom endpoint, and install a customized pixel. Infrastructure is shared, data is tenant-scoped by workspace/site, and the primary hosted platform is Cloudflare with Neon Postgres.

## Goals

- Provision a new customer workspace in minutes.
- Give each customer a simple endpoint such as `https://acme.sargetrack.app`.
- Serve a customized pixel that already knows its endpoint and environment ID.
- Store events in shared Postgres with strong tenant scoping.
- Keep pricing aggressive by avoiding per-customer infrastructure by default.
- Use Cloudflare's domain, CDN, Worker, and platform features as the hosted foundation.
- Use Neon as the shared Postgres system of record.
- Leave room for custom domains, edge ingestion, and dedicated hosting later.

## Customer Experience

Provisioning flow:

1. Customer creates a workspace.
2. Customer creates a site/app.
3. Sarge assigns a hosted subdomain.
4. Sarge returns an install snippet.
5. Customer installs the snippet.
6. Events appear in the Sarge dashboard/event stream.

Example snippet:

```html
<script src="https://acme.sargetrack.app/pixel.js"></script>
<script>
  sarge('init');
  sarge('track', 'PageView');
</script>
```

The pixel served from `acme.sargetrack.app` is customized with:

- API endpoint: `https://acme.sargetrack.app`
- environment ID
- attribution TTL
- feature flags
- future watchdog settings

## Architecture

```text
Customer site
  -> https://{siteSlug}.sargetrack.app/pixel.js
  -> https://{siteSlug}.sargetrack.app/v2/events
  -> Cloudflare Worker
  -> tenant resolver
  -> event validation
  -> Neon Postgres
```

Shared services:

- Cloudflare Worker API
- Neon Postgres database
- Cloudflare-managed DNS/wildcard domain
- pixel serving route
- workspace/site provisioning service
- dashboard/event stream service in a later phase

Initial deployment files:

- `apps/worker/`
- `apps/worker/wrangler.jsonc`
- `.github/workflows/cloudflare-worker.yml`

Required platform capability:

- Cloudflare DNS for `sargetrack.app`
- wildcard routing for `*.sargetrack.app`
- TLS for hosted subdomains
- request routing by `Host` header in the Worker
- Neon Postgres connectivity from Cloudflare, preferably through Hyperdrive when production traffic warrants it

## Provider Choices

Use Cloudflare for hosted shared infrastructure:

- Workers for API/event ingestion
- Cloudflare DNS for `sargetrack.app`
- Cloudflare CDN/cache for `/pixel.js`
- Cloudflare for SaaS/custom hostnames when customer-owned domains are added
- Workers for Platforms later if Sarge supports customer-specific or AI-generated script execution

Use Neon for Postgres:

- shared production Postgres
- Prisma migrations
- Neon branches for preview/test environments
- optional separate Neon projects for dedicated hosted customers

Do not use Cloudflare D1 for the core event store in this phase. D1 is SQLite-oriented and would move the product away from the current Prisma/Postgres architecture.

## Data Model Additions

Extend the current Prisma schema with:

```prisma
model Workspace {
  id        String   @id @default(cuid())
  slug      String   @unique
  name      String
  createdAt DateTime @default(now())
  sites     Site[]
}

model Site {
  id                  String   @id @default(cuid())
  workspaceId         String
  slug                String   @unique
  name                String
  endpointHost        String   @unique
  attributionTtlDays  Int      @default(28)
  pixelEnabled        Boolean  @default(true)
  createdAt           DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id])
  events    Event[]
}
```

Update `Event`:

```prisma
siteId String
site   Site @relation(fields: [siteId], references: [id])
```

The current hosted schema uses `Workspace` and `Site` as the product concepts, with persisted `SiteEnvironment` rows for Production, Staging, and Development. `Event.siteId` keeps the parent project for grouping, while `Event.siteEnvironmentId` references the environment that owns the pixel, debug stream, flows, webhooks, and public verify URL.

## Request Routing

Tenant resolution rules:

1. Read `Host` header.
2. Match host to `SiteEnvironment.endpointHost`.
3. For `/pixel.js`, serve a generated pixel configuration for that environment.
4. For `/v2/events`, require payload `siteId` to match the resolved environment ID.
5. For `/v2/e`, ignore any mismatched `sid` if host resolution is present and use the resolved environment ID.
6. Return `404` for unknown hosts.
7. Return `403` for known hosts with mismatched environment IDs.

This prevents one customer endpoint from submitting events for another site.

## Pixel Serving

Add route:

```http
GET /pixel.js
```

Response:

- JavaScript
- `content-type: application/javascript`
- cacheable for a short period, such as 5 minutes
- includes the current bundled pixel plus a small site config bootstrap

Generated shape:

```js
window.__SARGE_CONFIG__ = {
  siteId: "env_123_production",
  endpoint: "https://acme.sargetrack.app",
  attributionTtlDays: 28
};
```

Then the snippet can call:

```js
sarge('init');
```

When no options are passed to `init`, the pixel reads `window.__SARGE_CONFIG__`.

## API Changes

Keep current v2 endpoints:

- `POST /v2/events`
- `GET /v2/e`
- `GET /healthz`

Add hosted behavior:

- resolve environment from `Host`
- reject unknown hosts
- reject host/environment mismatches
- include workspace/site/environment IDs in logs
- prepare for event-stream subscriptions later

Add provisioning endpoints in a protected admin API:

```http
POST /admin/workspaces
POST /admin/sites
GET /admin/sites/:id/snippet
PATCH /admin/sites/:id
```

These routes require internal auth before launch.

## Provisioning Flow

Workspace creation:

1. Validate desired workspace slug.
2. Create `Workspace`.
3. Create first `Site`.
4. Assign `endpointHost = "{siteSlug}.sargetrack.app"`.
5. Return install snippet.

Site creation:

1. Validate site slug uniqueness.
2. Create `Site`.
3. Assign hosted endpoint.
4. Return pixel URL and snippet.

Custom domains later:

1. Customer adds CNAME to hosted target.
2. Sarge verifies DNS through Cloudflare for SaaS/custom hostname flow.
3. Cloudflare provisions TLS certificate.
4. `Site.endpointHost` or a separate `SiteDomain` table maps host to site.

## Security And Isolation

Baseline controls:

- tenant resolution by host
- environment ID mismatch rejection
- request body size limits
- per-environment rate limits
- CORS allowed for ingestion routes
- admin routes protected
- structured logs include workspace/site/environment IDs

Privacy controls to add before public hosted launch:

- configurable retention
- payload size limits
- PII redaction rules
- event property allow/block lists
- deletion by workspace/site

## Implementation Phases

### Phase 1: Hosted Routing Foundation

- Add `Workspace` and `Site` models.
- Migrate current `Client` concept to `Site`.
- Add host-based environment resolver middleware.
- Add `/pixel.js` route.
- Let `sarge('init')` read generated config.
- Add tests for host/environment matching.

### Phase 2: Provisioning

- Add admin provisioning routes.
- Add slug validation.
- Generate install snippets.
- Add seed/dev commands for local hosted-style sites.
- Document hosted setup.

### Phase 3: Operations

- Add rate limits.
- Add structured logs.
- Add event retention job.
- Add custom domain model.
- Add Cloudflare for SaaS custom hostname provisioning.
- Add Hyperdrive for Neon connection pooling/latency if direct Neon connections become a bottleneck.
- Add dashboard/event stream integration.

## Test Cases

- unknown host returns `404`
- known host serves `/pixel.js`
- generated pixel config includes endpoint, environment ID, and TTL
- `sarge('init')` works with generated config and no explicit options
- event payload with matching host and environment ID is accepted
- event payload with mismatched host and environment ID returns `403`
- compact GET fallback resolves environment from host
- provisioning creates workspace, site, endpoint host, and snippet
- duplicate workspace/site slugs are rejected

## Open Deployment Decisions

These should be decided during the deployment phase:

- hosting provider for shared API
- wildcard DNS provider
- TLS automation strategy
- database provider
- Cloudflare account/zone ownership model
- Worker deployment pipeline
- Hyperdrive adoption threshold
- event retention defaults
- admin authentication provider
- billing/metering provider
