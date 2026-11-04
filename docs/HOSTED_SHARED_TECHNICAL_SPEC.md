# Hosted Shared Infrastructure Technical Spec

Current implementation reference, reviewed 2026-11-04. The Prisma schema and runtime source remain authoritative; dated proposals in `docs/superpowers/` record design history.

## Architecture

```text
Customer site → track.sargetrack.app/pixel.js?env={siteEnvironmentId}
              → Cloudflare sarge-hosted Worker → Neon Postgres
Signed-in user → sargetrack.app → Astro sarge-www Worker → Neon Postgres
                                         ↳ Clerk organizations / Stripe billing
```

The tracking Worker lives in `apps/worker/`; the portal lives in `www/`. Both deploy through GitHub Actions on main. The Express runtime in `apps/api/` supports local/container ingestion and exports, but does not expose MCP. Cloudflare owns hosted routing and TLS; Neon is the source of truth. Hyperdrive is not enabled.

## Provisioning and tenancy

The portal creates projects and persisted Production, Staging, and Development environments. The active Clerk organization identifies the workspace. Organization admins manage credentials, webhooks, privacy controls, billing, sharing, and deletion. Project shares provide view/edit access as described in [CLERK_ORGANIZATIONS.md](CLERK_ORGANIZATIONS.md).

Core models are `Workspace`, `Site`, `SiteEnvironment`, `Event`, `ApiToken`, `PublicVerificationToken`, `WebhookEndpoint`, `DiagnosticRun`, and `DiagnosticFinding`. See `apps/api/prisma/schema.prisma` for fields and relationships. Ingestion's `siteId` means the environment ID. Stored/exported `Event.siteId` is the parent project; `Event.siteEnvironmentId` is the environment.

No public `/admin/workspaces` or `/admin/sites` provisioning API is implemented. The portal uses authenticated server-side actions.

## Pixel and request routing

The standard snippet queues one `page.view`, then loads the environment-specific pixel from the shared host. `/pixel.js?env={siteEnvironmentId}` returns the bundled pixel with `window.__SARGE_CONFIG__`; it initializes automatically and is cached for 300 seconds. Do not call `init` again after loading it, since initialization resets the session ID.

On the configured shared host, environment IDs select the pixel or ingest destination. Tenant host routing also resolves `SiteEnvironment.endpointHost`; JSON ingestion rejects a mismatched environment. The compact fallback uses the host-resolved environment. Unknown tenant hosts return 404. Health checks do not require a tenant.

The portal's customer tracking-subdomain instructions require manual DNS, TLS, and route verification before switching the snippet. Automated custom-hostname provisioning is not implemented.

## Endpoints and credentials

| Endpoint | Purpose | Authentication |
| --- | --- | --- |
| `GET /healthz` | Liveness | None |
| `GET /pixel.js?env=...` | Hosted environment pixel | Public environment ID |
| `POST /v2/events`, `GET /v2/e` | Browser ingestion | Public environment ID / tenant host |
| `POST /v2/server/events` | Backend events | Environment server secret |
| `GET` or `POST /v2/postback/{environmentId}/{token}` | Partner callbacks | Environment URL token |
| `GET /v2/export/events` | Raw event pagination | Environment read token |
| `POST /mcp` | Read-only `list_events` tool | Same environment read token |

Export and MCP use the shared host. Server, postback, and read credentials are stored as SHA-256 hashes; read tokens require `events:read` and must not be revoked. Temporary portal verification links expire after 30 minutes and are separate from API credentials. See [API.md](API.md) and the [MCP guide](../www/public/docs/mcp.md).

## Portal views and loading

Projects use Overview, Sessions, Live events, Diagnostics, Setup, and Settings tabs. URLs preserve the selected environment. The server loads only the data for the selected view; the session-flow client and live-event polling mount only where needed. Metadata-only API access checks avoid loading the whole dashboard on poll requests.

Overview loads aggregate traffic data. Sessions fetches filtered cursor pages. Live events polls a bounded recent list. Diagnostics loads persisted findings or a bounded live fallback. Setup loads installation details and webhook configuration. Settings loads privacy controls. Index migrations include `(siteEnvironmentId, occurredAt, id)` for event cursor queries.

