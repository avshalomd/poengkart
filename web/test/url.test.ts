import { describe, it, expect } from 'vitest';
import { loadFixtures, asker, school } from './fixtures';
import { buildHash, hashParts, schoolFromUrl } from '../src/sidebar';
import { S } from '../src/state';

describe('permalinks', () => {
  it('a school hash round-trips through buildHash and hashParts', () => {
    // buildHash(s) takes the school explicitly (it does not read S.current);
    // hashParts() takes no argument and reads location.hash instead — set
    // that, rather than passing buildHash's return value in.
    loadFixtures();
    const h = buildHash(asker());
    expect(h).toContain('s=');
    location.hash = h;
    expect(hashParts().s).toBe('Akershus/Asker');
  });
  it('schoolFromUrl resolves a plain register name, and is falsy when nothing matches', () => {
    loadFixtures();
    location.hash = '#s=Akershus/Asker'; expect(schoolFromUrl()?.name).toBe('Asker');
    location.hash = '#s=Akershus/Finnes%20ikke'; expect(schoolFromUrl()).toBeFalsy();
  });
  it('schoolFromUrl decodes a percent-encoded space in the school name', () => {
    // A genuine positive encoding case: a real school whose name has a space,
    // built the way encodeURIComponent (and so buildHash/schoolPart) encodes
    // it, and resolved back — unlike the %20 "not found" case above, this one
    // would fail if decodeURIComponent were missing or broken.
    loadFixtures();
    const s = school('Roald Amundsen');
    expect(s.fylke).toBe('Akershus');
    const h = `#s=${s.fylke}/${encodeURIComponent(s.name)}`;
    expect(h).toContain('%20');
    location.hash = h;
    expect(schoolFromUrl()?.name).toBe('Roald Amundsen');
  });
  it.todo(
    'schoolFromUrl should tolerate an encoded "/" in #s=Fylke%2FSkole — ' +
    'today it does not: schoolFromUrl splits p.s on a literal "/" BEFORE ' +
    'decoding (const m = /^([^/]+)\\/(.+)$/.exec(p.s) in src/sidebar.ts), so ' +
    'a fully-encoded slash never matches and the function returns null. ' +
    'buildHash never emits %2F (schoolPart joins the two encoded halves with ' +
    'a literal "/"), so this only bites a hand-built or third-party link.'
  );
});
