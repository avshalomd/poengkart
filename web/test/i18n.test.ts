import { describe, it, expect } from 'vitest';
import { T, t } from '../src/i18n';
import { S } from '../src/state';

// A handful of T[key].no/en are functions whose first argument is not a
// generic count but a specific shape (an array of years, or a CATS code) and
// index into a lookup with no fallback — calling them with (1,1,1,1,1,1)
// throws instead of returning a string. Give those two real-shaped input.
const CALL_ARGS: Record<string, any[]> = {
  yearsOr: [['2025', '2026']],
  legendCat: ['ST'],
};

describe('i18n', () => {
  it('every key has a Norwegian and an English form of the same kind', () => {
    for (const [k, v] of Object.entries(T as Record<string, any>)) {
      expect(v, k).toHaveProperty('no'); expect(v, k).toHaveProperty('en');
      expect(typeof v.no, k).toBe(typeof v.en);
      if (typeof v.no === 'function') expect(v.no.length, `${k} arity`).toBe(v.en.length);
    }
  });
  it('t() follows S.lang and passes arguments through', () => {
    S.lang = 'no'; const no = t('tagline', 217, 8, 2012, 2026);
    S.lang = 'en'; const en = t('tagline', 217, 8, 2012, 2026);
    expect(no).toContain('217'); expect(en).toContain('217'); expect(no).not.toBe(en);
  });
  it('no string contains a coined term the glossary forbids', () => {
    const banned = /\b(cut-off|cutoff|high school|grade 1[123]|priority quota)\b/i;
    for (const [k, v] of Object.entries(T as Record<string, any>)) for (const form of ['no', 'en']) {
      const args = CALL_ARGS[k] ?? [1, 1, 1, 1, 1, 1];
      const s = typeof v[form] === 'function' ? v[form](...args) : v[form];
      expect(String(s), `${k}.${form}`).not.toMatch(banned);
    }
  });
});
