import type { APIRoute } from "astro";

import { buildSitemapXml, canonicalSiteUrl, publicSitemapRoutes } from "@/lib/sitemap";

export const GET: APIRoute = () =>
  new Response(buildSitemapXml(canonicalSiteUrl, publicSitemapRoutes), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
