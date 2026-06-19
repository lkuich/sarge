# Tracking Client

The active browser pixel lives in `packages/pixel/`. It is written in TypeScript and bundled with `tsup`.

## Build

```bash
pnpm --filter @sarge/pixel build
```

The distributable is emitted to:

```text
packages/pixel/dist/
```

## Install Snippet

```html
<script src="/index.global.js"></script>
<script>
  sarge('init', {
    siteId: 'site_123',
    endpoint: 'https://events.example.com',
    attributionTtlDays: 28
  });

  sarge('track', 'PageView');
  sarge('track', 'Purchase', {
    value: 129.99,
    currency: 'USD'
  });
</script>
```

## Initialization

```js
sarge('init', {
  siteId: 'site_123',
  endpoint: 'https://events.example.com',
  attributionTtlDays: 28
});
```

Options:

| Option | Required | Default |
| --- | --- | --- |
| `siteId` | yes | none |
| `endpoint` | no | `https://white-dawn-6379.fly.dev` |
| `attributionTtlDays` | no | `28` |

## Tracking

```js
sarge('track', 'Lead');
sarge('track', 'Purchase', { value: 129.99, currency: 'USD' });
```

The legacy call shape is intentionally not preserved:

```js
sarge('purchase');
sarge('pageView');
```

Use `sarge('track', eventName, properties)` for all v2 events.

## Attribution Storage

On initialization, the pixel reads these URL parameters:

- `sarge_ref`
- `sarge_aff`

It stores:

- `sarge_ref`
- `sarge_aff`
- `sarge_exp`
- `sarge_sess`
- `sarge_user`

`sarge_exp` is stored as an ISO 8601 string.

## Transport Order

The pixel sends events in this order:

1. `navigator.sendBeacon('/v2/events', json)`
2. `fetch('/v2/events', { method: 'POST', keepalive: true })`
3. image GET fallback to `/v2/e`

This keeps normal events structured while preserving a compact fallback for constrained browser moments.

## Future Watchdog Direction

This phase does not implement third-party pixel observation. Future versions should observe common globals and network calls such as `dataLayer.push`, `gtag`, `fbq`, and `ttq.track`, then report those observations into the same event timeline.
