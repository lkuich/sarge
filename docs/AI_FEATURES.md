# AI Features

Sarge's AI direction is agent-native debugging: the product should turn tracking data into concrete code fixes that can be handed to an agentic coding tool.

## Current Baseline

The portal shows an AI review in the Diagnostics tab for Production on Growth and higher. Reviews can come from the scheduled Worker pipeline when available, and fall back to deterministic live analysis of recent events before the first scheduled run.

Projects have persisted Production, Staging, and Development environments. AI recommendations currently run for Production only. Staging and Development keep their own pixel URLs, event streams, user/session flows, Live events, credentials, and webhook configuration, but the AI review panel is disabled for those environments.

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
4. Replaces the environment’s previous diagnostic run/findings with the new `DiagnosticRun` and `DiagnosticFinding` rows.
5. Calls Cloudflare Workers AI only when findings exist.
6. Stores the AI summary on the diagnostic run.

Workers AI is configured through the native binding:

```jsonc
"ai": {
  "binding": "AI"
}
```

The default model is set with `AI_SUMMARY_MODEL` and currently uses:

```text
@cf/meta/llama-3.1-8b-instruct-fp8
```

Apply committed migrations before relying on scheduled diagnostics:

```bash
pnpm prisma:deploy
```

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
