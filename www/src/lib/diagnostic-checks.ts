// Display catalog only. Detection and severity remain in @sarge/core.
export const diagnosticChecks = [
  { id: 'checkout-without-purchase', name: 'Checkout without purchase', severity: 'critical', condition: 'A checkout session has no purchase.completed event in the sample. Normal abandonment or a purchase outside the observation window can trigger this.' },
  { id: 'duplicate-purchase-order', name: 'Duplicate purchase order', severity: 'critical', condition: 'The same nonempty order_id appears on more than one purchase.completed event.' },
  { id: 'meta-purchase-without-sarge-purchase', name: 'Meta purchase without Sarge purchase', severity: 'warning', condition: 'Meta Purchase is observed, but the sample has no Sarge purchase.completed events.' },
  { id: 'sarge-purchase-without-meta-purchase', name: 'Sarge purchases without Meta observations', severity: 'warning', condition: 'The number of distinct purchase sessions without Meta Purchase equals the number of purchase events. Duplicate purchases can prevent this rule from triggering.' },
  { id: 'missing-required-properties', name: 'Required ecommerce properties', severity: 'warning', condition: 'A required property is absent, null, or empty: product.viewed → product_id; cart.added → product_id, price; checkout.started → value, currency; purchase.completed → order_id, value, currency.' },
  { id: 'missing-page-view-events', name: 'Missing page views', severity: 'info', condition: 'A nonempty event sample contains no page.view events.' },
  { id: 'tracked_page_missing', name: 'Page missing', severity: 'warning', condition: 'A checked tracked URL returns HTTP 404 or 410.' },
  { id: 'tracked_page_server_error', name: 'Page server error', severity: 'warning / critical', condition: 'A checked URL returns HTTP 500 or higher. Critical for a conversion-like URL or one with at least 10 observed events; otherwise warning.' },
  { id: 'tracked_page_timeout', name: 'Page timeout', severity: 'warning', condition: 'A tracked-page health request times out.' },
  { id: 'tracked_page_unreachable', name: 'Page unreachable', severity: 'warning', condition: 'A tracked-page health request fails with a network error.' },
  { id: 'tracked_page_redirect_mismatch', name: 'Page redirects to another host', severity: 'warning', condition: 'The final redirect host (including its port) differs from the original URL host.' },
] as const;
