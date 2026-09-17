import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vendor, sizes, FILES, VERSION, BUDGET_GZ } from '../../../tools/vendor-maplibre.mjs';

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
});
