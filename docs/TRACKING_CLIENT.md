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
| `endpoint` | no | `https://track.sargetrack.app` |
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

## Affiliate Tracking

Use Sarge affiliate tracking when a partner, creator, ad, or campaign sends traffic that may convert later. Add these parameters to the landing URL:

```text
https://shop.example.com/?sarge_ref=summer-campaign&sarge_aff=partner-42
```

- `sarge_ref` should identify the campaign, click, placement, or network click ID.
- `sarge_aff` should identify the affiliate, partner, creator, or publisher.

The browser pixel stores both values in `localStorage` and attaches them to later events as `attribution.ref` and `attribution.aff`. This means a checkout or purchase event can still carry the original affiliate context after the visitor navigates to other pages.

### Latent conversions

Latent conversions are conversions that happen after the initial affiliate click or visit. The default window is 28 days, controlled by `attributionTtlDays` on the pixel/environment. During that window, browser events include:

```json
{
  "attribution": {
    "ref": "summer-campaign",
    "aff": "partner-42",
    "expiresAt": "2026-07-22T12:00:00.000Z"
  }
}
```

When the window expires, new browser events stop carrying the stored affiliate values unless a fresh landing URL sets `sarge_ref` or `sarge_aff` again.

For backend-confirmed orders, send `purchase.completed` through `/v2/server/events` with the same `userId`, `order_id`, `value`, and `currency` fields you use in the browser flow. For affiliate networks or partner tools that can only call a URL, create a postback token in the project view and give the partner a URL like:

```text
https://track.sargetrack.app/v2/postback/{siteEnvironmentId}/{postbackToken}?event=affiliate.conversion&click_id=click_123&order_id=order_123&value=42.50&currency=USD&aff=partner-42
```

Use `affiliate.conversion` for partner-reported conversion callbacks. Prefer server-side events when your backend can send an authorization header; use postbacks for external systems that only support URL callbacks.

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

Backends that call Meta Conversions API, Google Measurement Protocol, or similar vendor APIs directly should report the dispatch through `/v2/server/events` with the matching watchdog event name. Include the upstream HTTP response under `properties.upstream`:

```json
{
  "siteId": "env_123_production",
  "name": "google.tag.fire",
  "eventId": "order_123_google_purchase",
  "sessionId": "sess_123",
  "userId": "customer_123",
  "properties": {
    "vendor": "google",
    "transport": "server",
    "command": "event",
    "event_name": "purchase",
    "payload": {
      "transaction_id": "order_123",
      "value": 129.99,
      "currency": "USD"
    },
    "upstream": {
      "endpoint": "https://www.google-analytics.com/mp/collect",
      "status": 204,
      "ok": true
    }
  }
}
```

Use the same `sessionId` and `userId` as the related browser or order event when available. Do not include access tokens, raw emails, phone numbers, or other secrets in the Sarge payload.

Future versions may add more globals and known network calls, such as `ttq.track`.
