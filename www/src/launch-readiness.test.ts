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
});
