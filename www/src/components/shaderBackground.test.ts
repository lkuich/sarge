import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("shaderBackground", () => {
  function readProjectFile(path: string) {
    return readFileSync(join(process.cwd(), path), "utf8");
  }

  it("uses the supported shader package instead of the local WebGL fallback", () => {
    const component = readProjectFile("src/components/shaderBackground.tsx");
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      dependencies?: Record<string, string>;
    };

    expect(component).toContain('from "shaders/react"');
    expect(component).toContain("<Shader");
    expect(component).not.toContain("getContext(\"webgl\"");
    expect(packageJson.dependencies?.shaders).toBeDefined();
  });

  it("keeps the shader island scoped to the homepage", () => {
    const layout = readProjectFile("src/layouts/SiteLayout.astro");
    const homepage = readProjectFile("src/pages/index.astro");
    const sitePages = [
      "src/pages/docs/index.astro",
      "src/pages/docs/events.astro",
      "src/pages/sign-in.astro",
      "src/pages/sign-up.astro",
      "src/pages/verify/[siteId].astro",
    ].map((path) => readProjectFile(path));

    expect(layout).toContain("shader?: boolean");
    expect(layout).toContain("showThemeToggle?: boolean");
    expect(layout).toContain('"site-shell": shader');
    expect(layout).toContain('<slot name="background" />');
    expect(layout).toContain(">BETA<");
    expect(layout).toContain('data-site-account-profile');
    expect(layout).toContain('aria-label="Account profile"');
    expect(layout).not.toContain("shaderBackground");
    expect(homepage).toContain('import ShaderEffect from "@/components/shaderBackground"');
    expect(homepage).toContain("<SiteLayout");
    expect(homepage).toContain("shader");
    expect(homepage).toContain("showThemeToggle={false}");
    expect(homepage).toContain('slot="background"');
    expect(homepage).toContain('<ShaderEffect client:only="react" />');
    expect(sitePages).toEqual(sitePages.map((source) => expect.not.stringContaining("shader>")));
    expect(sitePages).toEqual(sitePages.map((source) => expect.not.stringContaining("ShaderEffect")));
  });
});
