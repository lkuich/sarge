import { pixelScript } from "./generated-pixel.js";
import type { SiteRecord } from "./types.js";

interface PixelResponseOptions {
  download?: boolean;
}

export const createPixelResponse = (
  site: SiteRecord,
  endpointHost = site.endpointHost,
  options: PixelResponseOptions = {}
) => {
  const config = {
    siteId: site.id,
    endpoint: `https://${endpointHost}`,
    attributionTtlDays: site.attributionTtlDays
  };

  const body = [
    `window.__SARGE_CONFIG__=${JSON.stringify(config)};`,
    pixelScript,
    '//# sourceURL=sarge-pixel.js'
  ].join("\n");

  const headers = new Headers({
    "cache-control": "public, max-age=300",
    "content-type": "application/javascript; charset=utf-8"
  });

  if (options.download) {
    headers.set("content-disposition", 'attachment; filename="sarge-pixel.min.js"');
  }

  return new Response(body, {
    headers
  });
};
