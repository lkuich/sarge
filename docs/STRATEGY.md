# Sarge Product Strategy

Reviewed 2026-11-04. This document distinguishes current product behavior from proposed work. Runtime and operational details live in [the documentation map](README.md).

## Product Thesis

Sarge is a lightweight event recorder for teams that need to prove what fired, when, and with which payload. It sits alongside existing media pixels to help debug tracking and attribution.

## Current Product

- Hosted browser pixel and authenticated backend/partner ingestion on Cloudflare, backed by Neon.
- Production, Staging, and Development identities for each project.
- Overview, Sessions, Live events, Diagnostics, Setup, and Settings tabs.
- Browser watchdogs for `fbq`, `gtag`, and `dataLayer.push`; server-reported vendor dispatches.
- Test-traffic impersonation and filters.
- Production deterministic diagnostics, bounded page monitoring, and AI summaries.
- Clerk organization access, external project shares, Stripe billing, and plan quotas.
- Property privacy controls and queued deletion requests.
- Raw event exports and authenticated read-only MCP on every plan.

The core value is tracking verification and evidence, not a complete payment ledger or generic analytics platform. The LLM consumes event evidence; it does not establish facts by itself.

## Further Product Work

- Outbound webhook delivery, retries, and delivery visibility; destinations can currently only be configured.
- Broader browser/network watchdog coverage beyond the three supported globals.
- Versioned custom scripts and an editor/deployment workflow.
- MCP diagnostic-query tools and richer evidence-linked recommendations beyond `list_events`.
- Automated customer-domain provisioning, dedicated-environment operations, and negotiated enterprise controls.
- General request throttling and scheduled physical retention purging.

These are proposals, not available capabilities. A Scale plan feature flag alone does not provision SSO, audit logs, warehouse sync, or a dedicated deployment.

## Monetization and Distribution

Hosted shared infrastructure is the current commercial path. Pricing and enforced limits are documented in [PRICING.md](PRICING.md). Keep pixel installation, temporary verification, and API/MCP read access available on Free. Paid tiers expand volume, retention, server integrations, diagnostics, attribution controls, and collaboration.

The repository contains an Express/Compose path for teams operating their own infrastructure, but it does not provide a packaged equivalent of the hosted portal. Dedicated hosting is a contact-us offering whose requirements and commitments must be agreed before provisioning; see [DEDICATED_HOSTING.md](DEDICATED_HOSTING.md).
