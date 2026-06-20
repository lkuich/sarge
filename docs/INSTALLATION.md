# Installing Sarge

Sarge is installed as a small hosted browser script. Each project has an endpoint host, and that host serves a customized `pixel.js` with the project ID and ingest endpoint already embedded.

## Hosted Install

Use the snippet from the project detail screen in the portal:

```html
<script>
  window._sarge = { queue: [["track", "page.view"]] };
</script>
<script async src="https://sarge.lkuich.com/pixel.js"></script>
```

For another project, replace `sarge.lkuich.com` with that project endpoint host.

Place the snippet in the document `<head>` or as early as possible in the page body. The queued `page.view` call is replayed after `pixel.js` loads.

## Track Events

After the script loads, call:

```html
<script>
  window.sarge("track", "product.viewed", {
    product_id: "field-flask",
    product_name: "Field Flask",
    price: 42
  });
</script>
```

Event names should be stable, lowercase, and dot-separated:

```text
page.view
product.viewed
cart.added
checkout.started
purchase.completed
meta.pixel.fire
```

Properties must be JSON-serializable.

## Ecommerce Example

```html
<button
  type="button"
  onclick='window.sarge("track", "cart.added", {
    product_id: "field-flask",
    product_name: "Field Flask",
    price: 42,
    currency: "USD"
  })'
>
  Add to cart
</button>
```

```html
<script>
  window.sarge("track", "purchase.completed", {
    order_id: "order_123",
    value: 84,
    currency: "USD",
    item_count: 2
  });
</script>
```

## Watch Other Pixels

Until automatic observation is built, you can manually mirror other pixel calls into Sarge:

```html
<script>
  const originalFbq = window.fbq;

  window.fbq = function(command, eventName, payload) {
    window.sarge("track", "meta.pixel.fire", {
      vendor: "meta",
      command,
      event_name: eventName,
      payload
    });

    if (typeof originalFbq === "function") {
      return originalFbq.apply(this, arguments);
    }
  };
</script>
```

## SPA Route Changes

For client-side routed apps, emit a page event whenever the route changes:

```js
window.sarge("track", "page.view", {
  path: window.location.pathname,
  title: document.title
});
```

## Attribution Parameters

The pixel reads these URL parameters and stores them in `localStorage`:

```text
sarge_ref
sarge_aff
```

Example:

```text
https://shop.example.com/?sarge_ref=summer-campaign&sarge_aff=partner-42
```

## Verify Installation

1. Open the target site in a browser.
2. Open the Sarge portal.
3. Go to `Projects`.
4. Open the project that owns the endpoint host.
5. Confirm events appear in the debug stream.

You can also open these project URLs directly from the portal:

- `https://{endpointHost}/healthz` checks the endpoint Worker.
- `https://{endpointHost}/pixel.js` checks script delivery.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No events appear | Confirm the snippet uses the project endpoint host. |
| Script 404s | Confirm the endpoint host exists as a `Site.endpointHost` in Neon. |
| Events reject | Confirm the payload properties are JSON-serializable and event names are non-empty. |
| SPA page views missing | Emit `page.view` on route changes, not just initial page load. |
| Other media pixels fire but Sarge does not show them | Mirror those calls into `meta.pixel.fire` until automatic observation is implemented. |
