# AI Features

Sarge's AI direction is agent-native debugging: the product should turn tracking data into concrete code fixes that can be handed to an agentic coding tool.

## Current Baseline

The portal shows an AI review on each project detail screen. Reviews can come from the scheduled Worker pipeline when available, and fall back to deterministic live analysis of recent events before the first scheduled run.

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

## Scheduled Diagnostic Pipeline

The hosted Worker has a Cloudflare Cron Trigger configured in `apps/worker/wrangler.jsonc`:

```jsonc
"triggers": {
  "crons": ["*/30 * * * *"]
}
```

Every scheduled run:

1. Loads active sites from Neon.
2. Reads recent events for each site.
3. Runs deterministic diagnostics from `@sarge/core`.
4. Stores a `DiagnosticRun` and related `DiagnosticFinding` rows in Neon.
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
@cf/meta/llama-3.1-8b-instruct
```

Run the new migration before relying on scheduled diagnostics:

```bash
pnpm prisma:deploy
```

## Agent Install Skill

The repo includes a local skill for coding agents:

```text
.agents/skills/sarge-install/SKILL.md
```

Use it when installing Sarge into customer apps or sample apps. It tells agents where to place the hosted pixel, which ecommerce events to wire, how to preserve existing Meta/Google pixels, and how to verify events in the portal.

## Next AI Layer

The next layer should add an authenticated LLM interface that can query project data and generate scoped recommendations on demand.

Recommended shape:

- server-side tool for fetching recent events by project
- server-side tool for fetching persisted diagnostic findings
- prompt contract that requires citations to event IDs, sessions, and timestamps
- read-only first release
- optional "generate implementation brief" output for agentic coding tools

The LLM should answer questions like:

- "Why are purchases missing?"
- "Which sessions fired Meta but not Sarge?"
- "What should I ask Cursor/Codex to change?"
- "Is my checkout tracking ready for ads debugging?"

## Guardrails

- Do not expose raw database credentials to the model.
- Do not let the model mutate scripts or project config without an explicit user action.
- Keep deterministic findings visible beside model output.
- Require generated fix plans to cite observed events or clearly state that they are inferred.
