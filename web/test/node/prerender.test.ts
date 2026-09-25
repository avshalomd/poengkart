import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../../src/data';
import { SITE, fillShell, schoolHead } from '../../src/prerender';
import { esc, slug, schoolPath } from '../../src/helpers';
import { heroCells } from '../../src/templates';
import type { School } from '../../src/types';

const here = path.dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(path.join(here, '../../src/shell.html'), 'utf8');

describe('the build, with no DOM', () => {
  it('imports the templates and fills the shell for every school', () => {
    expect(typeof window).toBe('undefined');
    const data = loadDataset();
    expect(data.schools.length).toBeGreaterThan(50);        // the frozen slice in web/test/data, not an empty file
    for (const s of data.schools) {
      const html = fillShell(shell, s, data);
      expect(html).toContain('<aside id="side" class="open">');
      expect(html).toContain(`<h2>${esc(s.name)}</h2>`);
      expect(html.length).toBeGreaterThan(shell.length);
    }
  });
  it('every anchor still exists in the shell', () => {
    for (const a of ['<div class="photo" id="s-photo"></div>', '<div class="meta" id="s-meta"></div>', '<div class="notes" id="s-notes" hidden></div>',
                     '<div class="hero" id="s-hero"></div>', '<div class="mixwarn" id="s-mix" hidden></div>', '<div id="s-list"></div>', '<div id="src-note"></div>', '<aside id="side">'])
      expect(shell).toContain(a);
  });
  it('paths and heads are consistent', () => {
    const data = loadDataset();
    const s = data.schools[0];
    expect(schoolHead(s, data).canonical.endsWith(schoolPath(s))).toBe(true);
    expect(schoolPath(s)).toBe('/' + slug(s.fylke) + '/' + slug(s.name));
    // the share card is the school's own, at the school's own address
    expect(schoolHead(s, data).ogImage).toBe(SITE + '/og' + schoolPath(s) + '.png');
  });
  // 32 schools have one published year, and «(2025–2025)» reads as a range of
  // one — the span is a range only when there is a range.
  it('the description spans one year as one year', () => {
    const data = loadDataset();
    expect(schoolHead(school(data, 'Asker', 'Akershus'), data).description).toContain(' (2024–2026).');
    expect(schoolHead(school(data, 'Byåsen videregående skole', 'Trøndelag'), data).description).toContain(' (2025).');
  });
  // 19 cards show no snittgrense: their hero is the sheet's own label. The alt
  // text has to describe the card that exists, not the usual one.
  it('the card alt describes the card that exists', () => {
    const data = loadDataset();
    expect(schoolHead(school(data, 'Asker', 'Akershus'), data).ogImageAlt)
      .toBe('Poengkart-kort for Asker: snittgrense 2026 og utvikling år for år.');
    const s = school(data, 'Storsteigen videregående skole', 'Innlandet');
    const alt = schoolHead(s, data).ogImageAlt;     // sets the state heroCells reads
    const first = heroCells(s, null)[0];
    expect(alt).not.toContain('snittgrense');
    expect(alt).toBe(`Poengkart-kort for ${s.name}: ${first.v} (${first.l}).`);
    expect(alt).toContain(String(first.v));
  });
});

const school = (data: { schools: School[] }, name: string, fylke: string) =>
  data.schools.find(s => s.name === name && s.fylke === fylke)!;
