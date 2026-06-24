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

### Credential Hashes

Sarge stores server/postback credentials as SHA-256 hashes. Generate a token and hash like this:

```bash
node -e "const { createHash, randomBytes } = require('node:crypto'); const token = 'sarge_sk_' + randomBytes(32).toString('base64url'); console.log('token=' + token); console.log('sha256=' + createHash('sha256').update(token).digest('hex'));"
```

Set `SiteEnvironment.serverEventSecretHash` for `/v2/server/events` and `SiteEnvironment.postbackTokenHash` for `/v2/postback/...`.

## Notes

- v2 intentionally does not preserve legacy routes like `/pageView`, `/atc`, or `/purchase`.
- Dates are ISO 8601 strings at the API boundary.
- CORS is currently open because the pixel is intended to send events from customer sites.
- Browser pixel ingestion is unauthenticated by design; server-side and postback ingestion require per-environment credentials.
- Rate limiting, deployment, and destination forwarding are future phases.
