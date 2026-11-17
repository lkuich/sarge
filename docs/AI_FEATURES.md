# AI Features

Sarge's AI direction is agent-native debugging: the product should turn tracking data into concrete code fixes that can be handed to an agentic coding tool.

## Current Baseline

The portal shows an AI review in the Diagnostics tab for Production on Growth and higher. Reviews can come from the scheduled Worker pipeline when available, and fall back to deterministic live analysis of recent events before the first scheduled run.

Projects have persisted Production, Staging, and Development environments. Diagnostic AI recommendations run for Production only. Staging and Development keep their own pixel URLs, event streams, user/session flows, Live events, credentials, and webhook configuration. The separate Insights tab supports all three environments, with data isolated to the selected environment.

## Insights and streaming chat

The Insights tab compares the last **7 complete UTC days** with the previous 7, excluding today, marked test traffic, off-domain events, and data outside the owning workspace's retention policy. It shows event/session counts, daily activity, event mix, checkout and purchase sessions, sessions with both checkout and purchase, purchase sessions without observed Meta Purchase, repeated order IDs, and events with missing required ecommerce properties. Watchdog observations are included in event mix but excluded from headline event/session counts. Empty session IDs do not count as sessions. These are independent aggregates, not new diagnostic rules or changes to severity.

Opening the tab automatically requests a proactive AI interpretation even when there are no diagnostic findings. No AI request is made for an entirely empty window. Chat streams answers about the same aggregate scope and supports follow-up questions. It cannot inspect individual events, search other date ranges, run SQL, or change project configuration. Chat is kept only in browser component memory and clears on navigation; requests include up to five recent exchanges plus the current question. This release does not schedule background Insights jobs or send anomaly notifications.

The portal uses **AI SDK 7** with `@ai-sdk/openai` directly against the Responses API, reusing the existing server-side `OPENAI_API_KEY` and configurable `OPENAI_SUMMARY_MODEL` (default `gpt-6-luna`). There is no AI Gateway or additional API key. Streaming has a 30-second total timeout, 15-second first-content timeout, 700-token output cap, and no retries. Browser cancellation stops generation. Empty, failed, aborted, or truncated answers are discarded; aggregate cards stay available and the user can retry. Model output is rendered as escaped text, not HTML.

The API authenticates each request, enforces environment sharing/ownership and the **project owner's** Growth-or-higher entitlement, and rebuilds aggregates server-side rather than trusting browser evidence. POSTs require same-origin JSON. Bodies are capped at 32 KB, questions/messages at 2,000 characters, and history at 12 messages. `INSIGHTS_RATE_LIMITER` in `www/wrangler.jsonc` limits AI requests to 10 per minute per signed-in user/active organization. Cloudflare rate limiting is per location, not a global billing cap. If this binding or the API key is missing, AI requests fail closed while GET aggregate data remains available.

**Privacy:** only fixed event labels, aggregate counts, and date buckets leave the database for AI analysis. Custom event names are collapsed into `custom events`; no raw payloads, session/user/order IDs, customer URLs, or free-form event properties are sent. This prevents custom labels containing personal data from leaking but means chat cannot distinguish individual custom event types. User-authored questions and recent chat context are sent to OpenAI; the UI explicitly asks users not to include personal data. Requests use `store: false`; the provider's abuse-monitoring retention and account data controls still apply. Counts for small populations may themselves be sensitive. No project names or IDs are included in the model prompt.

**Interpretation:** zero previous activity is not infinite growth; sparse active days prompt a coverage warning. Checkout/purchase counts are same-window observations, not an ordered or attributed funnel. Normal abandonment, delayed purchases, consent, and blockers can explain gaps. Repeated order IDs do not prove duplicate charges. Insights are hypotheses for investigation, not confirmed incidents.

**Rollout:** no database migration or new secret is needed. Build/test and deploy `sarge-www` with its existing deploy script so the new rate-limit binding is installed. The scheduled `sarge-hosted` worker is unchanged by this feature. Run `pnpm --dir www test` for API, streaming, UI, catalog, and query-scope checks. Optional SQL integration tests use `INSIGHTS_SQL_TEST_DATABASE_URL` and synthetic CTE fixtures in read-only transactions; they do not read or write application tables. Recheck the live tab with an authorized Growth project and verify that aggregate data remains visible on AI failures.

The first rules cover:

