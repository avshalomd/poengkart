import { describe, it, expect } from 'vitest';
import { slug, schoolPath } from '../src/helpers';
import { loadFixtures, DATA } from './fixtures';

// The same table sits in tools/tests/test_slug.py: a change to either slug()
// that is not made to both fails one of them.
export const SLUG_TABLE: [string, string][] = [
  ['Asker', 'asker'],
  ['Førde vidaregåande skule', 'forde-vidaregaande-skule'],
  ['Møre og Romsdal', 'more-og-romsdal'],
  ['St. Hallvard videregående skole', 'st-hallvard-videregaende-skole'],
  ['Bjørnholt  vgs', 'bjornholt-vgs'],
  ['Ås', 'as'],
  ['Sandvika videregående skole (Bærum)', 'sandvika-videregaende-skole-baerum'],
  ['Élan', 'elan'],
  ['Vg2/Vg3', 'vg2-vg3'],
  ['  Kongsberg  ', 'kongsberg'],
  ['Trøndelag', 'trondelag'],
];

describe('slug', () => {
  it.each(SLUG_TABLE)('%s → %s', (text, expected) => expect(slug(text)).toBe(expected));
  it('a decomposed å (a + ring) slugs like the composed one', () => {
    expect(slug('Ås'.normalize('NFD'))).toBe('as');
  });
  it('every school in the dataset has a unique path', () => {
    loadFixtures();
    const paths = DATA.schools.map(schoolPath);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) expect(p).toMatch(/^\/[a-z0-9-]+\/[a-z0-9-]+$/);
  });
});
