import { describe, it, expect, beforeEach } from 'vitest';
import { loadFixtures } from './fixtures';
import { stubMap } from './mapstub';
import { PREFS, loadPrefs, applyPrefs, renderSettings, openSettings, closeSettings } from '../src/prefs';
import { initHelpers } from '../src/helpers';
import { initListview } from '../src/listview';
import { isSheetOpen } from '../src/intro';
import { t } from '../src/i18n';
import { S } from '../src/state';

const themeColors = () => [...document.querySelectorAll('meta[name="theme-color"]')].map((m: any) => m.content);

describe('preferences', () => {
  beforeEach(() => { PREFS.theme = 'auto'; PREFS.font = 'n'; PREFS.cvd = false; });

  it('the dark theme stamps the document and both theme-colour metas', () => {
    loadFixtures(); initHelpers();
    // applyPrefs() takes one argument — whether to re-render — and reads the
    // choices from the PREFS object, not from a settings literal
    PREFS.theme = 'dark';
    applyPrefs(false);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(themeColors()).toEqual(['#0e1116', '#0e1116']);
    expect(localStorage.getItem('pk-theme')).toBe('dark');
    PREFS.theme = 'light';
    applyPrefs(false);
    expect(themeColors()).toEqual(['#2a78d6', '#2a78d6']);
    PREFS.theme = 'auto';
    applyPrefs(false);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('pk-theme')).toBeNull();
    // auto hands each meta its own media-matched colour back
    expect(themeColors()).toEqual(['#2a78d6', '#0e1116']);
  });

  it('the text size and the colour-blind palette are attributes on <html>', () => {
    loadFixtures(); initHelpers();
    PREFS.font = 'xl'; PREFS.cvd = true;
    applyPrefs(false);
    expect(document.documentElement.dataset.font).toBe('xl');
    expect(document.documentElement.dataset.cvd).toBe('1');
    expect(localStorage.getItem('pk-font')).toBe('xl');
    expect(localStorage.getItem('pk-cvd')).toBe('1');
    PREFS.font = 'n'; PREFS.cvd = false;
    applyPrefs(false);
    expect(document.documentElement.dataset.font).toBeUndefined();
    expect(document.documentElement.dataset.cvd).toBeUndefined();
    expect(localStorage.getItem('pk-font')).toBeNull();
    expect(localStorage.getItem('pk-cvd')).toBeNull();
  });

  it('loadPrefs reads the three keys the code names, and ignores anything else', () => {
    localStorage.setItem('pk-theme', 'dark');
    localStorage.setItem('pk-font', 'lg');
    localStorage.setItem('pk-cvd', '1');
    loadPrefs();
    expect(PREFS).toMatchObject({ theme: 'dark', font: 'lg', cvd: true });
    PREFS.theme = 'auto'; PREFS.font = 'n'; PREFS.cvd = false;
    localStorage.setItem('pk-theme', 'neon');
    localStorage.setItem('pk-font', 'huge');
    localStorage.setItem('pk-cvd', 'yes');
    loadPrefs();
    expect(PREFS).toMatchObject({ theme: 'auto', font: 'n', cvd: false });
  });

  it('a re-render redraws the map, the legend and an open school sheet', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    PREFS.theme = 'dark';
    applyPrefs(true);
    expect(document.getElementById('legend-bins')!.children.length).toBeGreaterThan(0);
    expect(S.tileLayer).toBeTruthy();
  });

  it('the settings sheet shows the choice in force on every row', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    renderSettings();
    expect(document.getElementById('settings-h')!.textContent).toBe(t('settingsLabel'));
    const on = [...document.querySelectorAll('#settings-body .seg button.on')] as any[];
    // one pressed button per row: levels, language, theme, text size, colours
    expect(on.length).toBe(5);
    expect(on.map(b => b.dataset.v)).toEqual(['1', 'no', 'auto', 'n', '0']);
    expect(on.every(b => b.getAttribute('aria-pressed') === 'true')).toBe(true);
  });

  it('pressing a settings button applies the choice and redraws the sheet', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    // opened, not merely rendered: setLang() redraws this sheet only while it
    // is on screen
    openSettings();
    (document.querySelector('#settings-body .seg button[data-k="theme"][data-v="dark"]') as any).click();
    expect(PREFS.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect((document.querySelector('#settings-body .seg button[data-k="theme"].on') as any).dataset.v).toBe('dark');
    (document.querySelector('#settings-body .seg button[data-k="font"][data-v="lg"]') as any).click();
    expect(PREFS.font).toBe('lg');
    (document.querySelector('#settings-body .seg button[data-k="cvd"][data-v="1"]') as any).click();
    expect(PREFS.cvd).toBe(true);
    (document.querySelector('#settings-body .seg button[data-k="levels"][data-v="all"]') as any).click();
    expect(S.allLevels).toBe(true);
    (document.querySelector('#settings-body .seg button[data-k="lang"][data-v="en"]') as any).click();
    expect(S.lang).toBe('en');
    expect(document.getElementById('settings-h')!.textContent).toBe('Settings');
  });

  it('the sheet opens and closes', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    openSettings();
    expect(isSheetOpen(document.getElementById('settings'))).toBe(true);
    expect(document.getElementById('app')!.hasAttribute('inert')).toBe(true);
    closeSettings(true);
    expect(isSheetOpen(document.getElementById('settings'))).toBe(false);
    expect(document.getElementById('app')!.hasAttribute('inert')).toBe(false);
  });
});
