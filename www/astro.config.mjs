// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import clerk from '@clerk/astro';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  integrations: [clerk(), react()],
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
