# Sarge Event Reference

Use stable, lowercase, dot-separated event names. Properties should be JSON-serializable and should keep the same shape every time an event fires.

## Ecommerce Events

### `page.view`

Use for initial page load and SPA route changes.

Required properties:

- `path`
- `title`

Example:

```js
window.sarge("track", "page.view", {
  path: window.location.pathname,
  title: document.title
});
```

### `product.viewed`

Use for product detail view, quick view, or product card inspection.

Required properties:

- `product_id`

Example:

```js
window.sarge("track", "product.viewed", {
  product_id: "field-flask",
  product_name: "Field Flask",
  price: 42,
  currency: "USD"
});
```

### `cart.added`

Use when a product is successfully added to cart.

Required properties:

- `product_id`
- `price`

Example:

```js
window.sarge("track", "cart.added", {
  product_id: "field-flask",
  product_name: "Field Flask",
  price: 42,
  currency: "USD",
  cart_size: 1
});
```

### `checkout.started`

Use when the customer starts checkout.

Required properties:

- `value`
- `currency`

Example:

```js
window.sarge("track", "checkout.started", {
  value: 84,
  currency: "USD",
  cart_size: 2
});
```

### `purchase.completed`

Use when payment succeeds and an order is created.

Required properties:

- `order_id`
- `value`
- `currency`

Example:

```js
window.sarge("track", "purchase.completed", {
  order_id: "order_123",
  value: 84,
  currency: "USD",
  item_count: 2,
  products: ["field-flask", "map-wax"]
});
```

## Watchdog Events

Sarge emits watchdog events automatically when it observes common third-party marketing APIs after the pixel loads. Backend calls to Meta Conversions API, Google Measurement Protocol, or similar vendor APIs can use the same event names through `/v2/server/events` with `transport: "server"`, an upstream response summary, and an optional implementation note for AI reviewer context.

### `meta.pixel.fire`

Observed from `fbq(...)`.

Server-reported Meta API calls should also use this event name.

Example payload:

```json
{
  "vendor": "meta",
  "command": "track",
  "event_name": "Purchase",
  "payload": { "value": 84, "currency": "USD" }
}
```

### `google.tag.fire`

Observed from `gtag(...)`.

Server-reported Google API calls should also use this event name.

Example payload:

```json
{
  "vendor": "google",
  "command": "event",
  "event_name": "purchase",
  "payload": { "transaction_id": "order_123", "value": 84 }
}
```

### `data_layer.push`

Observed from `dataLayer.push(...)`.

Example payload:

```json
{
  "vendor": "google",
  "payload": {
    "event": "purchase",
    "ecommerce": { "value": 84, "currency": "USD" }
  }
}
```

### Server-reported upstream response

Example `/v2/server/events` payload for a backend vendor dispatch:

```json
{
  "siteId": "env_123_production",
  "name": "meta.pixel.fire",
  "eventId": "order_123_meta_purchase",
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

Use `implementation.note` for short context that should appear in AI event reviews and implementation briefs. Do not include access tokens, raw emails, phone numbers, or other secrets in Sarge events.

## Event Envelope

Sarge stores events in an envelope like:

```json
{
  "siteId": "env_123_production",
  "name": "purchase.completed",
  "occurredAt": "2026-06-20T12:00:00.000Z",
  "sessionId": "sess_123",
  "userId": "user_123",
  "context": {
    "url": "https://shop.example.com/thanks",
    "referrer": "https://google.com",
    "title": "Thanks"
  },
  "properties": {}
}
```

The `siteId` field is the selected environment ID. Production, Staging, and Development have separate values and separate event streams.

## AI Diagnostics Expectations

- `purchase.completed` should include `order_id`, `value`, and `currency`.
- `checkout.started` should include `value` and `currency`.
- `cart.added` should include `product_id` and `price`.
- Meta Purchase calls should line up with Sarge purchase events.

## Naming Rules

- Use lowercase dot-separated names.
- Do not rename events once dashboards depend on them.
- Keep property names stable across platforms.
- Prefer `snake_case` payload keys.
