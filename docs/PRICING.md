# Sarge Pricing

Sarge is priced as tracking assurance and attribution debugging, not generic product analytics.

## Plans

| Plan | Price | Primary limits |
| --- | ---: | --- |
| Free | $0/mo | 1 project, 1 shared user/project, 50k events/month, 7-day retention |
| Starter | $35/mo | 3 projects, 3 shared users/project, 250k events/month, 30-day retention |
| Growth | $149/mo | 10 projects, 10 shared users/project, 2M events/month, 90-day retention |
| Scale | Contact us | unlimited configured project/share/event limits; infrastructure, security, and SLA terms by agreement |

## Launch Discount

The Starter checkout supports Stripe promotion codes. To create the launch code, run this from the repository root with production Stripe environment variables:

```bash
STRIPE_SECRET_KEY=sk_live_... STRIPE_PRICE_STARTER=price_... pnpm --dir www stripe:create-launchday-discount
```

The script creates or reuses:

- Coupon id `sarge_starter_launchday_2_months_free`
- Promotion code `LAUNCHDAY`
- 100% off for `2` months
- Restricted to the Stripe product behind `STRIPE_PRICE_STARTER`

## Gate Philosophy

Do not gate the core install path. Users must be able to install Sarge, verify events, inspect Live events, use the public verify page, and understand the default 28-day affiliate attribution window before they feel value.

Gate these because they map to business value:

- retention
- event volume
- AI diagnostics
- server-side secrets
- postback tokens
- webhooks
- team and project sharing
- client workspaces
- dashboard exports; raw API exports and MCP read access are available on every plan, including Free
- configurable attribution windows
- dedicated infrastructure
- compliance and security controls

## Implementation status

`www/src/lib/pricing.ts` is the source of truth for portal gates; `packages/core/src/usage-limits.ts` defines enforced event/retention limits. The monthly event budget is workspace-wide. At the limit, ingestion returns 429. Retention restricts reads; it does not imply scheduled physical purging.

Server/postback credentials and webhook configuration start at Starter; Production AI review and configurable attribution start at Growth. Webhook delivery is not implemented. Scale feature names in configuration are commercial capabilities to arrange, not proof that SSO, audit logs, warehouse sync, or a dedicated deployment are automatically provisioned.
