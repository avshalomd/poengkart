import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* The inline icons in the shell, read as text. Several of them are drawn twice
   — the calculator stands in the points row and again at the head of the sheet
   it opens, the app's own mark in the panel and again at the head of the help
   sheet — and a copy is a place a copy can drift. One did: the calculator's
   sheet head carried `M16 15.5h4.01` where its twin in the points row has
   `M16 15.5h.01`, so the bottom-right key of that calculator was drawn as a
   4-unit bar through the casing's right wall instead of a dot. One character,
   and nothing in the app could see it.

   A rendering test cannot: the stray bar is inside the viewBox, so the artwork
   still measures as centred. What catches it is that the icon has a twin and
   the twin disagrees. */
const shell = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/shell.html'),
  'utf8',
);

/** An icon's drawing, with the formatting of the file taken out of it. */
function bodies(): { body: string; head: string }[] {
  return [...shell.matchAll(/<svg\b[^>]*>([\s\S]*?)<\/svg>/g)].map(m => ({
    body: m[1].replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim(),
    // the markup just before the icon — the button or head it belongs to, so a
    // failure names the two places rather than printing two path strings
    head: (shell.slice(0, m.index!).split('\n').map(l => l.trim()).filter(Boolean).pop() ?? '?').slice(-90),
  }));
}

/** Levenshtein distance, stopped once it passes `cap` — the strings are short
 *  and the corpus is under twenty icons, so the naive matrix is plenty. */
function distance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length];
}

describe('shell.html icons', () => {
  it('draws an icon that appears twice the same way both times', () => {
    const icons = bodies();
    expect(icons.length, 'no inline icons found — has the shell been restructured?').toBeGreaterThan(10);
    const drift: string[] = [];
    for (let i = 0; i < icons.length; i++)
      for (let j = i + 1; j < icons.length; j++) {
        const d = distance(icons[i].body, icons[j].body, 3);
        // three edits apart is the same icon with a typo in it, never two icons
        if (d > 0 && d <= 3) drift.push(`${icons[i].head}\n  ≠ ${icons[j].head}\n  (${d} character(s) apart)`);
      }
    expect(drift, 'two copies of one icon disagree').toEqual([]);
  });
});