- checkout sessions that never emit `purchase.completed`
- duplicate `purchase.completed` events for the same `order_id`
- Meta Purchase calls that are not mirrored into Sarge
- Sarge purchases where Meta Purchase was not observed
- ecommerce tracking-plan properties that are missing
- missing `page.view` events in the inspected sample

Each finding includes:

- severity
- evidence from recent events
- recommendation
- copyable agent prompt

This is intentionally deterministic before it is generative. The LLM layer should explain, prioritize, and propose changes, but it should not invent facts that are not visible in the event stream.

Events marked with `properties.sarge_test === true` are test traffic. The diagnostics rules exclude test traffic from their event analysis. API/MCP results can include test events; callers must inspect this property because `list_events` has no test-traffic filter argument.

## Scheduled Diagnostic Pipeline

The hosted Worker has a Cloudflare Cron Trigger configured in `apps/worker/wrangler.jsonc`:

```jsonc
"triggers": {
  "crons": ["*/30 * * * *"]
}
```

Every scheduled run:

1. Loads up to 50 active Production environments from Neon (the scheduled selector currently does not gate by plan).
2. Reads up to 200 recent events from the last 60 minutes for each environment by default.
3. Runs deterministic diagnostics from `@sarge/core`.
4. Calls OpenAI only when findings exist and `OPENAI_API_KEY` is configured.
5. Replaces the environment’s previous diagnostic run/findings with the new `DiagnosticRun` and `DiagnosticFinding` rows, including the optional AI summary.

The portal's **Refresh insights** action and management MCP `refresh_diagnostics` use the same summarizer. Both paths retain their existing event selection, deterministic rules, severity, findings, evidence, recommendations, and copyable agent prompts. The shared implementation is `packages/core/src/diagnostic-summary.ts`, with a small `DiagnosticSummaryProvider` function interface and a direct OpenAI Responses API adapter using platform `fetch`.

### OpenAI configuration and deployment

- **`OPENAI_API_KEY`**: server-side secret on **both** `sarge-hosted` (scheduled diagnostics) and `sarge-www` (manual portal/MCP refresh). Never use a `PUBLIC_` prefix, embed the value in source/config, or pass it to browser components.
- **`OPENAI_SUMMARY_MODEL`**: optional non-secret model ID, default `gpt-6-luna`, configured in both Wrangler files. The old `AI_SUMMARY_MODEL` is ignored. Using a new variable avoids retaining the retired Llama ID when the portal deploys with `keep_vars`.
- The [GPT-6 Luna documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) describes an inexpensive model for focused, high-volume tasks. The adapter uses `reasoning.effort: "none"` and a 300-token output ceiling for the existing short summary. Any override must support the Responses API and these parameters.

On 2026-11-16, the supplied API key successfully retrieved `gpt-6-luna` and generated a synthetic diagnostic summary through the shared adapter. For a new API project/key, verify `gpt-6-luna` access with the intended API project's key (`GET https://api.openai.com/v1/models/gpt-6-luna`) and a synthetic summary request. If unavailable, set `OPENAI_SUMMARY_MODEL` to an inexpensive compatible GPT model that the project can access. There is no automatic model switching or paid retry loop.

Local development: put `OPENAI_API_KEY` in an ignored `.dev.vars` file beside each worker's Wrangler config (`apps/worker/.dev.vars` and `www/.dev.vars`). These files and environment-specific variants are gitignored. Never commit a real key.

Operator rollout steps (these commands change live secrets/deployments):

