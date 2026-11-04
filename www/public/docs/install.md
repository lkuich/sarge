# Install Sarge

Sarge is installed as a small hosted browser script. Each Sarge project has persisted Production, Staging, and Development environments. Every environment has its own pixel URL, events, session flows, credentials, webhook configuration, and temporary verification links.

AI recommendations are available in Diagnostics for Production on Growth and higher. Staging and Development still collect events and show their own flows, but AI review is disabled there.

## Project Dashboard

Open a project and select Production, Staging, or Development. The selected environment stays selected when switching between these tabs:

| Tab | Use it for |
| --- | --- |
| Overview | 24-hour traffic, previous-period comparisons, weekly trends, and event mix. |
| Sessions | Filter user/session journeys, inspect events, and load more matching events. |
| Live events | Inspect the latest incoming events and captured payloads. |
| Diagnostics | Production tracking findings, scheduled reviews, and copyable implementation briefs. |
| Setup | Pixel installation, verification links, impersonation, server/API credentials, affiliate tracking, and webhook destinations. |
| Settings | Project privacy rules and deletion requests; organization admins only. |

Overview traffic excludes test and watchdog events and respects the configured site host and plan retention. Sessions loads matching events in pages of 80; load additional pages before treating a journey as complete. Live events shows the latest 12 events, not a total event count. A recorded purchase value is what your integration sent, not a complete payment ledger.

Setup → Server-side calls contains server-event secrets, partner postback tokens, and raw event export tokens. API export and MCP read access are available on every plan, including Free. Server-event and postback credentials require Starter or higher. Only organization admins can create or rotate credentials; an editor can create temporary verification links.

## Hosted Pixel Snippet

```html
<script>
  window._sarge = { queue: [["track", "page.view"]] };
</script>
<script async src="https://track.sargetrack.app/pixel.js?env={siteEnvironmentId}"></script>
```

Copy the exact snippet from Setup → Install pixel for the selected environment. The browser/API payload field is still called `siteId`, but the value is the selected environment ID.

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

Properties must be JSON-serializable. If an event can fire before the async pixel loads, append it to the queue instead of calling an undefined function:

```js
if (typeof window.sarge === "function") {
  window.sarge("track", "checkout.started", { value: 84, currency: "USD" });
} else {
  window._sarge.queue.push(["track", "checkout.started", { value: 84, currency: "USD" }]);
}
```

The base snippet must already have initialized `window._sarge.queue`. Emit the initial `page.view` once; the base snippet already queues it.

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

Load Sarge before the interactions you need to debug. Sarge observes `fbq`, `gtag`, and `dataLayer.push` when present or assigned later, preserving vendor queues, properties, and return values. It leaves missing vendor globals undefined so their normal bootstrap scripts can run. Calls before Sarge loads, protected accessor/read-only globals, and calls during script declarations before hooks refresh may escape observation. Verify the actual vendor calls after installation.

If your backend calls Meta Conversions API, Google Measurement Protocol, or another vendor API directly, report that upstream call through `/v2/server/events` with the matching watchdog event name. Include the upstream status code in `properties.upstream`:

```bash
curl -X POST "https://track.sargetrack.app/v2/server/events" \
  -H "authorization: Bearer sarge_sk_example" \
  -H "content-type: application/json" \
  -d '{
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
      "payload": { "order_id": "order_123", "value": 129.99, "currency": "USD" },
      "upstream": {
        "endpoint": "https://graph.facebook.com/{api_version}/{pixel_id}/events",
        "status": 200,
        "ok": true,
        "request_id": "fb_req_123"
      },
      "implementation": {
        "mode": "server_gtm",
        "note": "This project does not fire fbq directly. Meta Purchase is dispatched server-side through GTM."
      }
    }
  }'
```

Use `implementation.note` for short context that should appear in AI event reviews and implementation briefs. Do not include access tokens, raw emails, phone numbers, or other secrets in the Sarge payload.

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

