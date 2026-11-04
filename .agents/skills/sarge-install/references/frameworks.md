# Framework Notes

## Astro

Place the base snippet in the shared layout, usually under `src/layouts/*.astro`. The base snippet already queues the initial `page.view`. If the site uses client-side view transitions, keep the pixel installed once and emit a page view after subsequent navigations; avoid firing both the queue and a route hook for the same initial load.

## Next.js App Router

Place the script in `app/layout.tsx` using `next/script`. Use `strategy="afterInteractive"` unless the user explicitly needs the watchdog to load before other pixels. Add a client component that emits `page.view` on subsequent route changes, without duplicating the queued initial view. Ensure the pixel is loaded before calling `window.sarge`, or use the queue from the install guide.

## React Or Vite

Add the snippet in `index.html` before the app bundle when possible. For SPA route changes, subscribe to the router and call:

```js
window.sarge("track", "page.view", {
  path: window.location.pathname,
  title: document.title
});
```

## Shopify Or Hosted Commerce

Install the snippet in the theme head or supported customer-events surface. Wire conversion events from the checkout success or order status surface only after payment is confirmed. Avoid emitting `purchase.completed` from cart or checkout-start pages.

Do not put server-event secrets, postback tokens, or API read tokens into browser snippets.

## Generic Server-Rendered Apps

Put the base snippet in the shared HTML shell. Emit action events near the existing business action, not in a generic click handler, so payload values come from the same source of truth used by the app.