1. Verify model access and set the secret separately on each worker using Cloudflare's dashboard or interactive Wrangler prompts:

   ```bash
   pnpm --dir apps/worker exec wrangler secret put OPENAI_API_KEY --name sarge-hosted
   pnpm --dir www exec wrangler secret put OPENAI_API_KEY --name sarge-www
   ```

   Paste the key only into the secret prompt, not into a shell command or committed file. Wrangler secret changes can deploy a worker version; coordinate this with the rollout. See [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

2. Review `OPENAI_SUMMARY_MODEL` in both Wrangler configs. For later changes on the portal, also update the live variable explicitly because `keep_vars` preserves existing values.
3. Run tests/builds, then deploy **both** workers using the existing commands:

   ```bash
   pnpm --filter @sarge/worker run deploy
   pnpm --dir www run deploy
   ```

   No new database migration is required. Existing installations still need the previously committed diagnostic schema migrations.
4. Verify a manual refresh and a scheduled run. The unused Workers AI bindings have been removed from both configurations. Any old live `AI_SUMMARY_MODEL` variable can be removed during this operator rollout; no code reads it.

### Failure behavior and privacy

The unchanged summary instruction requests concise Markdown, at most 80 words, 2–4 bullets, supplied evidence only, no Summary heading, and a useful agentic coding prompt at the end. The provider has a **10-second timeout**, covering fetch and response-body parsing, and makes one request without retries. Missing/blank keys, denied or unavailable models, rate limits, other API/network failures, invalid JSON, malformed/empty/refused responses, and incomplete responses all produce `aiSummary: null`. The run still completes with the original deterministic text and findings. The portal already hides the optional summary when null and displays those findings. Logs never include provider response bodies, keys, prompts, or raw exceptions.

Only a redacted copy of diagnostic findings is sent. No event payloads, site/environment IDs, endpoint hosts, user IDs, raw session/order IDs, page URLs (including paths/query strings), or free-form implementation notes are needed by this summary request. Evidence retains diagnostic facts such as duplicate counts, HTTP status, and observed event counts. URLs become `[tracked page]`; original evidence, exact URLs, and full agent prompts remain stored and visible in Sarge. This makes the AI overview less specific about individual pages/sessions and omits customer implementation context, so use the deterministic findings for exact investigation details. Redaction follows the current deterministic finding templates; changes to those templates must extend the privacy tests before sending new customer-derived fields.

The request uses `store: false` and has no tools or conversation history. This disables Responses application-state storage, **not** all provider retention: OpenAI abuse-monitoring retention and the API project's data controls still apply. Diagnostic facts now cross from Cloudflare to OpenAI, so review provider/data-processing requirements for your customers. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

### Rule review note (unchanged)

`checkout-without-purchase` remains **critical** when a sampled checkout session has no sampled purchase. Normal abandonment, a purchase after the observation window, or a purchase omitted by the event limit can all trigger it. Absence in this bounded sample does not establish a tracking failure. Review severity/window semantics separately; this summarizer replacement does not change them.

## Tracked Page Monitoring

Scheduled diagnostics also check a bounded set of Production page URLs that recently emitted Sarge events. Sarge normalizes and deduplicates recent event URLs and selects up to 25 pages per environment. A shared budget limits each scheduled run to 10 URL checks by default, with a 5-second request timeout. Failures appear in the AI review findings list.

The monitor flags missing pages (`404` and `410`), server errors (`5xx`), DNS/TLS failures, request timeouts, and redirects to a different host. It does not crawl a site, check every incoming event URL, or require users to configure pinned URLs.

These checks run outside the ingestion path and do not add synchronous work to event collection.

## Agent Install Skill

The repo includes a local skill for coding agents:

```text
.agents/skills/sarge-install/SKILL.md
```

Use it when installing Sarge into customer apps or sample apps. It tells agents where to place the hosted pixel, which ecommerce events to wire, how to preserve existing Meta/Google pixels, and how to verify events in the portal.

## MCP and Further AI Work

The hosted Worker now exposes authenticated, read-only `list_events` at `https://track.sargetrack.app/mcp` through Streamable HTTP. Environment API export tokens work on every plan. See the [MCP guide](../www/public/docs/mcp.md). The tool returns retained raw events; diagnostic-query and project-management tools are not exposed.

Further AI work can build on that event interface.

Recommended shape:

- existing `list_events` tool for recent events scoped by the environment credential
- server-side tool for fetching persisted diagnostic findings for production environments
- prompt contract that requires citations to event IDs, sessions, and timestamps
- read-only first release
- optional "generate implementation brief" output for agentic coding tools

The LLM should answer questions like:

- "Why are purchases missing?"
- "Which sessions fired Meta but not Sarge?"
- "What should I ask Cursor/Codex to change?"
- "Is my checkout tracking ready for ads debugging?"
- "Show only test traffic from my impersonation run."

## Guardrails

- Do not expose raw database credentials to the model.
- Do not let the model mutate scripts or project config without an explicit user action.
- Keep deterministic findings visible beside model output.
- Make test traffic filters explicit when evidence includes `sarge_test` events.
- Require generated fix plans to cite observed events or clearly state that they are inferred.
