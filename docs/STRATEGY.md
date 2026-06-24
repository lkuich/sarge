# Sarge Product Strategy

Sarge is being repositioned as a dead-simple event pixel for teams that need to debug and prove tracking behavior across websites and apps.

## Product Thesis

Paid media tracking is too important to trust only platform dashboards, but most analytics, CDP, and server-side tracking products are too heavy when the immediate problem is: "what fired, when, with which payload?"

Sarge should be the cheap neutral event recorder teams install alongside existing pixels to inspect real behavior.

## Positioning

Working tagline:

```text
The dead-simple event pixel for teams who do not trust their event stack.
```

Internal shorthand:

```text
The idiot-proof pixel.
```

External framing should stay respectful and operator-focused:

- simple to install
- hard to misfire silently
- cheap enough to leave on
- useful for debugging other media pixels and events

## Near-Term Product Shape

The first modern version should focus on:

- a tiny browser script
- a clean `sarge('track', eventName, properties)` API
- real-time event ingestion
- reliable event storage
- project-scoped tester identities and test-traffic filters
- easy local development
- a backend foundation that can support future dashboards and querying

## Future Product Directions

### Pixel Watchdog

The script should eventually observe other tracking behavior on the page:

- `dataLayer.push(...)`
- `gtag(...)`
- `fbq(...)`
- `ttq.track(...)`
- other common ad and analytics globals
- known network calls to media/analytics endpoints

The goal is not to replace those tools. The goal is to show a timeline of what happened and flag missing, duplicated, malformed, or inconsistent events.

### Test Traffic and Impersonation

Sarge should make testing flows explicit instead of letting QA events pollute production debugging data. Each project can assign a tester-specific identity, let that tester impersonate a target `userId` from the page console, and mark the resulting events with `sarge_test` metadata. The event stream and flow explorer should default to real traffic while letting users switch to test-only or all-traffic views.

### Custom Script Deployment

The backend should eventually support versioned custom scripts per site. An LLM coding workflow could help generate or adjust scripts for specific installs, such as Shopify checkout tracking, form tracking, or SPA route tracking.

### LLM Event Interface

The LLM should answer questions over structured event data, with links back to actual events and filters:

- "Did purchases stop firing after yesterday's deploy?"
- "Which pages fire AddToCart without product IDs?"
- "Are we double-firing Lead?"
- "Show sessions where Meta received Purchase but Google did not."
- "Hide test traffic and show only real purchases for customer_123."

The LLM should be an explanation/query layer, not the source of truth.

## Monetization Direction

Keep pricing aggressive:

- free or very cheap single-site debugging
- low-cost per-site paid plans
- agency plans for many client sites
- paid retention, alerts, reports, and collaboration features

The strongest paid wedge is continuous event QA and monitoring, not generic analytics.

## Distribution Direction

Sarge should support three distribution paths:

- Self-hosted for technical teams that want control and trust.
- Hosted shared infrastructure as the default commercial path.
- Dedicated hosted infrastructure as a higher-touch "Contact us" option.

The hosted shared path should use Cloudflare for the hosted edge/domain layer and Neon for Postgres. Each customer should get a custom endpoint and customized pixel without provisioning separate infrastructure per customer.

## Current Modernization Boundary

This modernization phase only builds the foundation:

- TypeScript API
- TypeScript pixel
- page-console impersonation and test-traffic metadata
- user/session flow filtering for real versus test traffic
- pnpm workspace
- Prisma/Postgres
- local Docker Compose
- v2 event ingestion contract

Script editor, deployment, auth, billing, and LLM querying are future phases.
