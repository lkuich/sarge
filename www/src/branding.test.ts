import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const readSource = (path: string) => readFileSync(sourcePath(path), "utf8");

describe("Sarge branding", () => {
  it("keeps the progression stripe bars on one consistent angle", () => {
    const logo = readSource("./components/Logo.astro");
    const progressionBlock = logo.match(/progression:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    const paths = Array.from(progressionBlock.matchAll(/"([^"]+)"/g), (match) => match[1]);

    expect(paths).toHaveLength(3);

    const slopes = paths.map((path) => {
      const match = path.match(/^M([\d.]+) ([\d.]+)h([\d.]+)L([\d.]+) ([\d.]+)H([\d.]+)(?:L[\d.]+ [\d.]+)?Z$/);
      expect(match, path).not.toBeNull();

      const [, startX, startY, width, topRightX, topY] = match!.map(Number);
      return Number(((topRightX - (startX + width)) / (startY - topY)).toFixed(3));
    });

    expect(new Set(slopes)).toEqual(new Set([0.4]));
  });

  it("ships a reusable stripe logo component with the requested comparison variants", () => {
    expect(existsSync(sourcePath("./components/Logo.astro"))).toBe(true);

    const logo = readSource("./components/Logo.astro");

    expect(logo).toContain("Sarge");
    expect(logo).toContain('"pure"');
    expect(logo).toContain('"progression"');
    expect(logo).toContain('"tactical"');
    expect(logo).toContain('"hidden-s"');
    expect(logo).toContain("export const logoVariants");
    expect(logo).toContain("currentColor");
    expect(logo).not.toContain("linearGradient");
  });

  it("uses the reusable logo in public and app navigation", () => {
    const siteLayout = readSource("./layouts/SiteLayout.astro");
    const appLayout = readSource("./layouts/AppLayout.astro");
    const home = readSource("./pages/index.astro");

    expect(siteLayout).toContain('import Logo from "@/components/Logo.astro"');
    expect(siteLayout).toContain("<Logo");
    expect(siteLayout).not.toContain("/sarge-logo-light.svg");
    expect(siteLayout).not.toContain("/sarge-logo-dark.svg");

    expect(appLayout).toContain('import Logo from "@/components/Logo.astro"');
    expect(appLayout).toContain("<Logo");
    expect(appLayout).not.toContain("/sarge-logo-light.svg");
    expect(appLayout).not.toContain("/sarge-logo-dark.svg");

    expect(home).toContain('import Logo from "@/components/Logo.astro"');
    expect(home).toContain("<Logo");
    expect(home).not.toContain("/sarge-logo-light.svg");
    expect(home).not.toContain("/sarge-logo-dark.svg");
  });

  it("exports monochrome SVG assets for email and favicon use", () => {
    const favicon = readSource("../public/favicon.svg");
    const darkLogo = readSource("../public/sarge-logo-dark.svg");
    const lightLogo = readSource("../public/sarge-logo-light.svg");

    expect(favicon).toContain("Sarge stripe mark");
    expect(favicon).toContain("currentColor");
    expect(favicon).not.toContain("linearGradient");
    expect(favicon).not.toContain("#497ef7");

    expect(darkLogo).toContain("Sarge");
    expect(lightLogo).toContain("Sarge");
    expect(darkLogo).not.toContain("linearGradient");
    expect(lightLogo).not.toContain("linearGradient");
  });
});
