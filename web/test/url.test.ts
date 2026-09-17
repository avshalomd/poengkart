import { describe, it, expect, beforeEach } from 'vitest';
import { loadFixtures, asker, school } from './fixtures';
import { adoptLegacyUrl, buildUrl, queryParts, schoolFromUrl } from '../src/router';
import { S } from '../src/state';

describe('permalinks', () => {
  beforeEach(() => { loadFixtures(); history.replaceState(null, '', '/'); });

  it('a school round-trips through buildUrl: the path names it, the query carries the filters', () => {
    // buildUrl(s) takes the school explicitly (it does not read S.current);
    // the filters it appends come from S, so set those rather than passing
    // them in.
    expect(buildUrl(asker())).toBe('/akershus/asker');
    S.mapFylke = 'Akershus'; S.mapCat = 'ST';
    const u = buildUrl(asker());
    expect(u).toBe('/akershus/asker?f=Akershus&c=ST');
    expect(queryParts(u.slice(u.indexOf('?')))).toEqual({ f: 'Akershus', c: 'ST' });
  });

  it('schoolFromUrl resolves a plain register name, and is falsy when nothing matches', () => {
    history.replaceState(null, '', '/akershus/asker'); expect(schoolFromUrl()?.name).toBe('Asker');
    history.replaceState(null, '', '/akershus/finnes-ikke'); expect(schoolFromUrl()).toBeFalsy();
  });

  it('a legacy link with a percent-encoded space is adopted onto the school’s path', () => {
    // A genuine positive encoding case: a real school whose name has a space,
    // built the way encodeURIComponent (and so the old schoolPart) encoded it,
    // and resolved back — unlike a "not found" %20 case, this one would fail
    // if decodeURIComponent were missing or broken.
    const s = school('Roald Amundsen');
    expect(s.fylke).toBe('Akershus');
    const h = `/#s=${s.fylke}/${encodeURIComponent(s.name)}`;
    expect(h).toContain('%20');
    history.replaceState(null, '', h);
    expect(adoptLegacyUrl()).toBe('');
    expect(location.pathname).toBe('/akershus/roald-amundsen');
    expect(schoolFromUrl()?.name).toBe('Roald Amundsen');
  });
});
