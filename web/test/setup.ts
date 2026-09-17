// astro.config.mjs defines this global from the version the build vendored;
// vitest does not run that config, and main.ts reads it at import time.
(globalThis as any).__MAPLIBRE_VER__ = '0.0.0-test';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, vi } from 'vitest';

// The map is MapLibre GL (WebGL2), which no DOM emulation can run. The mock
// hands map.ts the stub below wherever it constructs a map; LngLatBounds is
// pure arithmetic, so the real one is fine — but it lives in the same module,
// so a tiny one is defined here.
vi.mock('maplibre-gl', async () => {
  const { stubMap } = await import('./mapstub');
  class LngLatBounds {
    _sw: [number, number]; _ne: [number, number];
    constructor(sw: [number, number], ne: [number, number]) { this._sw = [...sw]; this._ne = [...ne]; }
    extend(p: [number, number]) {
      this._sw = [Math.min(this._sw[0], p[0]), Math.min(this._sw[1], p[1])];
      this._ne = [Math.max(this._ne[0], p[0]), Math.max(this._ne[1], p[1])];
      return this;
    }
    getWest() { return this._sw[0]; } getSouth() { return this._sw[1]; }
    getEast() { return this._ne[0]; } getNorth() { return this._ne[1]; }
    toArray() { return [this._sw, this._ne]; }
  }
  // a still map (the minimap) is not the app's map: it leaves S.map alone.
  // setStyle records the style the map was built with, as getStyle reports it.
  class Map { constructor(opts: any) { return stubMap(opts.container, opts.interactive === false).setStyle(opts.style); } }
  return { Map, LngLatBounds, setWorkerUrl: () => {}, default: { Map, LngLatBounds } };
});

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
