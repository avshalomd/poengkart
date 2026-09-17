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
});
