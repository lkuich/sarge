export type SitemapRoute = {
  path: string;
};

export const canonicalSiteUrl = "https://sargetrack.app";

export const publicSitemapRoutes: SitemapRoute[] = [
  { path: "/" },
  { path: "/docs" },
  { path: "/docs/install" },
  { path: "/docs/events" },
  { path: "/legal/privacy" },
  { path: "/legal/terms" },
  { path: "/sign-in" },
  { path: "/sign-up" },
];

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const buildSitemapXml = (siteUrl: string, routes: SitemapRoute[]) => {
  const baseUrl = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  const urls = routes
    .map(({ path }) => {
      const loc = new URL(path, baseUrl).href.replace(/\/$/, "");

      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>`;
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
};
