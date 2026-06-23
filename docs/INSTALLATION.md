# Installing Sarge

Sarge is installed as a small hosted browser script. Each project has an endpoint host, and that host serves a customized `pixel.js` with the project ID and ingest endpoint already embedded.

## Hosted Install

Use the snippet from the project detail screen in the portal:

```html
<script>
  window._sarge = { queue: [["track", "page.view"]] };
</script>
<script async src="https://track.sargetrack.app/pixel.js?site={siteId}"></script>
```

Use the exact snippet from the project detail screen. The `site` query parameter identifies the project while the shared hosted endpoint delivers the script.

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

Sarge automatically wraps common browser pixel APIs after it loads:

```text
fbq(...)            -> meta.pixel.fire
gtag(...)           -> google.tag.fire
dataLayer.push(...) -> data_layer.push
```

Load Sarge before the interactions you need to debug. If a third-party pixel is already installed, Sarge preserves the original function and observes calls before forwarding them.

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

- `https://track.sargetrack.app/healthz` checks the endpoint Worker.
- `https://track.sargetrack.app/pixel.js?site={siteId}` checks script delivery.

## Agentic Install

If you use an agentic coding tool, point it at the bundled Sarge install skill:

```text
.agents/skills/sarge-install/SKILL.md
```

Give the agent the exact pixel URL from the project detail screen and ask it to wire the ecommerce events you care about. The skill includes framework placement notes and verification steps.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No events appear | Confirm the snippet uses the project endpoint host. |
| Script 404s | Confirm the endpoint host exists as a `Site.endpointHost` in Neon. |
| Events reject | Confirm the payload properties are JSON-serializable and event names are non-empty. |
| SPA page views missing | Emit `page.view` on route changes, not just initial page load. |
| Other media pixels fire but Sarge does not show them | Confirm Sarge loads before the call you expect to observe. |
