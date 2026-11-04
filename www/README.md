# Sarge WWW

Astro application for the Sarge web dashboard and public app shell. It uses Clerk for auth, shadcn/ui for interface components, and deploys to Cloudflare Workers through the Astro Cloudflare adapter.

Each project has Overview, Sessions, Live events, Diagnostics, Setup, and Settings tabs. The dashboard includes project event streams, user/session flow exploration, webhook destination configuration (delivery is not implemented), Production AI review summaries, and real/test traffic filtering for page-console impersonation runs.

Production URL:

```text
https://sargetrack.app
```

## Local Development

Run these commands from the repository root. Install workspace dependencies:

```sh
pnpm install
```

Create `www/.env`:

```sh
PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
PUBLIC_CLERK_SIGN_IN_URL=/sign-in
PUBLIC_CLERK_SIGN_UP_URL=/sign-up
DATABASE_URL=...
SARGE_EMAIL_FROM=invites@sargetrack.app
```

Run the app:

```sh
pnpm --dir www dev
```

## Cloudflare Deployment

The app is configured in `wrangler.jsonc` as the `sarge-www` Worker and is routed through Cloudflare DNS at `sargetrack.app/*` and `www.sargetrack.app/*`.

Required GitHub Actions secrets:

```sh
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEON_DATABASE_URL
```

The deployment token needs Workers Scripts and Workers Routes permissions for the configured account and zone. DNS setup is a separate operation. `PUBLIC_CLERK_PUBLISHABLE_KEY` is used while building the client bundle. Runtime Clerk variables are managed in the Cloudflare dashboard and preserved during deploys. `NEON_DATABASE_URL` is installed on the Cloudflare Worker as the runtime `DATABASE_URL` secret so the portal can read live project and event data.

Project invite emails use Cloudflare Email Service through the Worker `EMAIL` binding in `wrangler.jsonc`. Before invites can send, onboard the sender domain in Cloudflare Email Service and set `SARGE_EMAIL_FROM` to an address on that domain:

```sh
pnpm --dir www exec wrangler email sending enable sargetrack.app
printf '%s' 'invites@sargetrack.app' | pnpm --dir www exec wrangler secret put SARGE_EMAIL_FROM
```

Manual deploy:

```sh
pnpm --dir www deploy
```

The deploy script builds Astro first, then deploys with `dist/server/wrangler.json` so the Worker code and hashed client assets come from the same generated build output.

After the first deploy, set runtime Clerk values in the Cloudflare dashboard and set the database secret on the remote Worker:

```sh
printf '%s' "$NEON_DATABASE_URL" | pnpm --dir www exec wrangler secret put DATABASE_URL
```

GitHub Actions deploys from `.github/workflows/cloudflare-www.yml` on pushes that touch `www/**` or the workflow file.

## Documentation maintenance

Edit browser docs in `src/pages/docs/` and the corresponding agent guides in `public/docs/`. Keep `public/llms.txt` linked to every Markdown guide. After edits, run:

```sh
pnpm --dir www docs:generate
pnpm --dir www test
pnpm --dir www build
```

`docs:generate` builds `public/llms-full.txt` from every `public/docs/*.md` guide. `docs:check` runs with web tests and rejects a stale bundle or an unindexed guide. It does not overwrite edits during tests.
