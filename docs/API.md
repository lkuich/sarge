# Sarge API

The active API lives in `apps/api/`. It is a TypeScript Express service that validates v2 event payloads and stores them through Prisma/Postgres.

## Runtime

```bash
pnpm --filter @sarge/api dev
```

With Docker Compose:

```bash
docker compose up postgres api
```

Default local API URL:

```text
http://localhost:49828
```

Default local database URL:

```text
postgresql://sarge:sarge@localhost:5432/sarge_dev?schema=public
```

## Database

Prisma is the source of truth:

```text
apps/api/prisma/schema.prisma
```

Core models:

- `Workspace`
- `Site`
- `SiteEnvironment`
- `Affiliate`
- `Event`

`Site` is the customer-facing project. `SiteEnvironment` is the tracking identity for Production, Staging, or Development. Events, diagnostics, findings, and webhooks carry `siteEnvironmentId`. API payloads still use the field name `siteId` for browser compatibility, but the value should be a `SiteEnvironment.id`.

Apply migrations:

```bash
DATABASE_URL="postgresql://sarge:sarge@localhost:5432/sarge_dev?schema=public" pnpm prisma:migrate
```

Generate the Prisma client:

```bash
pnpm prisma:generate
```

## Endpoints

### Health

```http
GET /healthz
```

Response:

```text
ok
```

### Primary Event Ingestion

```http
POST /v2/events
Content-Type: application/json
```

Payload:

```json
{
  "siteId": "env_123_production",
  "name": "Purchase",
  "occurredAt": "2026-06-19T12:00:00.000Z",
  "sessionId": "sess_123",
  "userId": "user_123",
  "attribution": {
    "ref": "campaign-a",
    "aff": "affiliate-1",
    "expiresAt": "2026-07-17T12:00:00.000Z"
  },
  "context": {
    "url": "https://example.com/checkout",
    "referrer": "https://google.com",
    "title": "Checkout"
  },
  "properties": {
    "value": 129.99,
    "currency": "USD"
  }
}
```

Responses:

- `202` with `{ "success": true }` for accepted events.
- `400` with `{ "success": false, "error": "Invalid event payload" }` for malformed payloads.
- `500` with `{ "success": false, "error": "Unable to store event" }` for unexpected storage failures.

#### Reserved Test-Traffic Properties

Browser events generated while a tester is impersonating a user include Sarge-owned debug metadata in `properties`:

```json
{
  "sarge_test": true,
  "sarge_test_mode": "impersonation",
  "sarge_tester_user_id": "project-scoped-tester-id",
  "sarge_impersonated_user_id": "customer_123"
}
```

`userId` is the user flow being represented. `sarge_tester_user_id` identifies the project-scoped tester that generated the event, and `sarge_impersonated_user_id` records the represented user. Consumers should treat these fields as filtering/audit metadata, not authentication state.

### Compact Fallback Ingestion

```http
GET /v2/e
```

Query fields:

| Field | Meaning |
| --- | --- |
| `sid` | site environment/client ID |
| `n` | event name |
| `ts` | ISO event timestamp |
| `ss` | session ID |
| `u` | user ID |
| `ref` | optional attribution ref |
| `aff` | optional affiliate/campaign value |
| `exp` | optional ISO attribution expiration |
| `url` | optional page URL |
| `r` | optional referrer |
| `t` | optional page title |
| `p` | optional JSON string properties object |

Example:

```http
GET /v2/e?sid=env_123_production&n=Lead&ts=2026-06-19T12:00:00.000Z&ss=sess_123&u=user_123&p=%7B%22form%22%3A%22contact%22%7D
```

### Server-Side Event Ingestion

Use server-side ingestion for ecommerce backends, payment webhooks, order jobs, or other trusted systems that can send an `Authorization` header.

```http
POST /v2/server/events
Authorization: Bearer sarge_sk_...
Content-Type: application/json
```

Payload:

```json
{
  "siteId": "env_123_production",
  "name": "purchase.completed",
  "eventId": "order_123",
  "occurredAt": "2026-06-24T12:00:00.000Z",
  "userId": "customer_123",
  "properties": {
    "order_id": "order_123",
    "value": 129.99,
    "currency": "USD"
  }
}
```

Notes:

- The bearer token is checked against `SiteEnvironment.serverEventSecretHash`.
- `occurredAt`, `sessionId`, and `userId` are optional for server calls.
- If `sessionId` is omitted, Sarge stores `server:{eventId}` or a generated fallback.
- Stored events are marked with `source: "server"`.

### Server-Reported Vendor Pixel Calls

When your backend calls an upstream marketing API directly, such as Meta Conversions API or Google Measurement Protocol, report that dispatch through the same authenticated server endpoint. Use the watchdog event names so diagnostics can compare first-party conversions with vendor dispatches:

- `meta.pixel.fire` for Meta browser Pixel or Conversions API events.
- `google.tag.fire` for Google tag, Ads, Analytics, or Measurement Protocol events.

Send the vendor request/response summary in `properties`. Keep access tokens, raw emails, phone numbers, and other secrets out of the payload.

