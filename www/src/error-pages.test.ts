import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const readSource = (path: string) => readFileSync(sourcePath(path), "utf8");

describe("branded error pages", () => {
  it("ships a Sarge-specific 404 page with recovery actions", () => {
    expect(existsSync(sourcePath("./pages/404.astro"))).toBe(true);

    const page = readSource("./pages/404.astro");

    expect(page).toContain('title="Sarge | Page not found"');
    expect(page).toContain("Route missing");
    expect(page).toContain("Sarge could not find that route");
    expect(page).toContain("error-status-panel");
    expect(page).toContain('href: "/"');
    expect(page).toContain('href: "/docs"');
  });

  it("ships a Sarge-specific 500 page with status-aware recovery actions", () => {
    expect(existsSync(sourcePath("./pages/500.astro"))).toBe(true);

    const page = readSource("./pages/500.astro");

    expect(page).toContain('title="Sarge | Server error"');
    expect(page).toContain("Internal signal lost");
    expect(page).toContain("Sarge hit an unexpected fault");
    expect(page).toContain("error-status-panel");
    expect(page).toContain('href: "/app"');
    expect(page).toContain('href: "mailto:hello@sargetrack.app?subject=Sarge%20site%20error"');
  });
});
