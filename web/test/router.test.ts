import { describe, it, expect, beforeEach } from 'vitest';
import { S } from '../src/state';
import { loadFixtures, DATA, asker, forde } from './fixtures';
import { schoolByName, schoolBySlug, pathSegments, queryParts, schoolFromUrl, buildUrl,
         adoptLegacyUrl, syncUrl, unresolvedFromPath } from '../src/router';
import { schoolHead } from '../src/prerender';

beforeEach(() => {
  loadFixtures();
  S.DATA = DATA; S.current = null; S.mapFylke = 'all'; S.mapCat = 'all'; S.allLevels = false;
  history.replaceState(null, '', '/');
});

describe('resolving a school', () => {
  it('by slug pair', () => expect(schoolBySlug('akershus', 'asker')).toBe(asker()));
  it('by slug pair with æøå folded', () => expect(schoolBySlug('vestland', 'forde-vidaregaande-skule')).toBe(forde()));
  it('by the legacy name form, case- and space-tolerant', () => expect(schoolByName('Akershus', '  asker ')).toBe(asker()));
  it('unknown → null', () => { expect(schoolBySlug('akershus', 'finnes-ikke')).toBeNull(); expect(schoolByName('Akershus', 'Finnes ikke')).toBeNull(); });
  it('a merged-away name still resolves to its successor', () => {
    const merged = DATA.schools.find(s => s.merged_from?.length)!;
    expect(schoolByName(merged.fylke, merged.merged_from![0])).toBe(merged);
    expect(schoolBySlug(slugOf(merged.fylke), slugOf(merged.merged_from![0]))).toBe(merged);
  });
});

describe('the address', () => {
  it('pathSegments reads /a/b and nothing else', () => {
    expect(pathSegments('/akershus/asker')).toEqual(['akershus', 'asker']);
    expect(pathSegments('/')).toBeNull(); expect(pathSegments('/report')).toBeNull(); expect(pathSegments('/a/b/c')).toBeNull();
  });
  it('queryParts decodes', () => expect(queryParts('?f=M%C3%B8re%20og%20Romsdal&c=ST&l=all')).toEqual({ f: 'Møre og Romsdal', c: 'ST', l: 'all' }));
  it('buildUrl: path for the school, query for the filters, both omitted when default', () => {
    expect(buildUrl(null)).toBe('/');
    expect(buildUrl(asker())).toBe('/akershus/asker');
    S.mapFylke = 'Oslo'; S.mapCat = 'ST'; S.allLevels = true;
    expect(buildUrl(asker())).toBe('/akershus/asker?f=Oslo&c=ST&l=all');
    expect(buildUrl(null)).toBe('/?f=Oslo&c=ST&l=all');
  });
  it('schoolFromUrl reads the path', () => {
    history.replaceState(null, '', '/akershus/asker?c=ST');
    expect(schoolFromUrl()).toBe(asker());
    history.replaceState(null, '', '/');
    expect(schoolFromUrl()).toBeNull();
  });
  it('syncUrl writes the current state', () => {
    S.current = asker(); S.mapCat = 'ST';
    syncUrl();
    expect(location.pathname + location.search).toBe('/akershus/asker?c=ST');
  });
});

describe('legacy links', () => {
  it('#s= becomes the path', () => {
    history.replaceState(null, '', '/#s=Akershus/Asker');
    expect(adoptLegacyUrl()).toBe('');
    expect(location.pathname).toBe('/akershus/asker'); expect(location.hash).toBe(''); expect(location.search).toBe('');
  });
  it('#s= with filters becomes path + query', () => {
    history.replaceState(null, '', '/#s=Akershus/Asker&f=Akershus&c=ST&l=all');
    adoptLegacyUrl();
    expect(location.pathname + location.search).toBe('/akershus/asker?f=Akershus&c=ST&l=all');
  });
  it('a hash whose whole s= is percent-encoded (the old it.todo) resolves', () => {
    history.replaceState(null, '', '/#s=Akershus%2FAsker');
    adoptLegacyUrl();
    expect(location.pathname).toBe('/akershus/asker');
  });
  it('?s= (the mailed form) becomes the path', () => {
    history.replaceState(null, '', '/?s=Akershus/Asker&f=Akershus');
    adoptLegacyUrl();
    expect(location.pathname + location.search).toBe('/akershus/asker?f=Akershus');
  });
  it('filters alone move from the hash to the query', () => {
    history.replaceState(null, '', '/#f=Oslo');
    adoptLegacyUrl();
    expect(location.pathname + location.search).toBe('/?f=Oslo');
  });
  it('an unknown school returns its name and lands on /', () => {
    history.replaceState(null, '', '/#s=Akershus/Finnes%20ikke');
    expect(adoptLegacyUrl()).toBe('Finnes ikke');
    expect(location.pathname + location.search + location.hash).toBe('/');
  });
  it('a plain path is left alone', () => {
    history.replaceState(null, '', '/akershus/asker?c=ST');
    expect(adoptLegacyUrl()).toBe('');
    expect(location.pathname + location.search).toBe('/akershus/asker?c=ST');
  });
  it('unresolvedFromPath turns the slug back into words', () => {
    history.replaceState(null, '', '/akershus/finnes-ikke');
    expect(unresolvedFromPath()).toBe('finnes ikke');
  });
});

describe('the school page head', () => {
  it('names the school in the title, the county in the description and the path in the canonical', () => {
    const h = schoolHead(asker());
    expect(h.title).toBe('Asker – poenggrenser | Poengkart');
    expect(h.canonical).toBe('https://poengkart-no.vercel.app/akershus/asker');
    expect(h.description).toContain('Asker i Akershus');
    expect(h.description).toMatch(/\(\d{4}–\d{4}\)\.$/);
  });
});

function slugOf(t: string) { return t.normalize('NFC').toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
