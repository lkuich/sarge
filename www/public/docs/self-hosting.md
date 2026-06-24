# Self-Hosting Sarge

Self-hosted Sarge is for teams that want the event API and database in their own cloud while keeping the same lightweight browser pixel and tracking model.

## Deployment Shape

```text
Website/App
  -> Sarge pixel
  -> Sarge API container
  -> Postgres
```

## Minimum Services

- Postgres database
- Sarge API service
- HTTPS endpoint for event ingestion
- Static hosting or CDN for the pixel bundle
- A Workspace, Site, and Production/Staging/Development `SiteEnvironment` records for each tracked property

## Required Environment Variables

```sh
DATABASE_URL="postgresql://user:password@host:5432/sarge?schema=public"
PORT="49828"
NODE_ENV="production"
```

## Setup Flow

1. Set up Postgres.
2. Run Prisma migrations.
3. Start the Sarge API container.
4. Host the pixel bundle from your domain or CDN.
5. Create Workspace, Site, and SiteEnvironment records.
6. Install the pixel snippet for the target environment on the target website.
7. Send a test event and confirm it lands in the database with the matching `siteEnvironmentId`.

## Self-Hosted Pixel Shape

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

## Test Event

```sh
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

## Hosting Checklist

### Event Collection

Choose a runtime that can handle high-volume HTTPS requests, route custom tracking domains, and return the pixel quickly.

### Event Storage

Use managed Postgres or an existing database platform with backups, connection pooling, migrations, and clear retention controls.

### Pixel Delivery

Serve the pixel from a stable HTTPS URL with caching, compression, and a rollout path for future snippet versions.

### Dashboard

Host the portal where your team already ships web apps, while keeping event collection and storage sized for traffic.

## Choose Self-Hosted When

- Event data must stay in your cloud.
- You already run Postgres and containerized services.
- You need private networking or regional control.

## Support Boundary

Self-hosted teams operate their own uptime, backups, retention, platform security, and access logs. Sarge can provide setup docs, upgrade notes, and paid support.
