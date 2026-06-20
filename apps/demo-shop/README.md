# Sarge Demo Shop

Tiny ecommerce storefront used to prove the hosted Sarge pixel end to end.

Production URL:

```text
https://shop.lkuich.com
```

The page installs the hosted pixel from:

```html
<script async src="https://sarge.lkuich.com/pixel.js?site=site_demo"></script>
```

It emits:

- `page.view`
- `product.viewed`
- `cart.added`
- `cart.opened`
- `checkout.started`
- `purchase.completed`
- `meta.pixel.fire` from Sarge's automatic `fbq` watchdog

Deploy manually:

```sh
pnpm --filter @sarge/demo-shop deploy
```

GitHub Actions deploys from `.github/workflows/cloudflare-demo-shop.yml` when `apps/demo-shop/**` changes.
