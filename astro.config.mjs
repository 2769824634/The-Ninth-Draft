// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages: https://2769824634.github.io/The-Ninth-Draft/
export default defineConfig({
  site: 'https://2769824634.github.io',
  base: '/The-Ninth-Draft',
  trailingSlash: 'always',
  vite: { build: { chunkSizeWarningLimit: 1200 } },
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
