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
    siteId: 'env_123_development',
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
  siteId: 'env_123_development',
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

The option is still named `siteId` for payload compatibility, but hosted installs should pass the selected `SiteEnvironment.id`. Production, Staging, and Development each have separate IDs and separate event streams.

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

## Test Traffic and Impersonation

For checkout and user-flow testing, the hosted pixel exposes page-console helpers:

```js
impersonate('customer_123');
clear_impersonation();
```

`impersonate(userId)` persists until `clear_impersonation()` is called. While active, browser events use the impersonated value as `userId` and merge Sarge-owned test metadata into `properties`:

```json
{
  "sarge_test": true,
  "sarge_test_mode": "impersonation",
  "sarge_tester_user_id": "project-scoped-tester-id",
  "sarge_impersonated_user_id": "customer_123"
}
```

These fields let the console filter real traffic, test traffic, and impersonated traffic separately. They are only debug metadata; they do not authenticate as the target user or change permissions in the target app.

The command API also supports:

```js
sarge('impersonate', 'customer_123');
sarge('clear_impersonation');
```

## Attribution Storage

On initialization, the pixel reads these URL parameters:

- `sarge_ref`
- `sarge_aff`

It stores:

- `sarge_ref`
- `sarge_aff`
- `sarge_exp`
- `sarge_sess`
- `sarge_user:{siteId}`
- `sarge_impersonate:{siteId}` when impersonation is active

`sarge_exp` is stored as an ISO 8601 string.

## Transport Order

The pixel sends events in this order:

1. `navigator.sendBeacon('/v2/events', json)`
2. `fetch('/v2/events', { method: 'POST', keepalive: true })`
3. image GET fallback to `/v2/e`

This keeps normal events structured while preserving a compact fallback for constrained browser moments.

## Watchdog Events

The pixel observes common globals after it loads:

- `dataLayer.push(...)` -> `data_layer.push`
- `gtag(...)` -> `google.tag.fire`
- `fbq(...)` -> `meta.pixel.fire`

Future versions may add more globals and known network calls, such as `ttq.track`.
