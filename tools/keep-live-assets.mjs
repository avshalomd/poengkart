// Carries the live site's hashed files into a production build, so the pages
// it replaces keep working while the new deployment takes over.
//
// For a few seconds after a deploy a reader can be given the previous
// deployment's HTML while its /assets/ requests already reach the new one,
// which never had the old hashed names: the stylesheet answered 404 and the
// page came up unstyled (seen 30 Sept 2026, Plane POENG-65). Copying the files
// that poengkart.no serves at build time into web/dist closes that window.
// Only the one generation that is live is carried; the next build drops it.
//
// npm runs it after `build`. It does anything only on a Vercel production
// build (VERCEL_ENV=production) or with --force, and it never fails a build:
// the worst case is the window above, which is what we had before.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(root, 'web/dist');
const SITE = 'https://poengkart.no';
// every page is built on the same layout; the school page is there in case
// that ever stops being true
const PAGES = ['/', '/akershus/asker', '/404'];
const MAX_FILES = 40;

// the site's own immutable paths a file can name: absolute (/assets/Base.x.css,
// /maplibre/6.10.0/maplibre-gl.mjs, /fonts/x.woff2) or, inside a module, a
// sibling import (./maplibre-gl-shared.mjs). Source maps are left behind: only
// devtools asks for them.
const ABS = /\/(?:assets|maplibre|fonts)\/[A-Za-z0-9_.\/-]+\.(?:css|m?js|woff2)(?![\w.])/g;
const REL = /["'](\.\/[A-Za-z0-9_.-]+\.m?js)["']/g;
export function refs(text, from = '/') {
  const out = new Set(text.match(ABS) || []);
  const dir = from.slice(0, from.lastIndexOf('/') + 1);
  for (const [, rel] of text.matchAll(REL)) out.add(path.posix.normalize(dir + rel.slice(2)));
  return [...out].filter(p => !p.includes('..') && !p.includes('//'));
}

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function carry(site = SITE, dist = DIST, log = console.log) {
  const queue = [];
  for (const p of PAGES) {
    try { queue.push(...refs((await get(site + p)).toString('utf8'))); }
    catch (e) { log(`keep-live-assets: ${p}: ${e.message}`); }
  }
  const seen = new Set(), carried = [];
  while (queue.length && seen.size < MAX_FILES) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    const dest = path.join(dist, p);
    if (existsSync(dest)) continue;          // this build has it: same hash, same bytes
    try {
      const body = await get(site + p);
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, body);
      carried.push(p);
      if (/\.(css|m?js)$/.test(p)) queue.push(...refs(body.toString('utf8'), p));
    } catch (e) { log(`keep-live-assets: ${p}: ${e.message}`); }
  }
  log(carried.length ? `keep-live-assets: carried ${carried.length} file(s) from ${site}: ${carried.join(', ')}`
                     : `keep-live-assets: nothing to carry from ${site}`);
  return carried;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.VERCEL_ENV === 'production' || process.argv.includes('--force')) {
    await carry().catch(e => console.log(`keep-live-assets: ${e.message}`));
  }
}