Sarge stores these values for the environment attribution window, which defaults to 28 days. On subsequent page loads during that window, the pixel preserves attribution for later `checkout.started` and `purchase.completed` events. Expiration is checked when the pixel initializes; a page left open past expiration can continue sending its loaded attribution until reinitialization. For server-confirmed orders, explicitly send the attribution and matching identifiers from your backend; Sarge does not automatically look up browser attribution for server calls.

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

Create the server secret or postback token under Setup → Server-side calls. Keep server event secrets out of browser code. Postback tokens are easier to paste into partner tools, but rotate them if the URL is exposed.

## Webhooks

Webhook destinations belong to the selected project environment. Organization admins on Starter and higher can configure them in Setup.

1. Open the project, select the environment, and open the Setup tab.
2. In Webhooks, enter a name and an HTTPS destination URL.
3. Optionally enter event names separated by commas or newlines, such as `purchase.completed`. Leave filters blank to select all events.
4. Select Create webhook and copy the signing secret into secure storage. It is shown only once.

Outbound event delivery is not implemented yet. Saving a destination stores its configuration; the configured status does not confirm delivery. Use the [read-only export API](/docs/api.md) to retrieve events from your backend today.

## Verify Installation

1. Open the target site in a browser.
2. Open the Sarge portal.
3. Go to Projects.
4. Open the project and select the matching Production, Staging, or Development environment.
5. Open Live events and confirm the expected event names and payloads. Use Sessions for journeys and Diagnostics for Production reviews.

For agentic verification, use the temporary public stream:

```text
https://sargetrack.app/verify/{siteEnvironmentId}?key={temporaryVerificationKey}
```

The `siteEnvironmentId` is the `env` query parameter in the environment pixel URL. In Setup → Install pixel, select Create 30-minute verify link. Edit access or organization-admin access is required. Anyone with the link can view up to 30 recent events until it expires, so share it only with the intended tester or agent. The verification page auto-refreshes while the target app is exercised.

You can also open these project URLs from the portal:

- `https://track.sargetrack.app/healthz` checks the endpoint Worker.
- `https://track.sargetrack.app/pixel.js?env={siteEnvironmentId}` checks script delivery.

## Privacy and Data Controls

Organization admins configure project-level controls in Settings and workspace defaults in Account. PII redaction is enabled by default, with property blocklists or allowlists and custom redaction keys/patterns. These controls apply to event `properties` at ingestion; they do not retroactively scrub existing records or sanitize every envelope field. Keep secrets and personal information out of URLs, titles, user IDs, attribution values, and payloads.

Settings queues project deletion; Account queues workspace deletion. The ingestion Worker processes requests every 30 minutes in bounded batches, so large requests can span multiple runs. Cleanup removes the associated events and configuration; failed or interrupted work is retried. A workspace with a Stripe subscription must finish cancellation before deletion. Read retention is Free 7 days, Starter 30 days, Growth 90 days; Scale is custom. Expired Free, Starter, and Growth events are physically purged in batches of up to 5,000 each run; a backlog can delay physical removal beyond the read window. Scale retention and physical cleanup require an agreed policy.

## Agent Install Guidance

When using a coding agent, give it:

- The exact pixel snippet from the project detail screen.
- The event names and required properties from `/docs/events.md`.
- A temporary public verification URL `/verify/{siteEnvironmentId}?key={temporaryVerificationKey}`.
- Instructions to preserve existing Meta, Google, analytics, and tag-manager pixels.
- A verification step that confirms events arrive in the Sarge project event stream.

Sarge provides a read-only, authenticated MCP endpoint at `https://track.sargetrack.app/mcp` using environment-scoped API export bearer tokens on every plan, including Free. See [MCP connection instructions](/docs/mcp.md). No npm package is required; do not run `npx sarge@latest` or install `@sarge/mcp`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No events appear | Confirm the snippet came from the same environment you are testing. |
| Script 404s | Confirm the pixel URL from the project page opens successfully. |
| Events reject | Confirm payload properties are JSON-serializable and event names are non-empty. |
| SPA page views missing | Emit `page.view` on route changes, not just initial page load. |
| Other media pixels fire but Sarge does not show them | Confirm Sarge loads before the call you expect to observe. |
