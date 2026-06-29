import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string) => readFileSync(join(process.cwd(), "..", path), "utf8");
const readWwwFile = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("launch readiness safeguards", () => {
  it("keeps public install guidance on environment ids and temporary verification keys", () => {
    const installPanel = readWwwFile("src/components/InstallPanel.tsx");
    const llms = readWwwFile("public/llms.txt");
    const llmsFull = readWwwFile("public/llms-full.txt");
    const demoShop = readProjectFile("apps/demo-shop/src/index.ts");
    const demoShopReadme = readProjectFile("apps/demo-shop/README.md");
    const trackingGuide = readProjectFile("docs/TRACKING_CLIENT.md");

    for (const source of [installPanel, llms, llmsFull, demoShop, demoShopReadme, trackingGuide]) {
      expect(source).not.toContain("?site=");
      expect(source).not.toContain("site_XXXXX");
      expect(source).not.toContain("white-dawn-6379.fly.dev");
    }

    expect(installPanel).toContain("pixel.js?env=XXXXX");
    expect(installPanel).toContain("/verify/{siteEnvironmentId}?key={temporaryVerificationKey}");
    expect(llms).toContain("temporary verification key");
    expect(llmsFull).toContain("pixel.js?env={siteEnvironmentId}");
    expect(demoShop).toContain("pixel.js?env=env_demo_production");
  });

  it("publishes a human-facing hosted install reference from the docs index", () => {
    const docsIndex = readWwwFile("src/pages/docs/index.astro");
    const hostedInstall = readWwwFile("src/pages/docs/install.astro");

    expect(docsIndex).toContain('href: "/docs/install"');
    expect(docsIndex).not.toContain('href: "/#setup"');

    for (const expected of [
      "Hosted pixel snippet",
      "window._sarge",
      "pixel.js?env={siteEnvironmentId}",
      "Track ecommerce events",
      "Watch other pixels",
      "sarge_ref",
      "sarge_aff",
      "Latent conversions",
      "affiliate.conversion",
      "Server-side and postback events",
      "Verify installation",
    ]) {
      expect(hostedInstall).toContain(expected);
    }
  });

  it("keeps the hosted install reference constrained on mobile", () => {
    const hostedInstall = readWwwFile("src/pages/docs/install.astro");

    expect(hostedInstall).toContain("lg:grid-cols-[minmax(0,1fr)_340px]");
    expect(hostedInstall).toContain('<div class="grid min-w-0 gap-4">');
    expect(hostedInstall).toContain('<aside class="grid min-w-0 content-start gap-4">');
    expect(hostedInstall.match(/max-w-full overflow-x-auto/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });

  it("keeps public header auth controls from wrapping on mobile", () => {
    const siteLayout = readWwwFile("src/layouts/SiteLayout.astro");

    expect(siteLayout).toContain("h-8 w-auto sm:h-9");
    expect(siteLayout).toContain("hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground sm:inline-flex");
    expect(siteLayout).toContain("whitespace-nowrap rounded-md bg-primary");
  });

  it("defines baseline security headers for the public site and Worker responses", () => {
    const securityHeaders = readWwwFile("src/lib/security-headers.ts");
    const middleware = readWwwFile("src/middleware.ts");
    const worker = readProjectFile("apps/worker/src/index.ts");
    const pixelResponse = readProjectFile("apps/worker/src/pixel-response.ts");

    for (const header of [
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]) {
      expect(securityHeaders).toContain(header);
      expect(worker + pixelResponse).toContain(header);
    }

    expect(middleware).toContain("applySecurityHeaders");
  });

  it("allows Clerk's production proxy host through the content security policy", () => {
    const securityHeaders = readWwwFile("src/lib/security-headers.ts");

    expect(securityHeaders).toContain("https://clerk.sargetrack.app");
  });
});
