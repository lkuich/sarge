# Install Sarge

Sarge is installed as a small hosted browser script. Each Sarge project has persisted Production, Staging, and Development environments. Every environment has its own pixel URL, event stream, user/session flows, debug stream, event hosts, webhooks, and public verify URL.

AI recommendations currently run for Production only. Staging and Development still collect their own events and show their own flows/debug streams, but the AI review panel is disabled there.

## Hosted Pixel Snippet

```html
<script>
  window._sarge = { queue: [["track", "page.view"]] };
</script>
<script async src="https://track.sargetrack.app/pixel.js?env={siteEnvironmentId}"></script>
```

Use the exact snippet from the selected environment tab in the Sarge portal. The browser/API payload field is still called `siteId`, but the value is the selected environment ID.

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

## Test Traffic and User Impersonation

To test checkout, account, or lifecycle flows without mixing those events into real traffic, open the target page console and run:

```js
impersonate('customer_123');
```

Future events in that project will use `customer_123` as the event `userId`, so the Sarge user/session flow shows the path as that user. Sarge also marks each event as test traffic:

```json
{
  "sarge_test": true,
  "sarge_test_mode": "impersonation",
  "sarge_tester_user_id": "project-scoped-tester-id",
  "sarge_impersonated_user_id": "customer_123"
}
```

Clear the override when testing is finished:

```js
clear_impersonation();
```

The console can hide test traffic, show only test traffic, or show all traffic. Impersonation is debug metadata only; it does not sign you into the target application or grant any permissions.

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

Use `sarge_ref` for the campaign, placement, click ID, or network click identifier. Use `sarge_aff` for the affiliate, creator, publisher, or partner ID.

Sarge stores these values for the environment attribution window, which defaults to 28 days. During that window, latent conversions such as later `checkout.started`, `purchase.completed`, or server-confirmed order events can still be tied back to the original affiliate visit. After the window expires, browser events stop carrying the stored attribution unless the visitor arrives with fresh `sarge_ref` or `sarge_aff` values.

## Server-Side and Postback Events

Use browser events for page and interaction tracking. Use server-side events for trusted backend facts such as paid orders, refunds, fulfilled subscriptions, or webhook confirmations.

Preferred backend call:

```bash
curl -X POST "https://track.sargetrack.app/v2/server/events" \
  -H "authorization: Bearer {serverEventSecret}" \
  -H "content-type: application/json" \
  -d '{
    "siteId": "{siteEnvironmentId}",
    "name": "purchase.completed",
    "eventId": "order_123",
    "userId": "customer_123",
    "properties": { "order_id": "order_123", "value": 129.99, "currency": "USD" }
  }'
```

URL-only partner postback:

```text
https://track.sargetrack.app/v2/postback/{siteEnvironmentId}/{postbackToken}?event=affiliate.conversion&click_id=click_123&order_id=order_123&value=42.50&currency=USD&aff=partner-42
```

Keep server event secrets out of browser code. Postback tokens are easier to paste into partner tools, but rotate them if the URL is exposed.

## Verify Installation

1. Open the target site in a browser.
2. Open the Sarge portal.
3. Go to Projects.
4. Open the project and select the matching Production, Staging, or Development tab.
5. Confirm events appear in that environment's event stream.

For agentic verification, use the temporary public stream:

```text
https://sargetrack.app/verify/{siteEnvironmentId}
```

The `siteEnvironmentId` is the `env` query parameter in the environment pixel URL. The verification page shows the latest events and auto-refreshes every few seconds while an agent exercises the target app.

You can also open these project URLs from the portal:

- `https://track.sargetrack.app/healthz` checks the endpoint Worker.
- `https://track.sargetrack.app/pixel.js?env={siteEnvironmentId}` checks script delivery.

## Agent Install Guidance

When using a coding agent, give it:

- The exact pixel snippet from the project detail screen.
- The event names and required properties from `/docs/events.md`.
- The public verification URL `/verify/{siteEnvironmentId}`.
- Instructions to preserve existing Meta, Google, analytics, and tag-manager pixels.
- A verification step that confirms events arrive in the Sarge project event stream.

No public Sarge MCP server or npm skill package is currently published. Do not run `npx sarge@latest` or install `@sarge/mcp`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No events appear | Confirm the snippet came from the same environment tab you are testing. |
| Script 404s | Confirm the pixel URL from the project page opens successfully. |
| Events reject | Confirm payload properties are JSON-serializable and event names are non-empty. |
| SPA page views missing | Emit `page.view` on route changes, not just initial page load. |
| Other media pixels fire but Sarge does not show them | Confirm Sarge loads before the call you expect to observe. |
