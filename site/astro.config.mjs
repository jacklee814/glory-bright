import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@tailwindcss/vite';
export default defineConfig({
  site: 'https://jacklee814.github.io', base: '/glory-bright/', trailingSlash: 'always', integrations: [sitemap()],
  vite: { plugins: [tailwind()] }, build: { inlineStylesheets: 'auto' },
});
