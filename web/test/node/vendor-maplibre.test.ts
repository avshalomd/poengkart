import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vendor, sizes, FILES, VERSION, BUDGET_GZ } from '../../../tools/vendor-maplibre.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('vendoring MapLibre', () => {
  it('copies the three runtime modules under a versioned folder and stays within the payload budget', () => {
    const dest = vendor(mkdtempSync(path.join(tmpdir(), 'ml-')));
    expect(/^\d+\.\d+\.\d+$/.test(VERSION)).toBe(true);
    for (const f of FILES) {
      expect(existsSync(path.join(dest, f)), f).toBe(true);
      expect(statSync(path.join(dest, f)).size).toBeGreaterThan(1000);
    }
    const gz = sizes(dest);
    const total = Object.values(gz).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(BUDGET_GZ);
    // the worker's own file is small: the heavy code is the shared module it imports
    expect(gz['maplibre-gl-worker.mjs']).toBeLessThan(20 * 1024);
  });

  it('the layout preloads both page modules, at the version it vendored', () => {
    // Astro preloads the chunks it bundled, but MapLibre is external: without
    // these links the app chunk asks for maplibre-gl.mjs only once it has
    // parsed, and that module then asks for the shared one — a serial chain.
    const layout = readFileSync(path.join(root, 'web/src/layouts/Base.astro'), 'utf8');
    // the version is never typed out: astro.config.mjs defines it from this
    // module's VERSION, so a bump moves the vendored files and the two links
    // together (an import of this module here would be bundled into the
    // prerender entry and look for node_modules beside itself)
    expect(layout).toContain('const MAPLIBRE_VER = __MAPLIBRE_VER__;');
    expect(readFileSync(path.join(root, 'astro.config.mjs'), 'utf8'))
      .toMatch(/__MAPLIBRE_VER__:\s*JSON\.stringify\(MAPLIBRE_VER\)/);
    for (const f of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs']) {
      expect(layout, f).toContain(`<link rel="modulepreload" href={\`/maplibre/\${MAPLIBRE_VER}/${f}\`}>`);
    }
  });
});
