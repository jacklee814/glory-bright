import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@tailwindcss/vite';
export default defineConfig({
  site: 'https://www.glory-bright.com.tw', base: '/', trailingSlash: 'always', integrations: [sitemap()],
  vite: { plugins: [tailwind()] }, build: { inlineStylesheets: 'auto' },
});
