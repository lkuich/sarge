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
- `Affiliate`
- `Event`

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
  "siteId": "site_123",
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

### Compact Fallback Ingestion

```http
GET /v2/e
```

Query fields:

| Field | Meaning |
| --- | --- |
| `sid` | site/client ID |
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
GET /v2/e?sid=site_123&n=Lead&ts=2026-06-19T12:00:00.000Z&ss=sess_123&u=user_123&p=%7B%22form%22%3A%22contact%22%7D
```

## Notes

- v2 intentionally does not preserve legacy routes like `/pageView`, `/atc`, or `/purchase`.
- Dates are ISO 8601 strings at the API boundary.
- CORS is currently open because the pixel is intended to send events from customer sites.
- Auth, rate limiting, deployment, and destination forwarding are future phases.
