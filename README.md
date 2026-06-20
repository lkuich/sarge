# Sarge

Sarge is a lightweight event pixel and ingestion API for debugging media and product tracking. The codebase is a TypeScript `pnpm` workspace with a browser pixel, an Express API, Prisma, Postgres, and one root Docker Compose setup for local development.

## Repository Map

| Path | Purpose |
| --- | --- |
| `apps/api/` | TypeScript Express API for v2 event ingestion |
| `packages/pixel/` | TypeScript browser pixel bundled with `tsup` |
| `apps/api/prisma/` | Prisma schema and migrations |
| `docs/` | Audit, API, pixel, and product strategy docs |

## Quick Start

Install dependencies:

```bash
pnpm install
```

Start the local database and API:

```bash
docker compose up postgres api
```

Run Prisma migrations against the Compose database:

```bash
DATABASE_URL="postgresql://sarge:sarge@localhost:5432/sarge_dev?schema=public" pnpm prisma:migrate
```

Run local checks:

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Browser Pixel

The v2 browser API is intentionally small:

```html
<script src="/index.global.js"></script>
<script>
  sarge('init', {
    siteId: 'site_123',
    endpoint: 'http://localhost:49828',
    attributionTtlDays: 28
  });

  sarge('track', 'Purchase', {
    value: 129.99,
    currency: 'USD',
    orderId: '1234'
  });
</script>
```

The pixel reads `sarge_ref` and `sarge_aff` URL parameters, stores attribution in `localStorage`, and sends events to the API with `sendBeacon`, `fetch(..., { keepalive: true })`, or a compact image GET fallback.

## API

Health:

```http
GET /healthz
```

Primary ingestion:

```http
POST /v2/events
Content-Type: application/json

{
  "siteId": "site_123",
  "name": "Purchase",
  "occurredAt": "2026-06-19T12:00:00.000Z",
  "sessionId": "sess_123",
  "userId": "user_123",
  "properties": {
    "value": 129.99,
    "currency": "USD"
  }
}
```

Compact fallback:

```http
GET /v2/e?sid=site_123&n=Lead&ts=2026-06-19T12:00:00.000Z&ss=sess_123&u=user_123
```

See `docs/API.md` and `docs/TRACKING_CLIENT.md` for more detail.
For hosted website installation, see `docs/INSTALLATION.md`.

## Distribution

Sarge has three planned distribution paths:

- self-hosted: customer runs the API/database and hosts the pixel
- hosted shared: Sarge provisions a custom endpoint and customized pixel on shared infrastructure
- dedicated hosted: "Contact us" managed infrastructure for teams that need isolation or custom requirements

See:

- `docs/INSTALLATION.md`
- `docs/SELF_HOSTED.md`
- `docs/HOSTED_SHARED_TECHNICAL_SPEC.md`
- `docs/CLOUDFLARE_NEON_DEPLOYMENT.md`
- `docs/DEDICATED_HOSTING.md`

## Product Direction

Sarge is being repositioned as a cheap, dead-simple event recorder for teams that need to debug tracking implementations. The future product direction includes real-time event streams, a third-party pixel watchdog, custom script deployment, and an LLM query layer over structured event data.

See `docs/STRATEGY.md`.
