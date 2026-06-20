---
name: sarge-install
description: Install Sarge tracking into web apps, ecommerce flows, SPAs, and media-pixel debugging setups. Use when asked to add the Sarge pixel, wire page/product/cart/checkout/purchase events, observe fbq/gtag/dataLayer, or verify Sarge events in an app.
---

# Sarge Install

Use this skill to add Sarge to an application and verify that events arrive in the Sarge portal.

## Inputs To Collect

- Sarge pixel URL from the project detail screen, usually `https://sarge.lkuich.com/pixel.js?site={siteId}`.
- The target framework and root layout/template file.
- The ecommerce or conversion actions that matter for debugging.
- Any existing Meta, Google, or `dataLayer` tracking calls that should be observed.

Do not ask for secrets. The hosted pixel URL is safe to place in client code; backend credentials are not.

## Install Workflow

1. Inspect the app structure and identify the global document head or earliest shared layout.
2. Add the Sarge snippet once, as early as the framework allows:

   ```html
   <script>
     window._sarge = { queue: [["track", "page.view"]] };
   </script>
   <script async src="https://sarge.lkuich.com/pixel.js?site={siteId}"></script>
   ```

3. Wire stable, lowercase, dot-separated event names:

   ```js
   window.sarge("track", "product.viewed", {
     product_id: product.id,
     product_name: product.name,
     price: product.price,
     currency: "USD"
   });
   ```

4. For ecommerce, prefer these events:

   - `page.view`
   - `product.viewed` with `product_id`
   - `cart.added` with `product_id`, `price`, and `currency`
   - `checkout.started` with `value` and `currency`
   - `purchase.completed` with `order_id`, `value`, and `currency`

5. Keep existing third-party pixels in place. Sarge watches common APIs after it loads:

   - `fbq(...)` records `meta.pixel.fire`
   - `gtag(...)` records `google.tag.fire`
   - `dataLayer.push(...)` records `data_layer.push`

6. Verify in a browser:

   - Load the page.
   - Trigger the expected actions.
   - Confirm network requests to `/v2/events` or compact `/v2/e`.
   - Confirm events appear in the Sarge project debug stream.

7. If events are missing, check load order, consent gates, ad blockers, route transitions, and whether `window.sarge` is available before custom events fire.

## Framework Notes

Read `references/frameworks.md` for framework-specific placement patterns.

## Output

When finished, report:

- Files changed.
- Events wired.
- Verification performed.
- Any event gaps that still require product or backend context.
