# Framework Notes

## Astro

Place the base snippet in the shared layout, usually under `src/layouts/*.astro`. For route-level events, add a small client script that emits `page.view` on initial render. If the site uses client-side view transitions, emit another `page.view` after navigation.

## Next.js App Router

Place the script in `app/layout.tsx` using `next/script`. Use `strategy="afterInteractive"` unless the user explicitly needs the watchdog to load before other pixels. Add a small client component that watches `usePathname()` and emits `page.view` on route changes.

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

## Generic Server-Rendered Apps

Put the base snippet in the shared HTML shell. Emit action events near the existing business action, not in a generic click handler, so payload values come from the same source of truth used by the app.