## Data controls and limits

- JSON ingestion has a 64 KiB body limit. Browser ingestion is intentionally public; server calls, postbacks, exports, and MCP require their own credentials.
- Monthly event budgets are enforced per workspace; exceeded budgets return 429. General per-IP/per-second request throttling is not implemented.
- Property redaction and allow/block lists apply before storage. Envelope fields such as URLs, titles, identifiers, and attribution are not scrubbed by property redaction.
- Portal/export reads respect configured plan retention. Every 30 minutes, `runScheduledMaintenance` physically purges up to 5,000 expired events on Free, Starter, and Growth. Scale and unknown plans are excluded; custom retention requires an agreed policy. Backlogs can delay physical removal.
- The same job processes project/workspace deletion requests in up to ten batches of 5,000 events per run. It atomically claims requests, fences stale workers, and cleans metadata transactionally after events are gone. Interrupted claims are recoverable after 15 minutes; failures retry after 30 minutes. Active Stripe subscriptions block workspace deletion until cancellation takes effect. Diagnostics run after maintenance, including when maintenance fails.
- Webhook destination configuration exists, but outbound delivery and retries do not.

## Diagnostics

The ingestion Worker runs diagnostics every 30 minutes for up to 50 active Production environments. Default samples are 200 recent events over 60 minutes. The scheduled environment selector does not currently gate by plan; portal access to AI reviews requires Growth or higher. Prior findings are replaced on each completed run.

Deterministic rules produce findings and Workers AI summarizes nonempty results. The configured model is `@cf/meta/llama-3.1-8b-instruct-fp8`. Tracked-page checks select recent captured URLs, with a 25-URL per-environment ceiling, 10-URL shared run budget, and 5-second timeout by default. This is bounded monitoring, not a crawl or guaranteed coverage of every environment/page on every run. See [AI_FEATURES.md](AI_FEATURES.md).

## Traffic reporting and flow completeness

The project Overview and workspace overview count all retained, configured-host **real** events in the last 24 hours, excluding events explicitly marked `sarge_test: true` and watchdog events (`meta.pixel.fire`, `google.tag.fire`, `data_layer.push`). Identified user/session counts exclude absent IDs. Previous-period comparisons use the preceding 24 hours. The weekly chart uses UTC calendar days and excludes future-dated events. Event-type breakdowns include every matching type, not only the top four. Workspace event totals cover all project environments; project Overview metrics cover the selected environment.

User and session flows query the selected environment with date, traffic, event-category, search, campaign and affiliate filters **before** pagination. They no longer sample events with `NTILE`. The endpoint `/api/project-events/:environmentId?view=flow` returns exact matching event/group totals and a timestamp/ID cursor. Requests remain workspace-authorized and respect retention and configured-host filtering, including server events without a URL.

The graph loads 80 matching events at a time. **Load more events** appends the next page; loaded counts and matching totals distinguish partial journeys from complete results. A frozen upper date boundary prevents new arrivals from shifting a paging session. Date presets are relative to the current time, rather than the latest sampled event. Events lacking a user/session ID remain visible in a labeled unidentified group. **Export loaded JSON** exports only the loaded graph and includes pagination/completeness metadata. Refresh restarts the query; failed requests show an error instead of falling back to a smaller list.

Flow controls and times use the viewer’s local timezone; Live events and public verification timestamps explicitly show UTC, consistently before and after refresh. Focused-group exports are never labeled complete for the full query.

Live events intentionally shows the latest 12 events, public verification shows up to 30, and recent impersonation-user suggestions derive from the latest 80 events **per environment**. These are inspection lists, not traffic totals. AI reviews operate on bounded recent-event samples and are labeled accordingly. Database failures never substitute demo traffic, and the overview does not claim an ingestion failure rate that Sarge does not measure.

A purchase event reports the value supplied by the integration. Sarge cannot infer later installment payments or refunds that the integration does not send; flow completeness does not imply complete payment-ledger revenue.
