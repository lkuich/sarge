# Sarge Pricing

Sarge is priced as tracking assurance and attribution debugging, not generic product analytics.

## Plans

| Plan | Price | Primary limits |
| --- | ---: | --- |
| Free | $0/mo | 1 project, 1 shared user/project, 50k events/month, 7-day retention |
| Starter | $35/mo | 3 projects, 3 shared users/project, 250k events/month, 30-day retention |
| Growth | $149/mo | 10 projects, 10 shared users/project, 2M events/month, 90-day retention |
| Scale | Contact us | unlimited shared users/project, custom volume, dedicated infrastructure, SSO, audit logs, SLA |

## Launch Discount

The Starter checkout supports Stripe promotion codes. To create the launch code, run this from the `www` package with production Stripe environment variables:

```bash
STRIPE_SECRET_KEY=sk_live_... STRIPE_PRICE_STARTER=price_... pnpm --dir www stripe:create-launchday-discount
```

The script creates or reuses:

- Coupon id `sarge_starter_launchday_2_months_free`
- Promotion code `LAUNCHDAY`
- 100% off for `2` months
- Restricted to the Stripe product behind `STRIPE_PRICE_STARTER`

## Gate Philosophy

Do not gate the core install path. Users must be able to install Sarge, verify events, see the debug stream, use the public verify page, and understand the default 28-day affiliate attribution window before they feel value.

Gate these because they map to business value:

- retention
- event volume
- AI diagnostics
- server-side secrets
- postback tokens
- webhooks
- team and project sharing
- client workspaces
- exports and API access
- configurable attribution windows
- dedicated infrastructure
- compliance and security controls
