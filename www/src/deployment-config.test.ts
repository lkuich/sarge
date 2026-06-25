import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Cloudflare WWW deployment config", () => {
  it("deploys and updates secrets with Astro's generated Wrangler config", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const workflow = readFileSync("../.github/workflows/cloudflare-www.yml", "utf8");
    const wranglerConfig = readFileSync("wrangler.jsonc", "utf8");

    expect(packageJson.scripts.deploy).toContain("--config dist/server/wrangler.json");
    expect(workflow).toContain("uses: pnpm/action-setup@v4");
    expect(workflow).toContain("cache: pnpm");
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).not.toContain("npm ci");
    expect(workflow).toContain("pnpm exec wrangler deploy --config dist/server/wrangler.json --keep-vars");
    expect(workflow).toContain("pnpm exec wrangler secret put DATABASE_URL --config dist/server/wrangler.json");
    expect(wranglerConfig).toContain('"directory": "./dist/client"');
  });
});
