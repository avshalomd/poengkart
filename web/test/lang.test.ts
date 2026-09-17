import { describe, it, expect } from 'vitest';
import { loadFixtures, asker } from './fixtures';
import { stubMap } from './mapstub';
import { setLang } from '../src/lang';
import { openSide } from '../src/sidebar';
import { openIntro } from '../src/intro';
import { initHelpers } from '../src/helpers';
import { initListview } from '../src/listview';
import { t, CATS } from '../src/i18n';
import { S } from '../src/state';

describe('the language switch', () => {
  it('English stamps the document, the title and the stored choice, and redraws the chrome', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    setLang('en');
    expect(S.lang).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe(t('pageTitle'));
    expect(localStorage.getItem('pk-lang')).toBe('en');
    expect(document.getElementById('cat-label')!.textContent).toBe(t('catLabel'));
    expect(document.getElementById('legend-title')!.textContent).toContain(t('legendAll'));
    const cat = document.getElementById('map-cat') as HTMLSelectElement;
    expect([...cat.options].map(o => o.textContent)).toContain(CATS.ST.en);
  });

  it('Norwegian comes back, and an unknown language is refused', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    setLang('en');
    setLang('no');
    expect(S.lang).toBe('no');
    expect(document.documentElement.lang).toBe('no');
    expect(localStorage.getItem('pk-lang')).toBe('no');
    setLang('de' as any);
    expect(S.lang).toBe('no');
    expect(localStorage.getItem('pk-lang')).toBe('no');
  });

  it('an open school sheet and an open help sheet follow the switch', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    openSide(asker());
    openIntro();
    setLang('en');
    expect(document.getElementById('intro-h')!.textContent).toBe(t('introTitle'));
    expect(document.getElementById('s-hero')!.textContent).toContain(t('heroTypical'));
    setLang('no');
    expect(document.getElementById('intro-h')!.textContent).toBe('Slik leser du kartet');
  });
});
