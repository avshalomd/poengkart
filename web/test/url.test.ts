import { describe, it, expect } from 'vitest';
import { loadFixtures, asker } from './fixtures';
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
  it('schoolFromUrl resolves the register name and tolerates encoding', () => {
    loadFixtures();
    location.hash = '#s=Akershus/Asker'; expect(schoolFromUrl()?.name).toBe('Asker');
    location.hash = '#s=Akershus/Finnes%20ikke'; expect(schoolFromUrl()).toBeFalsy();
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
