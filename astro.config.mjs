import { defineConfig } from 'astro/config';

// The site is static HTML plus one client script. Astro owns the build so a
// page per school can be prerendered from the dataset; it adds no runtime.
export default defineConfig({
  site: 'https://poengkart-no.vercel.app',
  srcDir: './web/src',
  publicDir: './web/public',
  outDir: './web/dist',
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',            // akershus/asker.html: vercel.json's cleanUrls serves it at /akershus/asker
    assets: 'assets',          // keeps the /assets/(.*) immutable rule in vercel.json
    inlineStylesheets: 'never' // the CSP allows inline styles, but nothing should depend on it
  },
  devToolbar: { enabled: false },
  server: ({ command }) => ({ port: command === 'dev' ? 8123 : 4173 }),
  // The source map is published on purpose: the repository is public and the
  // CARTO key is in the bundle either way, so the map hides nothing, and it
  // makes a production stack trace readable in devtools. It is fetched only
  // when devtools asks for it.
  vite: { build: { target: 'es2022', sourcemap: true } },
});
