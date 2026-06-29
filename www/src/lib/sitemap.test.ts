import { describe, expect, it } from "vitest";

import { buildSitemapXml, publicSitemapRoutes } from "./sitemap";

describe("sitemap", () => {
  it("publishes the canonical public routes as sitemap XML", () => {
    const xml = buildSitemapXml("https://sargetrack.app", publicSitemapRoutes);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

    for (const route of [
      "/",
      "/docs",
      "/docs/install",
      "/docs/events",
      "/legal/privacy",
      "/legal/terms",
      "/sign-in",
      "/sign-up",
    ]) {
      expect(xml).toContain(`<loc>https://sargetrack.app${route === "/" ? "" : route}</loc>`);
    }

    expect(xml).not.toContain("/app");
    expect(xml).not.toContain("/api");
    expect(xml).not.toContain("/verify/");
  });

  it("escapes XML-sensitive characters in URLs", () => {
    const xml = buildSitemapXml("https://example.com", [{ path: "/docs?a=1&b=2" }]);

    expect(xml).toContain("<loc>https://example.com/docs?a=1&amp;b=2</loc>");
  });
});
