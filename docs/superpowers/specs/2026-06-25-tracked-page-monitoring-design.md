# Tracked Page Monitoring Design

**Status:** Approved design direction, pending user review
**Date:** 2026-06-25
**Scope:** Add active health monitoring for pages that previously emitted Sarge tracking events, surfaced as part of the regular scheduled AI review.

## Goal

Sarge should catch regressions where a customer page that used to track successfully starts returning an HTTP failure. The feature should require no customer setup at launch: Sarge monitors pages it has already observed through captured events and reports failures in the existing AI review surface.

This is tracking assurance, not a crawler or general uptime monitor. The first version only checks URLs that appeared in recent Production tracking events.

## Non-Goals

- Do not crawl entire sites.
- Do not check every URL on every event.
- Do not require users to configure pinned URLs in the first version.
- Do not block ingestion or add latency to event collection.
- Do not create a separate monitoring product surface before the AI review integration exists.

## Product Behavior

During scheduled diagnostics, Sarge builds a bounded list of recently captured Production page URLs for each project environment. It checks those URLs and creates diagnostic findings when pages are unavailable or unhealthy.

The feature should flag:

- `404` and `410` as missing pages.
- `5xx` responses as server errors.
- request timeout as page timeout.
- DNS or TLS failures as unreachable pages.
- suspicious redirects away from the original host as redirect failures.

The AI review should summarize these findings with concrete evidence, for example: "Sarge saw tracking on `/checkout` recently, but that page now returns 500."

## URL Selection

Use event URLs from the same scheduled diagnostic window. Normalize URLs before deduplication:

- strip hash fragments.
- drop common tracking query parameters such as `utm_*`, `fbclid`, `gclid`, `msclkid`, `sarge_ref`, and `sarge_aff`.
- preserve path and meaningful query parameters.
- require `http:` or `https:`.
- ignore malformed URLs.

Prioritize checked URLs by:

1. URLs with conversion-like event names.
2. URLs with higher event volume.
3. URLs seen most recently.

Apply a per-environment cap so scheduled diagnostics remain bounded. A reasonable first cap is 25 URLs per Production environment per scheduled run.

## Architecture

Add URL health checks to the existing Worker scheduled diagnostics path:

- `EventStore.listRecentEventsForSite` continues to provide the diagnostic event window.
- A new core helper selects and normalizes candidate URLs from those events.
- A Worker-side checker performs network requests with timeouts and redirect limits.
- The diagnostic runner merges URL health findings with existing event diagnostics before saving the `DiagnosticRun`.
- The existing AI summary prompt receives these findings like any other diagnostic finding.
- The project detail AI review panel renders them through the current findings UI.

This keeps monitoring in the same operational loop as AI review and avoids a separate scheduler.

## Data Model

No new tables are required for the first version.

URL health failures are stored as normal `DiagnosticFinding` rows with new rule IDs:

- `tracked_page_missing`
- `tracked_page_server_error`
- `tracked_page_timeout`
- `tracked_page_unreachable`
- `tracked_page_redirect_mismatch`

Each finding should include:

- severity.
- affected URL.
- observed status code or network error.
- last known event count for that URL in the diagnostic window.
- evidence text suitable for display and AI summarization.
- an agent prompt suggesting how to investigate the broken route or deploy.

## Severity

- `critical`: `5xx` on a high-volume or conversion URL.
- `warning`: `404`, `410`, timeout, DNS/TLS failure, or redirect mismatch.
- `info`: reserved for future degraded-but-not-broken states.

Timeouts are often transient. The first version should create a warning on timeout, but the copy should say the page timed out during the scheduled check rather than claiming it is permanently down.

## Network Checks

The checker should:

- try `HEAD` first.
- fallback to `GET` when `HEAD` returns `405`, `403`, or another method-specific failure that does not prove the page is unavailable.
- use a short timeout, such as 5 seconds.
- follow a small number of redirects, such as 3.
- classify final status and redirect host.
- avoid sending Sarge credentials or customer cookies.
- use a clear user agent identifying Sarge page monitoring.

## Error Handling

Monitoring failures must never fail the whole scheduled diagnostic run.

If an individual URL check errors, record a finding only when the error is meaningful to the customer, such as DNS failure, TLS failure, or timeout. If the checker itself has an unexpected internal error, log it and continue with the remaining URLs.

If all URL checks fail because of a platform-wide fetch issue, skip URL health findings for that environment and allow existing event diagnostics to run.

## Feature Gating

This should be part of scheduled AI review. When pricing gates are active, expose tracked page monitoring only where scheduled AI audits are available. The first implementation should avoid separate customer-facing settings.

## Testing

Add unit coverage for:

- URL normalization and deduplication.
- priority selection and per-environment caps.
- HTTP status classification.
- timeout and network error classification.
- conversion/high-volume severity escalation.

Add Worker tests for:

- scheduled diagnostics merge URL health findings into saved diagnostic runs.
- the runner continues when one URL check fails.
- no URL checks happen when there are no recent event URLs.
- no URL checks happen for non-Production environments, matching current AI review scope.

Add source or UI tests for:

- new finding rule IDs render in the existing AI review panel.
- AI prompt context includes URL health evidence.

## Implementation Defaults

- Exact per-run URL cap: start with 10 by default, with an environment override for paid Worker deployments that can handle more checks.
- Exact timeout: start with 5 seconds.
- Whether `403` should be considered healthy. First version should treat it as inconclusive and not report it unless the final URL clearly indicates an error page.

## Acceptance Criteria

- A previously tracked URL that returns `500` during scheduled diagnostics appears as a diagnostic finding in the project AI review.
- A previously tracked URL that returns `404` appears as a diagnostic finding.
- A timed-out check creates a warning without failing the scheduled diagnostic run.
- Event ingestion remains unaffected by monitoring checks.
- The feature requires no user configuration.