```json
{
  "siteId": "env_123_production",
  "name": "meta.pixel.fire",
  "eventId": "order_123_meta_purchase",
  "occurredAt": "2026-06-24T12:00:00.000Z",
  "sessionId": "sess_123",
  "userId": "customer_123",
  "properties": {
    "vendor": "meta",
    "transport": "server",
    "command": "track",
    "event_name": "Purchase",
    "payload": {
      "order_id": "order_123",
      "value": 129.99,
      "currency": "USD"
    },
    "upstream": {
      "endpoint": "https://graph.facebook.com/v20.0/{pixel_id}/events",
      "status": 200,
      "ok": true,
      "request_id": "fb_req_123"
    },
    "implementation": {
      "mode": "server_gtm",
      "note": "This project does not fire fbq directly. Meta Purchase is dispatched server-side through GTM."
    }
  }
}
```

`properties.upstream.status` should be the HTTP status returned by the upstream API. If you build the properties with `normalizeServerVendorCallProperties` from `@sarge/core`, `properties.upstream.ok` is inferred from the status when omitted.
Use `properties.implementation.note` for short reviewer-facing context that should be included in AI diagnostics and implementation briefs.

### Tokenized Postback URLs

Use postback URLs for affiliate networks and partner tools that can only call a URL.

```http
GET /v2/postback/env_123_production/postback_token_...?event=affiliate.conversion&click_id=click_123&order_id=order_123&value=42.50&currency=USD
```

Supported query fields:

| Field | Meaning |
| --- | --- |
| `event`, `name`, or `n` | event name |
| `ts`, `occurredAt`, or `occurred_at` | optional ISO event timestamp |
| `click_id` | partner click identifier |
| `order_id` | order identifier |
| `transaction_id` | transaction identifier |
| `event_id` | event identifier |
| `value` or `amount` | conversion value; numeric strings are stored as numbers |
| `currency` | currency code |
| `ref` | optional attribution ref |
| `aff` or `affiliate` | optional affiliate value |
| `url` | optional page URL |
| `p` or `properties` | optional JSON string properties object |

Notes:

- The URL token is checked against `SiteEnvironment.postbackTokenHash`.
- Stored events are marked with `source: "postback"`.
- Prefer the server-side POST endpoint when the sender supports headers.

### Raw Event Export

Use raw event export when a team wants to build its own analytics dashboard, reporting job, or warehouse import from Sarge events.

Export is read-only and uses `sarge_read_...` tokens. These tokens are separate from server-event and postback credentials. Each read token is scoped to exactly one `SiteEnvironment`, and the endpoint does not accept a request-supplied environment ID.

```http
GET /v2/export/events
Authorization: Bearer sarge_read_...
```

Example:

```bash
curl -G "https://track.sargetrack.app/v2/export/events" \
  -H "authorization: Bearer sarge_read_..." \
  --data-urlencode "start=2026-06-01T00:00:00.000Z" \
  --data-urlencode "end=2026-07-01T00:00:00.000Z" \
  --data-urlencode "name=purchase.completed" \
  --data-urlencode "limit=100"
```

Query fields:

| Field | Meaning |
| --- | --- |
| `start` | optional ISO lower bound for `occurredAt` |
| `end` | optional ISO upper bound for `occurredAt` |
| `name` | optional exact event name |
| `source` | optional source: `browser`, `server`, or `postback` |
| `sessionId` | optional exact session ID |
| `userId` | optional exact user ID |
| `limit` | optional page size; defaults to `100`, max `1000` |
| `cursor` | optional opaque cursor from the previous response |

Response:

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
      "attributionExpiresAt": null,
      "url": "https://example.com/checkout",
      "referrer": null,
      "title": "Checkout",
      "properties": {
        "value": 129.99,
        "currency": "USD"
      }
    }
  ],
  "nextCursor": "eyJvY2N1cnJlZEF0IjoiMjAyNi0wNi0xOVQxMjowMDowMC4wMDBaIiwiaWQiOiJldnRfMTIzIn0"
}
```

Use `nextCursor` on the next request to continue paging. It is `null` when there are no more events. Events sort by `occurredAt DESC, id DESC`.

Responses:

- `200` with `{ "events": [...], "nextCursor": "..." }` for successful exports.
- `400` with `{ "success": false, "error": "Invalid export query" }` for invalid timestamps, filters, limits, or cursors.
- `401` with `{ "success": false, "error": "Invalid credentials" }` for missing, invalid, or revoked read tokens.
- `500` with `{ "success": false, "error": "Unable to export events" }` for unexpected export failures.

Notes:

- v1 export returns raw stored events only; aggregate analytics endpoints are not included.
- Export responses respect the workspace plan retention window.
- Event properties are the values Sarge stored after ingestion-time privacy controls.
- Create or rotate export tokens from the project credentials panel. The plaintext token is shown once.

### Credential Hashes

Sarge stores server, postback, and API export credentials as SHA-256 hashes. Generate a server token and hash like this:

```bash
node -e "const { createHash, randomBytes } = require('node:crypto'); const token = 'sarge_sk_' + randomBytes(32).toString('base64url'); console.log('token=' + token); console.log('sha256=' + createHash('sha256').update(token).digest('hex'));"
```

Set `SiteEnvironment.serverEventSecretHash` for `/v2/server/events` and `SiteEnvironment.postbackTokenHash` for `/v2/postback/...`. API export tokens are stored in `ApiToken.tokenHash` with scope `events:read`.

## Notes

- v2 intentionally does not preserve legacy routes like `/pageView`, `/atc`, or `/purchase`.
- Dates are ISO 8601 strings at the API boundary.
- CORS is currently open because the pixel is intended to send events from customer sites.
- Browser pixel ingestion is unauthenticated by design; server-side ingestion, postbacks, and API export require per-environment credentials.
- Rate limiting, deployment, and destination forwarding are future phases.
