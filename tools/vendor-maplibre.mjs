// Copies MapLibre's three runtime modules into web/public/maplibre/<version>/
// so the page and its worker load them from our origin and share one download
// of the shared module (stage-4 spec, "Payload"). npm runs it before `dev` and
// `build`; `--check` prints the gzipped sizes and fails above the budget.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'node_modules/maplibre-gl/dist');
export const VERSION = JSON.parse(readFileSync(path.join(root, 'node_modules/maplibre-gl/package.json'), 'utf8')).version;
export const FILES = ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs'];
// main 149 KB + shared 147 KB + worker 6 KB gzipped at 6.10.0; the CSS (11 KB)
// is bundled with the app's stylesheet and supercluster (3 KB) with its script
export const BUDGET_GZ = 320 * 1024;

export function vendor(dest = path.join(root, 'web/public/maplibre', VERSION)) {
  mkdirSync(dest, { recursive: true });
  for (const f of FILES) copyFileSync(path.join(dist, f), path.join(dest, f));
  return dest;
}
export function sizes(dir) {
  return Object.fromEntries(FILES.map(f => [f, gzipSync(readFileSync(path.join(dir, f))).length]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dest = vendor();
  const gz = sizes(dest), total = Object.values(gz).reduce((a, b) => a + b, 0);
  if (process.argv.includes('--check')) {
    for (const [f, n] of Object.entries(gz)) console.log(`${String(n).padStart(8)}  ${f}`);
    console.log(`${String(total).padStart(8)}  total gzipped (budget ${BUDGET_GZ})`);
    if (total > BUDGET_GZ) { console.error('over budget'); process.exit(1); }
  } else {
    console.log(`maplibre-gl ${VERSION} → ${path.relative(root, dest)} (${Math.round(total / 1024)} KB gz)`);
  }
}
