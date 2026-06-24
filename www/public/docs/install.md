# Install Sarge

Sarge is installed as a small hosted browser script. Each Sarge project has a project-specific pixel URL. Use the exact snippet from the project detail screen in the Sarge portal.

## Hosted Pixel Snippet

```html
<script>
  window._sarge = { queue: [["track", "page.view"]] };
</script>
<script async src="https://track.sargetrack.app/pixel.js?site={siteId}"></script>
```

Place the snippet in the document `<head>` or as early as possible in the page body. The queued `page.view` call is replayed after `pixel.js` loads.

## Track Events

After the script loads, call:

```html
<script>
  window.sarge("track", "product.viewed", {
    product_id: "field-flask",
    product_name: "Field Flask",
    price: 42,
    currency: "USD"
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
google.tag.fire
data_layer.push
```

Properties must be JSON-serializable.

## Ecommerce Examples

Add to cart:

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

Purchase:

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

Sarge observes common browser pixel APIs after it loads:

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
3. Go to Projects.
4. Open the project that owns the pixel.
5. Confirm events appear in the project event stream.

You can also open these project URLs from the portal:

- `https://track.sargetrack.app/healthz` checks the endpoint Worker.
- `https://track.sargetrack.app/pixel.js?site={siteId}` checks script delivery.

## Agent Install Guidance

When using a coding agent, give it:

- The exact pixel snippet from the project detail screen.
- The event names and required properties from `/docs/events.md`.
- Instructions to preserve existing Meta, Google, analytics, and tag-manager pixels.
- A verification step that confirms events arrive in the Sarge project event stream.

No public Sarge MCP server or npm skill package is currently published. Do not run `npx sarge@latest` or install `@sarge/mcp`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No events appear | Confirm the snippet uses the exact project `site` id. |
| Script 404s | Confirm the pixel URL from the project page opens successfully. |
| Events reject | Confirm payload properties are JSON-serializable and event names are non-empty. |
| SPA page views missing | Emit `page.view` on route changes, not just initial page load. |
| Other media pixels fire but Sarge does not show them | Confirm Sarge loads before the call you expect to observe. |
