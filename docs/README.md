# Sarge Documentation Map

Reviewed against the repository on 2026-11-04. Public instructions describe the hosted product; repository guides explain implementation and operations.

## Public and LLM Guides

- [Human documentation](https://sargetrack.app/docs)
- [Install, dashboard tabs, verification, and data controls](../www/public/docs/install.md)
- [Event reference](../www/public/docs/events.md)
- [Raw event export](../www/public/docs/api.md)
- [MCP client connection](../www/public/docs/mcp.md)
- [LLM index](../www/public/llms.txt)
- [Complete generated LLM bundle](../www/public/llms-full.txt)

Edit `www/public/docs/*.md` and the matching browser pages in `www/src/pages/docs/`. Every public Markdown guide must be linked from `llms.txt`. Run `pnpm --dir www docs:generate` after changes; `pnpm --dir www test` checks bundle freshness. Keep the repository installation guide aligned with the public install guide.

## Current Repository Guides

- [Installation](INSTALLATION.md) and [tracking client](TRACKING_CLIENT.md)
- [API runtimes and contracts](API.md)
- [Hosted architecture](HOSTED_SHARED_TECHNICAL_SPEC.md)
- [Cloudflare and Neon deployment](CLOUDFLARE_NEON_DEPLOYMENT.md) and [portal development](../www/README.md)
- [Clerk organization access](CLERK_ORGANIZATIONS.md)
- [Pricing and feature availability](PRICING.md)
- [Diagnostics and AI](AI_FEATURES.md)
- [Product direction and remaining work](STRATEGY.md)
- [Operating the Express API yourself](SELF_HOSTED.md)
- [Dedicated hosting scope](DEDICATED_HOSTING.md)
- [Repository overview](../README.md) and [demo shop](../apps/demo-shop/README.md)
- [Bundled agent installation skill](../.agents/skills/sarge-install/SKILL.md)

## Historical Records

[AUDIT.md](AUDIT.md) preserves the June 2026 modernization audit. Dated files under `superpowers/specs/` and `superpowers/plans/` preserve design proposals and execution plans; they are historical records, not current setup instructions or promises that every proposed feature shipped. The current guides above supersede their capability, endpoint, and deployment descriptions.
