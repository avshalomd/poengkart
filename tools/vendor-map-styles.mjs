// Pins CARTO's Voyager GL (light) and Dark Matter GL (dark) styles under
// web/public/map/ so the map's look cannot change under the page (stage-4
// spec, decision 3). Tiles, fonts and sprites stay on CARTO. The TileJSON the
// style points at is inlined with our key on every tile template — CARTO's
// style does not carry the key through, and the key is what its fair-use
// count is kept against. Re-run to take a newer CARTO style:
//   node tools/vendor-map-styles.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// CARTO basemap key, requested for poengkart's domains 27.08.2026. It is
// public by design: it ships in every tile URL the browser requests.
const KEY = 'cb1_2bsv_1_23dae695a38f70885d3b4f7b';
const STYLES = { voyager: 'voyager-gl-style', 'dark-matter': 'dark-matter-gl-style' };
export const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const styleUrl = name => `https://basemaps.cartocdn.com/gl/${name}/style.json?key=${KEY}`;

export function pinStyle(style, tilejson, key) {
  const out = structuredClone(style);
  for (const src of Object.values(out.sources)) {
    if (src.type !== 'vector' || !src.url) continue;
    delete src.url;
    src.tiles = tilejson.tiles.map(u => u + (u.includes('?') ? '&' : '?') + 'key=' + key);
    if (tilejson.minzoom !== undefined) src.minzoom = tilejson.minzoom;
    if (tilejson.maxzoom !== undefined) src.maxzoom = tilejson.maxzoom;
    src.attribution = ATTRIBUTION;
  }
  return out;
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../web/public/map');
  mkdirSync(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];
  for (const [file, name] of Object.entries(STYLES)) {
    const style = await getJson(styleUrl(name));
    const src = Object.values(style.sources).find(s => s.type === 'vector' && s.url);
    const tilejson = await getJson(src.url);
    writeFileSync(path.join(dir, `${file}.json`), JSON.stringify(pinStyle(style, tilejson, KEY), null, 1) + '\n');
    lines.push(`- \`${file}.json\` ← \`https://basemaps.cartocdn.com/gl/${name}/style.json\` (${style.layers.length} layers), tiles from \`${src.url}\``);
    console.log(`${file}.json: ${style.layers.length} layers, ${tilejson.tiles.length} tile hosts`);
  }
  writeFileSync(path.join(dir, 'README.md'), `# Pinned CARTO basemap styles

Written by \`tools/vendor-map-styles.mjs\` on ${today}. Do not edit by hand; re-run the
script to take a newer CARTO style, and commit the result.

${lines.join('\n')}

Edits the script makes to CARTO's file: the vector source's TileJSON \`url\` is replaced
by its \`tiles\`, \`minzoom\` and \`maxzoom\` with our key appended to every template, and its
\`attribution\` is set to the app's credit line. Fonts (\`glyphs\`) and the \`sprite\` stay on CARTO.

Terms (checked 17 September 2026): CARTO basemaps are free with a key up to 5 million tile
requests per calendar month, commercial use included; CARTO and OpenStreetMap must stay
credited on the map. https://docs.carto.com/faqs/carto-basemaps
`);
}
