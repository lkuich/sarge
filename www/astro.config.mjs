// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import clerk from '@clerk/astro';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

// Dark theme for Clerk's own widgets, expressed as serializable appearance
// variables (matches the app's .dark palette). We avoid `@clerk/themes`'s
// `baseTheme: dark` because the only stable release (Core 2) is incompatible
// with the Core 3 clerk-js that @clerk/astro ships, and the baseTheme object
// does not survive the server->client prop boundary.
const clerkDarkAppearance = {
  variables: {
    colorBackground: '#1b1a23',
    colorForeground: '#f4f3f1',
    colorPrimary: '#5571f0',
    colorPrimaryForeground: '#fafafa',
    colorInput: '#26252f',
    colorInputForeground: '#f4f3f1',
    colorMuted: '#26252f',
    colorMutedForeground: '#a7a6b3',
    colorBorder: 'rgba(255, 255, 255, 0.12)',
    colorRing: '#5571f0',
    colorNeutral: '#ffffff',
    colorDanger: '#e5484d',
  },
};

// https://astro.build/config
export default defineConfig({
  integrations: [clerk({ appearance: clerkDarkAppearance }), react()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  session: {
    driver: {
      entrypoint: 'unstorage/drivers/null',
    },
  },
  output: 'server',
});
