import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, vi } from 'vitest';
// src/main.ts is the app's only importer of leaflet.markercluster and it patches
// L in place, so every test file needs the plugin loaded after Leaflet itself:
// it is a plain script that reads the `L` global Leaflet's module body sets.
import 'leaflet';
import 'leaflet.markercluster';

// happy-dom replaces the global URL with its own, which resolves a relative
// URL against the environment's window.location rather than the base passed
// in — `new URL('../index.html', import.meta.url)` silently became
// http://localhost:3000/index.html instead of a file:// path. Node's own
// url/path modules sidestep that.
const here = path.dirname(fileURLToPath(import.meta.url));
const body = readFileSync(path.join(here, '../src/shell.html'), 'utf8');
// applyPrefs() paints the two <meta name="theme-color"> of the real head, so
// they come along with the body; the head now lives in the layout.
const layout = readFileSync(path.join(here, '../src/layouts/Base.astro'), 'utf8');
const metas = (layout.match(/<meta name="theme-color"[^>]*>/g) || []).join('\n');

beforeEach(() => {
  // Every open* defers a focus, every sheet defers its exit and the boot
  // defers six reframes. On real timers those fire after the file's last test,
  // into a document happy-dom has already torn down. Fake timers park them;
  // a test that wants one runs it with vi.advanceTimersByTime(). Only the
  // timer functions are faked: Date, performance and requestAnimationFrame
  // stay the environment's own.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  document.head.innerHTML = metas;
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
  localStorage.clear();
  (window as any).performance.mark ??= () => {};
  (SVGElement.prototype as any).getBBox ??= () => ({ x: 0, y: 0, width: 100, height: 20 });
});

afterEach(() => {
  vi.useRealTimers();
});
