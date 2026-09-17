import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* The stylesheet read as text. Two rules the cascade enforces silently — an
   undefined custom property and a rule that loses on specificity both look
   exactly like working CSS in the file. */
const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const css = readFileSync(path.join(src, 'styles/app.css'), 'utf8');

describe('app.css', () => {
  it('reads no custom property that nothing anywhere defines', () => {
    // `font: 600 18px/1 var(--font, inherit)` shipped once. --font is defined
    // nowhere, so the fallback stood — and `inherit` is a CSS-wide keyword,
    // which inside a shorthand makes the whole declaration invalid at
    // computed-value time: the zoom glyphs quietly fell back to 14px/400.
    const declared = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
    // the app writes the rest itself: style.setProperty('--ctrl-lift', …) and
    // the inline style="--photo-pos:…" the templates carry
    let app = readFileSync(path.join(src, 'layouts/Base.astro'), 'utf8');
    for (const f of readdirSync(src)) if (f.endsWith('.ts')) app += readFileSync(path.join(src, f), 'utf8');
    const written = new Set([...app.matchAll(/(--[\w-]+)\s*(?::|['"`]\s*,)/g)].map(m => m[1]));
    const used = [...new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1]))];
    expect(used.filter(v => !declared.has(v) && !written.has(v))).toEqual([]);
  });

  it('zeroes the zoom capsule’s last border with a rule that can win', () => {
    // `.pk-zoom-out { border-bottom: 0 }` (0,1,0) lost to
    // `.maplibregl-ctrl-group button.pk-zoom { border-bottom: 1px solid … }`
    // (0,2,1), and a hairline stayed across the capsule's rounded bottom
    const rule = css.match(/([^{}]*\.pk-zoom-out[^{}]*)\{([^}]*border-bottom:\s*0[^}]*)\}/);
    expect(rule, 'nothing zeroes the last zoom button’s bottom border').toBeTruthy();
    expect(rule![1]).toContain('.maplibregl-ctrl-group button.pk-zoom-out');
  });

  it('says with the pointer that a dot and a cluster are both buttons', () => {
    // Leaflet gave both of them `cursor: pointer` through .leaflet-interactive;
    // the pane's own elements inherit nothing, and the cluster stood under an
    // arrow cursor while the dot beside it had a hand
    for (const sel of ['.pk-dot', '.pk-cluster']) {
      const rule = css.match(new RegExp(`\\n\\s*\\${sel}\\s*\\{([^}]*)\\}`));
      expect(rule, `${sel} has no rule of its own`).toBeTruthy();
      expect(rule![1], sel).toMatch(/cursor:\s*pointer/);
    }
  });

  it('gives the map’s own buttons the accent focus ring, not the engine’s blue glow', () => {
    // maplibre-gl.css sets `outline: none` on `.maplibregl-ctrl-group button`
    // (0,1,1), which beats the app's bare `:focus-visible` (0,1,0), and paints
    // `box-shadow: 0 0 2px 2px #0096ff` on `:focus` and again on
    // `:focus:focus-visible` (0,3,1) — which a plain `:focus` rule cannot undo
    const ring = css.match(/\.maplibregl-ctrl-group button:focus-visible\s*\{([^}]*)\}/);
    expect(ring, 'nothing gives the map’s buttons the accent ring').toBeTruthy();
    expect(ring![1]).toContain('outline: 2px solid var(--accent)');
    const glow = css.match(/([^{}]*button:focus:focus-visible[^{}]*)\{([^}]*)\}/);
    expect(glow, 'the engine’s blue focus glow is never zeroed').toBeTruthy();
    expect(glow![1]).toContain('.maplibregl-ctrl-group');
    expect(glow![2]).toMatch(/box-shadow:\s*none/);
  });
});
