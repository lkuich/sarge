export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return new Response("ok");
    }

    return new Response(renderShop(url), {
      headers: {
        "cache-control": "public, max-age=60",
        "content-type": "text/html; charset=utf-8"
      }
    });
  }
};

const renderShop = (url: URL) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Northline Supply Co.</title>
  <meta name="description" content="A tiny ecommerce demo store wired to Sarge event tracking.">
  <script>
    window.SARGE_DEMO_GTM_ID = "GTM-SARGEDEMO";
    window.SARGE_DEMO_META_PIXEL_ID = "123456789012345";
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js", container_id: window.SARGE_DEMO_GTM_ID });
    window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
    window.fbq = window.fbq || function(){ (window.fbq.queue = window.fbq.queue || []).push(arguments); };
    window.fbq.version = "demo";
    window._sarge = {
      queue: [
        ["track", "page.view", { page_type: "collection", demo: "northline-supply", path: "${escapeHtml(url.pathname)}" }]
      ]
    };
  </script>
  <script async src="https://track.sargetrack.app/pixel.js?site=site_demo"></script>
  <style>
    :root {
      color-scheme: light;
      --ink: #1d241f;
      --muted: #647067;
      --paper: #f7f3ea;
      --card: #fffdf7;
      --line: #ded5c3;
      --pine: #25483a;
      --clay: #b65f3b;
      --gold: #d79b3a;
      --sky: #dfeff1;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif;
    }

    button, input {
      font: inherit;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 14px clamp(18px, 4vw, 52px);
      border-bottom: 1px solid var(--line);
      background: rgba(247, 243, 234, 0.92);
      position: sticky;
      top: 0;
      z-index: 10;
      backdrop-filter: blur(16px);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .mark {
      width: 34px;
      height: 34px;
      border: 2px solid var(--ink);
      display: grid;
      place-items: center;
      background: var(--gold);
      transform: rotate(-3deg);
    }

    .nav {
      display: flex;
      align-items: center;
      gap: 14px;
      color: var(--muted);
      font-size: 14px;
    }

    .cart-pill {
      border: 1px solid var(--ink);
      background: var(--ink);
      color: var(--paper);
      border-radius: 999px;
      padding: 8px 12px;
      cursor: pointer;
    }

    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
      gap: clamp(24px, 5vw, 72px);
      padding: clamp(34px, 7vw, 84px) clamp(18px, 4vw, 52px) 36px;
      align-items: end;
    }

    h1 {
      margin: 0;
      max-width: 850px;
      font-size: clamp(46px, 8vw, 112px);
      line-height: 0.9;
      letter-spacing: 0;
    }

    .lede {
      max-width: 620px;
      margin: 22px 0 0;
      color: var(--muted);
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: clamp(16px, 2vw, 20px);
      line-height: 1.6;
    }

    .hero-card {
      min-height: 430px;
      border: 1px solid var(--ink);
      background:
        radial-gradient(circle at 24% 18%, rgba(255,255,255,0.8), transparent 27%),
        linear-gradient(135deg, var(--sky), #e8d4b6 58%, #8fa689);
      position: relative;
      overflow: hidden;
      box-shadow: 12px 12px 0 var(--pine);
    }

    .pack {
      position: absolute;
      inset: auto 12% 12% auto;
      width: min(58%, 280px);
      aspect-ratio: 0.72;
      background: var(--card);
      border: 2px solid var(--ink);
      display: grid;
      place-items: center;
      transform: rotate(4deg);
      box-shadow: 10px 12px 0 rgba(29, 36, 31, 0.24);
    }

    .pack::before {
      content: "";
      width: 56%;
      aspect-ratio: 1;
      border: 2px solid var(--ink);
      border-radius: 50%;
      background: linear-gradient(135deg, var(--clay), var(--gold));
    }

    .caption {
      position: absolute;
      left: 22px;
      bottom: 22px;
      width: min(260px, calc(100% - 44px));
      background: var(--ink);
      color: var(--paper);
      padding: 16px;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.45;
    }

    .catalog {
      padding: 20px clamp(18px, 4vw, 52px) 64px;
    }

    .catalog-head {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 20px;
      margin-bottom: 18px;
      border-top: 1px solid var(--line);
      padding-top: 24px;
    }

    .catalog-head h2 {
      margin: 0;
      font-size: clamp(26px, 4vw, 44px);
    }

    .catalog-head p {
      margin: 0;
      color: var(--muted);
      font-family: ui-sans-serif, system-ui, sans-serif;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }

    .product {
      border: 1px solid var(--line);
      background: var(--card);
      min-height: 360px;
      display: grid;
      grid-template-rows: 1fr auto;
    }

    .art {
      min-height: 220px;
      display: grid;
      place-items: center;
      background: linear-gradient(145deg, rgba(37,72,58,0.1), rgba(215,155,58,0.24));
      border-bottom: 1px solid var(--line);
    }

    .bottle, .box, .roll {
      width: 110px;
      height: 160px;
      border: 2px solid var(--ink);
      background: var(--paper);
      box-shadow: 8px 10px 0 rgba(29, 36, 31, 0.18);
    }

    .bottle {
      border-radius: 42px 42px 14px 14px;
      background: linear-gradient(180deg, #436f5b 0 35%, var(--card) 35% 100%);
    }

    .box {
      transform: rotate(-4deg);
      background: linear-gradient(135deg, var(--gold) 0 40%, var(--card) 40% 100%);
    }

    .roll {
      border-radius: 999px;
      width: 150px;
      background: repeating-linear-gradient(90deg, var(--card), var(--card) 14px, #e6dbc6 14px, #e6dbc6 28px);
    }

    .product-body {
      padding: 18px;
    }

    .product-title {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 14px;
      margin-bottom: 10px;
    }

    .product h3 {
      margin: 0;
      font-size: 22px;
    }

    .price {
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-weight: 800;
      color: var(--pine);
    }

    .product p {
      margin: 0 0 16px;
      color: var(--muted);
      font-family: ui-sans-serif, system-ui, sans-serif;
      line-height: 1.5;
    }

    .actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      border: 1px solid var(--ink);
      background: var(--ink);
      color: var(--paper);
      border-radius: 0;
      padding: 10px 12px;
      cursor: pointer;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-weight: 700;
    }

    .btn.secondary {
      background: transparent;
      color: var(--ink);
    }

    .checkout {
      margin-top: 18px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      border: 1px solid var(--ink);
      background: var(--pine);
      color: var(--paper);
      padding: 18px;
    }

    .checkout p {
      margin: 4px 0 0;
      color: rgba(247,243,234,0.72);
      font-family: ui-sans-serif, system-ui, sans-serif;
    }

    .checkout strong {
      font-family: ui-sans-serif, system-ui, sans-serif;
    }

    @media (max-width: 860px) {
      .hero { grid-template-columns: 1fr; }
      .grid { grid-template-columns: 1fr; }
      .catalog-head, .checkout { grid-template-columns: 1fr; align-items: start; }
      .nav a { display: none; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand"><span class="mark">N</span> Northline Supply Co.</div>
    <nav class="nav" aria-label="Store navigation">
      <a>Field kits</a>
      <a>Supplies</a>
      <a>Journal</a>
      <button class="cart-pill" type="button" data-cart>Cart <span data-cart-count>0</span></button>
    </nav>
  </header>

  <main>
    <section class="hero">
      <div>
        <h1>Hardwearing field goods for made-up expeditions.</h1>
        <p class="lede">This storefront is intentionally small. It exists to prove Sarge can collect ecommerce events from a real deployed site, through the hosted pixel, into the dashboard.</p>
      </div>
      <div class="hero-card" aria-label="Illustration of Northline Supply packaging">
        <div class="pack"></div>
        <div class="caption">Live demo: product views, add-to-cart, checkout, purchase, dataLayer/GTM, and Facebook Pixel debug events are sent to Sarge.</div>
      </div>
    </section>

    <section class="catalog">
      <div class="catalog-head">
        <div>
          <h2>Featured kit</h2>
          <p>Click around; every useful action emits a debug event.</p>
        </div>
        <button class="btn secondary" type="button" data-media-test>Fire Meta Pixel Test</button>
      </div>

      <div class="grid">
        ${productCard("field-flask", "Field Flask", "$42", "Vacuum-sealed and overbuilt for coffee that outlives bad decisions.", "bottle")}
        ${productCard("map-wax", "Map Wax", "$18", "Weatherproof your notes, receipts, and backup checkout plans.", "box")}
        ${productCard("canvas-roll", "Canvas Roll", "$64", "A compact carry roll for tools, cables, and questionable adapters.", "roll")}
      </div>

      <div class="checkout">
        <div>
          <strong data-checkout-summary>Cart is empty</strong>
          <p>Checkout is simulated so the demo can emit purchase events safely.</p>
        </div>
        <button class="btn" type="button" data-checkout>Simulate checkout</button>
      </div>
    </section>
  </main>

  <script>
    const products = {
      "field-flask": { id: "field-flask", name: "Field Flask", price: 42 },
      "map-wax": { id: "map-wax", name: "Map Wax", price: 18 },
      "canvas-roll": { id: "canvas-roll", name: "Canvas Roll", price: 64 }
    };
    const cart = [];
    const send = (name, properties) => window.sarge?.("track", name, properties);
    const pushDataLayer = (payload) => window.dataLayer.push({ demo: "northline-supply", ...payload });
    const trackGoogleEvent = (eventName, payload) => window.gtag("event", eventName, { demo: "northline-supply", ...payload });
    const trackMeta = (eventName, payload) => window.fbq("track", eventName, { demo: "northline-supply", ...payload });
    const updateCart = () => {
      const total = cart.reduce((sum, item) => sum + item.price, 0);
      document.querySelector("[data-cart-count]").textContent = String(cart.length);
      document.querySelector("[data-checkout-summary]").textContent = cart.length
        ? cart.length + " item" + (cart.length === 1 ? "" : "s") + " · $" + total
        : "Cart is empty";
    };

    window.setTimeout(() => {
      pushDataLayer({ event: "page_view", page_type: "collection", path: window.location.pathname });
      window.gtag("js", new Date());
      window.gtag("config", "G-SARGEDEMO", { page_path: window.location.pathname, send_page_view: true });
      window.fbq("init", window.SARGE_DEMO_META_PIXEL_ID);
      trackMeta("PageView", { page_type: "collection" });
    }, 250);

    document.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        const product = products[button.dataset.view];
        send("product.viewed", { product_id: product.id, product_name: product.name, price: product.price });
        pushDataLayer({ event: "view_item", ecommerce: { items: [{ item_id: product.id, item_name: product.name, price: product.price }] } });
        trackGoogleEvent("view_item", { currency: "USD", value: product.price, items: [{ item_id: product.id, item_name: product.name }] });
        trackMeta("ViewContent", { content_ids: [product.id], content_name: product.name, value: product.price, currency: "USD" });
      });
    });

    document.querySelectorAll("[data-add]").forEach((button) => {
      button.addEventListener("click", () => {
        const product = products[button.dataset.add];
        cart.push(product);
        updateCart();
        send("cart.added", { product_id: product.id, product_name: product.name, price: product.price, cart_size: cart.length });
        pushDataLayer({ event: "add_to_cart", ecommerce: { currency: "USD", value: product.price, items: [{ item_id: product.id, item_name: product.name, price: product.price }] } });
        trackGoogleEvent("add_to_cart", { currency: "USD", value: product.price, items: [{ item_id: product.id, item_name: product.name }] });
        trackMeta("AddToCart", { content_ids: [product.id], value: product.price, currency: "USD" });
      });
    });

    document.querySelector("[data-media-test]").addEventListener("click", () => {
      pushDataLayer({ event: "media_pixel_test", source: "manual-test-button" });
      trackGoogleEvent("media_pixel_test", { source: "manual-test-button", value: 123 });
      trackMeta("PurchaseDebug", { source: "manual-test-button", value: 123, currency: "USD" });
    });

    document.querySelector("[data-cart]").addEventListener("click", () => {
      send("cart.opened", { cart_size: cart.length });
      pushDataLayer({ event: "view_cart", cart_size: cart.length });
    });

    document.querySelector("[data-checkout]").addEventListener("click", () => {
      const total = cart.reduce((sum, item) => sum + item.price, 0);
      send("checkout.started", { cart_size: cart.length, value: total, currency: "USD" });
      pushDataLayer({ event: "begin_checkout", ecommerce: { currency: "USD", value: total, items: cart.map((item) => ({ item_id: item.id, item_name: item.name, price: item.price })) } });
      trackGoogleEvent("begin_checkout", { currency: "USD", value: total, items: cart.map((item) => ({ item_id: item.id, item_name: item.name })) });
      send("purchase.completed", {
        order_id: "demo-" + Date.now(),
        value: total,
        currency: "USD",
        item_count: cart.length,
        products: cart.map((item) => item.id)
      });
      pushDataLayer({ event: "purchase", ecommerce: { transaction_id: "demo-datalayer-" + Date.now(), currency: "USD", value: total } });
      trackGoogleEvent("purchase", { transaction_id: "demo-gtag-" + Date.now(), currency: "USD", value: total });
      trackMeta("Purchase", { value: total, currency: "USD" });
    });
  </script>
</body>
</html>`;

const productCard = (id: string, name: string, price: string, description: string, shape: string) => `
  <article class="product">
    <div class="art"><div class="${shape}" aria-hidden="true"></div></div>
    <div class="product-body">
      <div class="product-title">
        <h3>${name}</h3>
        <span class="price">${price}</span>
      </div>
      <p>${description}</p>
      <div class="actions">
        <button class="btn secondary" type="button" data-view="${id}">View</button>
        <button class="btn" type="button" data-add="${id}">Add to cart</button>
      </div>
    </div>
  </article>
`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
