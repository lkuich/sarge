import { pixelScript } from "./generated-pixel.js";
import type { SiteRecord } from "./types.js";

export const createPixelResponse = (site: SiteRecord) => {
  const config = {
    siteId: site.id,
    endpoint: `https://${site.endpointHost}`,
    attributionTtlDays: site.attributionTtlDays
  };

  const body = [
    `window.__SARGE_CONFIG__=${JSON.stringify(config)};`,
    pixelScript,
    '//# sourceURL=sarge-pixel.js'
  ].join("\n");

  return new Response(body, {
    headers: {
      "cache-control": "public, max-age=300",
      "content-type": "application/javascript; charset=utf-8"
    }
  });
};
