import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../../src/data';
import { SITE, countiesByName, countyHead, countyView, fillShell, homeHead, schoolHead } from '../../src/prerender';
import { esc, slug, schoolPath } from '../../src/helpers';
import { heroCells, recordHtml } from '../../src/templates';
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
                     '<div class="hero" id="s-hero"></div>', '<div class="mixwarn" id="s-mix" hidden></div>', '<div id="s-list"></div>', '<div id="s-record"></div>', '<div id="src-note"></div>', '<aside id="side">'])
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

describe('what a crawler that runs no script reads', () => {
  const ld = (json: string | undefined) => JSON.parse(json!)['@graph'];
  it("a school's page carries every published year of every programme", () => {
    const data = loadDataset();
    const s = school(data, 'Asker', 'Akershus');
    const html = fillShell(shell, s, data);
    expect(html).toContain(recordHtml(s));
    for (const p of s.programs) for (const y of Object.keys(p.values)) expect(recordHtml(s)).toContain(`${y}: `);
    // the county is a link to the county's page
    expect(html).toContain('<a href="/akershus">Akershus</a>');
  });
  it('the heads carry JSON-LD that parses, with no raw «<»', () => {
    const data = loadDataset();
    const home = homeHead(data);
    expect(ld(home.jsonLd).map(n => n['@type'])).toEqual(['WebSite', 'Dataset']);
    const s = school(data, 'Asker', 'Akershus');
    const g = ld(schoolHead(s, data).jsonLd);
    expect(g[0].itemListElement.map(i => i.item)).toEqual([SITE + '/', SITE + '/akershus', SITE + '/akershus/asker']);
    expect(g[1]['@type']).toBe('HighSchool');
    for (const c of countiesByName(data)) expect(countyHead(countyView(c, data)).jsonLd).not.toContain('<');
  });
  it("a county's page lists every school in it, each with its own link", () => {
    const data = loadDataset();
    for (const c of countiesByName(data)) {
      const v = countyView(c, data);
      expect(v.path).toBe('/' + slug(c.fylke));
      expect(v.schools.map(x => x.school.name).sort()).toEqual(data.schools.filter(x => x.fylke === c.fylke).map(x => x.name).sort());
      expect(+v.prev).toBe(+v.year - 1);
      const h = countyHead(v);
      expect(h.title).toContain(c.fylke);
      expect(h.canonical).toBe(SITE + v.path);
    }
  });
});
