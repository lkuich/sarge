# Installing Sarge

Sarge is installed as a small hosted browser script. Each project has persisted Production, Staging, and Development environments. Every environment has its own pixel URL, event stream, user/session flows, debug stream, event hosts, webhooks, and public verify URL.

AI recommendations currently run for Production only. Staging and Development still collect their own events and show their own flows/debug streams, but the AI review panel is disabled there.

Sarge active monitoring uses URLs already captured from Production events. Once pages emit events, scheduled AI review can re-check those same URLs and flag `404`, `5xx`, timeout, DNS/TLS, or redirect regressions without extra setup.

## Hosted Install

Use the snippet from the project detail screen in the portal:

```html
<script>
  window._sarge = { queue: [["track", "page.view"]] };
</script>
<script async src="https://track.sargetrack.app/pixel.js?env={siteEnvironmentId}"></script>
```

Use the exact snippet from the selected environment tab on the project detail screen. The `env` query parameter identifies the persisted environment. The browser payload field is still called `siteId`, but the value is the selected environment ID.

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
        "endpoint": "https://graph.facebook.com/v20.0/{pixel_id}/events",
        "status": 200,
        "ok": true,
        "request_id": "fb_req_123"
      }
    }
  }'
```

Do not include access tokens, raw emails, phone numbers, or other secrets in the Sarge payload.

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

For affiliate networks that report conversions by URL callback, create a postback token on the project detail screen and use an `affiliate.conversion` URL:

```text
https://track.sargetrack.app/v2/postback/{siteEnvironmentId}/{postbackToken}?event=affiliate.conversion&click_id=click_123&order_id=order_123&value=42.50&currency=USD&aff=partner-42
```

## Verify Installation

1. Open the target site in a browser.
2. Open the Sarge portal.
3. Go to `Projects`.
4. Open the project and select the matching Production, Staging, or Development tab.
5. Confirm events appear in that environment's debug stream.

You can also open these project URLs directly from the portal:

- `https://track.sargetrack.app/healthz` checks the endpoint Worker.
- `https://track.sargetrack.app/pixel.js?env={siteEnvironmentId}` checks script delivery.

## Agentic Install

If you use an agentic coding tool, point it at the bundled Sarge install skill:

```text
.agents/skills/sarge-install/SKILL.md
```

Give the agent the exact pixel URL from the project detail screen and ask it to wire the ecommerce events you care about. The skill includes framework placement notes and verification steps.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No events appear | Confirm the snippet came from the same environment tab you are testing. |
| Script 404s | Confirm the environment exists as a `SiteEnvironment` row in Neon. |
| Events reject | Confirm the payload properties are JSON-serializable and event names are non-empty. |
| SPA page views missing | Emit `page.view` on route changes, not just initial page load. |
| Other media pixels fire but Sarge does not show them | Confirm Sarge loads before the call you expect to observe. |
