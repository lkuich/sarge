# Sarge Demo Shop

Tiny ecommerce storefront used to prove the hosted Sarge pixel end to end.

Production URL:

```text
https://shop.sargetrack.app
```

The page installs the hosted pixel from:

```html
<script async src="https://track.sargetrack.app/pixel.js?env=env_demo_production"></script>
```

It emits:

- `page.view`
- `product.viewed`
- `cart.added`
- `cart.opened`
- `checkout.started`
- `purchase.completed`
- `data_layer.push` from Sarge's automatic `dataLayer.push` watchdog
- `google.tag.fire` from Sarge's automatic `gtag` watchdog
- `meta.pixel.fire` from Sarge's automatic `fbq` watchdog

The GTM, Google tag, and Facebook Pixel IDs in the demo page are placeholders. They are intentionally local browser stubs that exercise the same APIs real marketing tags use without connecting to an ad account.

Deploy manually:

```sh
pnpm --filter @sarge/demo-shop deploy
```

GitHub Actions deploys from `.github/workflows/cloudflare-demo-shop.yml` when `apps/demo-shop/**` changes.
