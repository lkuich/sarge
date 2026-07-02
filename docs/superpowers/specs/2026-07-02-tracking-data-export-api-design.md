# Tracking Data Export API Design

**Status:** Approved design direction, pending written spec review
**Date:** 2026-07-02
**Scope:** Add a v1 read-only REST API so teams can pull raw Sarge tracking events into their own analytics dashboards.

## Goal

Teams should be able to export their own Sarge tracking events through a stable REST API without using the browser dashboard or direct database access. The first version should expose raw event data only. Customers can build dashboards, warehouse jobs, or internal reports on top of that stream.

The API must keep read access separate from event ingestion credentials and must be tightly scoped to one project environment at a time.

## Non-Goals

- Do not add aggregate analytics endpoints in v1.
- Do not add workspace-wide export tokens in v1.
- Do not let ingestion secrets read event data.
- Do not add write, update, or delete operations.
- Do not replace the existing authenticated dashboard event stream.
- Do not introduce webhook delivery or warehouse sync as part of this feature.

## API Shape

Add a public read endpoint to `apps/api`:

```http
GET /v2/export/events
Authorization: Bearer sarge_read_...
```

The endpoint returns raw stored events for the `SiteEnvironment` attached to the read token. It should query by `Event.siteEnvironmentId`, not by a request-supplied environment ID.

Supported query parameters:

- `start`: optional ISO timestamp lower bound for `occurredAt`.
- `end`: optional ISO timestamp upper bound for `occurredAt`.
- `name`: optional exact event name filter.
- `source`: optional event source filter: `browser`, `server`, or `postback`.
- `sessionId`: optional exact session ID filter.
- `userId`: optional exact user ID filter.
- `limit`: optional page size, default `100`, maximum `1000`.
- `cursor`: optional opaque cursor from the previous response.

Events should sort by `occurredAt DESC, id DESC` so pagination is deterministic when multiple events share the same timestamp.

Example response:

```json
{
  "events": [
    {
      "id": "evt_123",
      "siteId": "site_123",
      "siteEnvironmentId": "env_123_production",
      "source": "browser",
      "name": "purchase.completed",
      "occurredAt": "2026-06-19T12:00:00.000Z",
      "receivedAt": "2026-06-19T12:00:01.000Z",
      "sessionId": "sess_123",
      "userId": "user_123",
      "ref": "summer-campaign",
      "affiliate": "partner-42",
      "url": "https://example.com/checkout",
      "referrer": null,
      "title": "Checkout",
      "properties": {
        "value": 129.99,
        "currency": "USD"
      }
    }
  ],
  "nextCursor": "eyJvY2N1cnJlZEF0IjoiMjAyNi0wNi0xOVQxMjowMDowMC4wMDBaIiwiaWQiOiJldnRfMTIzIn0="
}
```

Omit `nextCursor` or return it as `null` when there are no more results.

## Authentication

Add read-only API tokens that are separate from existing server-event and postback credentials. Project editors can create or rotate the token from the existing project credential area, and the plaintext token is shown once after creation.

Token behavior:

- Tokens are generated as one-time plaintext values with a `sarge_read_` prefix.
- Only a SHA-256 hash is stored.
- Each token belongs to one `SiteEnvironment`.
- V1 tokens have a single scope: `events:read`.
- Revoked tokens cannot authenticate.

Authorization flow:

1. Read `Authorization: Bearer ...`.
2. Hash the presented token.
3. Find a non-revoked token with scope `events:read`.
4. Use the token's `siteEnvironmentId` as the only tenant scope for the event query.

Missing, malformed, invalid, or revoked credentials return:

```json
{ "success": false, "error": "Invalid credentials" }
```

with HTTP `401`.

## Data Model

Add a new Prisma model:

```prisma
model ApiToken {
  id                String   @id @default(cuid())
  siteEnvironmentId String
  name              String
  scope             String
  tokenHash         String   @unique
  createdAt         DateTime @default(now())
  revokedAt         DateTime?

  siteEnvironment SiteEnvironment @relation(fields: [siteEnvironmentId], references: [id], onDelete: Cascade)

  @@index([siteEnvironmentId, createdAt])
  @@index([scope, revokedAt])
}
```

Add `apiTokens ApiToken[]` to `SiteEnvironment`.

The dashboard should create tokens through the same project-management authorization boundary used for server-event and postback credentials. Creating a new read token should revoke any prior active `events:read` token for that environment so v1 avoids multi-token management UI.

## Repository Boundary

Extend the `apps/api` repository interface with read-side methods rather than querying Prisma directly from route handlers:

- `findReadToken(token: string): Promise<ReadApiToken | null>`
- `listEventsForExport(siteEnvironmentId: string, query: EventExportQuery): Promise<EventExportPage>`

The Prisma implementation owns tenant scoping, filters, sort order, and pagination. Route handlers should validate request shape, authenticate, call the repository, and translate known errors to HTTP responses.

## Cursor Pagination

Use an opaque base64url JSON cursor that contains the last event's `occurredAt` and `id`.

The next page filter should select rows where:

- `occurredAt` is older than the cursor timestamp, or
- `occurredAt` equals the cursor timestamp and `id` sorts before the cursor ID.

The endpoint should fetch `limit + 1` rows to determine whether another page exists. Return at most `limit` events.

Invalid cursor values return `400` with:

```json
{ "success": false, "error": "Invalid export query" }
```

## Privacy And Retention

The export endpoint returns the event rows Sarge already stored after ingestion-time privacy controls. It should not rehydrate redacted data or bypass customer property policies.

Apply the same plan retention window used by dashboard event reads. The export query should join from `SiteEnvironment` to `Site` and `Workspace`, derive the workspace plan, and filter out events older than that plan's retention window. If the retention helper currently lives outside shared code, move the plan-retention expression into shared code before using it from both the dashboard and `apps/api`.

## Error Handling

- `200`: successful export response.
- `400`: invalid query parameter, timestamp, source, limit, or cursor.
- `401`: missing, invalid, or revoked bearer token.
- `500`: unexpected storage or server failure.

Unexpected failures should be logged server-side and return:

```json
{ "success": false, "error": "Unable to export events" }
```

## Documentation

Update `docs/API.md` with:

- Purpose of the export API.
- Authentication example.
- Query parameter table.
- Example `curl`.
- Example response.
- Error responses.
- Note that v1 is raw-event export only.
- Note that tokens are environment-scoped.

## Testing

Use test-first implementation.

Add API tests for:

- missing bearer token returns `401`.
- invalid token returns `401`.
- revoked token returns `401`.
- valid read token returns only events from its environment.
- filters apply for `start`, `end`, `name`, `source`, `sessionId`, and `userId`.
- invalid query parameters return `400`.
- `limit` defaults to `100` and caps at `1000`.
- cursor pagination returns deterministic next pages.
- response fields match the public contract.
- creating a read token revokes the previous active read token for the same environment.

Add repository or integration coverage for:

- token hash lookup.
- tenant scoping by `siteEnvironmentId`.
- cursor ordering for events with equal `occurredAt`.

## Acceptance Criteria

- A team can call `GET /v2/export/events` with a valid environment-scoped read token and receive raw tracking events.
- The endpoint never accepts server-event or postback credentials for read access.
- A token for one environment cannot read another environment's events.
- A project editor can create or rotate an environment read token from the dashboard and sees the plaintext token once.
- Customers can page through event history without duplicate or skipped rows under stable data.
- Export responses respect the workspace plan retention window.
- The API contract is documented in `docs/API.md`.
