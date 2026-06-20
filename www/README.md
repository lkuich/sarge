# Sarge WWW

Astro application for the Sarge web dashboard and public app shell. It uses Clerk for auth, shadcn/ui for interface components, and deploys to Cloudflare Workers through the Astro Cloudflare adapter.

Production URL:

```text
https://app.lkuich.com
```

## Local Development

Install dependencies:

```sh
npm install
```

Create `www/.env`:

```sh
PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
PUBLIC_CLERK_SIGN_IN_URL=/sign-in
PUBLIC_CLERK_SIGN_UP_URL=/sign-up
DATABASE_URL=...
```

Run the app:

```sh
npm run dev
```

## Cloudflare Deployment

The app is configured in `wrangler.jsonc` as the `sarge-www` Worker and is routed through Cloudflare DNS at `app.lkuich.com/*`.

Required GitHub Actions secrets:

```sh
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEON_DATABASE_URL
```

The Cloudflare token needs access to the `lkuich.com` zone and permission to deploy Workers, edit Worker routes, and edit DNS records. `NEON_DATABASE_URL` is installed on the Cloudflare Worker as the runtime `DATABASE_URL` secret so the portal can read live project and event data.

Manual deploy:

```sh
npm run deploy
```

After the first deploy, set the Clerk secret on the remote Worker:

```sh
printf '%s' "$CLERK_SECRET_KEY" | npx wrangler secret put CLERK_SECRET_KEY
printf '%s' "$NEON_DATABASE_URL" | npx wrangler secret put DATABASE_URL
```

GitHub Actions deploys from `.github/workflows/cloudflare-www.yml` on pushes that touch `www/**` or the workflow file.
