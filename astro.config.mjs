import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import { VERSION as MAPLIBRE_VER } from './tools/vendor-maplibre.mjs';

// The rådgiver chat (api/radgiver.ts) runs only under `npm run dev` for now:
// this mounts it on the dev server, reading OPENROUTER_API_KEY and the
// optional RADGIVER_MODEL from .env.local. The static build never sees it.
function radgiverDev() {
  return {
    name: 'radgiver-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '');
      for (const k of ['OPENROUTER_API_KEY', 'RADGIVER_MODEL', 'RADGIVER_FALLBACK_MODEL']) if (env[k] !== undefined) process.env[k] ??= env[k];
      server.middlewares.use('/api/radgiver', async (req, res) => {
        const ac = new AbortController();
        res.on('close', () => { if (!res.writableEnded) ac.abort(); });
        try {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const request = new Request(`http://localhost${req.originalUrl || req.url}`, {
            method: req.method, headers, signal: ac.signal,
            body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
          });
          const mod = await server.ssrLoadModule('/api/radgiver.ts');
          const response = req.method === 'POST' ? await mod.POST(request)
            : new Response('{"error":"POST only"}', { status: 405 });
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          if (response.body) for await (const chunk of response.body) res.write(chunk);
          res.end();
        } catch (e) {
          console.error('[radgiver]', e);
          if (!res.headersSent) { res.statusCode = 500; res.setHeader('content-type', 'application/json'); }
          res.end('{"error":"server"}');
        }
      });
    },
  };
}

// The site is static HTML plus one client script. Astro owns the build so a
// page per school can be prerendered from the dataset; it adds no runtime.
export default defineConfig({
  site: 'https://poengkart.no',
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
  // PORT wins when a launcher assigns one (another worktree's dev server may
  // already hold 8123); the fixed ports stay the default for a bare `npm run dev`
  server: ({ command }) => ({ port: Number(process.env.PORT) || (command === 'dev' ? 8123 : 4173) }),
  // The source map is published on purpose: the repository is public and the
  // CARTO key is in the bundle either way, so the map hides nothing, and it
  // makes a production stack trace readable in devtools. It is fetched only
  // when devtools asks for it.
  vite: {
    plugins: [radgiverDev()],
    build: {
      target: 'es2022', sourcemap: true,
      // MapLibre is not bundled: the page imports /maplibre/<v>/maplibre-gl.mjs,
      // which imports its sibling shared module, and the worker (setWorkerUrl in
      // web/src/main.ts) imports that same URL — one download, served from the
      // HTTP cache the second time. tools/vendor-maplibre.mjs puts the files there.
      rollupOptions: {
        external: ['maplibre-gl'],
        output: { paths: { 'maplibre-gl': `/maplibre/${MAPLIBRE_VER}/maplibre-gl.mjs` } },
      },
    },
    define: { __MAPLIBRE_VER__: JSON.stringify(MAPLIBRE_VER) },
  },
});
