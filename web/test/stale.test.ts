import { describe, it, expect } from 'vitest';
import { loadFixtures, DATA } from './fixtures';
import { stubMap } from './mapstub';
import { isCurrentSchool, schoolNewest, shownCounties, shownSchools, staleBefore, staleCounties, initHelpers } from '../src/helpers';
import { setStale, visibleSchools } from '../src/map';
import { renderPanel } from '../src/chrome';
import { renderControls } from '../src/intro';
import { initListview } from '../src/listview';
import { openSettings } from '../src/prefs';
import { runSearch } from '../src/search';
import { t } from '../src/i18n';
import { S } from '../src/state';

// the fixture's two schools with nothing in 2025 or 2026: one closed in
// Innlandet (2022), one in Møre og Romsdal (2021)
const STALE = ['Nord-Gudbrandsdal vgs, avd. Dombås', 'Fagerlia videregående skole'];
const names = (ss: any[]) => ss.map(s => s.name);

describe('schools that stopped publishing', () => {
  it('are the ones whose newest figure, at any level, is older than last year', () => {
    loadFixtures(); initHelpers();
    expect(staleBefore()).toBe(2025);
    const stale = DATA.schools.filter((s: any) => !isCurrentSchool(s));
    expect(names(stale).sort()).toEqual([...STALE].sort());
    for (const s of stale) expect(schoolNewest(s)).toBeLessThan(2025);
    // no county of the fixture stopped altogether
    expect(staleCounties()).toEqual([]);
  });

  it('are hidden from the map, the List and search by default, and back with the setting', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap(); renderControls(); renderPanel();
    expect(names(visibleSchools())).not.toContain(STALE[1]);
    expect(shownSchools().length).toBe(DATA.schools.length - STALE.length);
    expect(names(runSearch('fagerlia') || [])).toEqual([]);
    setStale(true);
    expect(names(visibleSchools())).toContain(STALE[1]);
    expect(names(runSearch('fagerlia') || [])).toEqual([STALE[1]]);
    expect(document.getElementById('tagline')!.textContent).toContain(String(DATA.schools.length));
    setStale(false);
    expect(names(visibleSchools())).not.toContain(STALE[1]);
    expect(localStorage.getItem('pk-showstale')).toBe('0');
  });

  it('take a county whose every school stopped out of the menu, listed greyed', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap(); renderControls();
    // Møre og Romsdal as if every school's figures stopped in 2021
    const mr = DATA.schools.filter((s: any) => s.fylke === 'Møre og Romsdal');
    const saved = mr.map((s: any) => s.programs);
    mr.forEach((s: any) => { s.programs = [{ ...s.programs[0], values: { '2021': 40 } }]; });
    // schoolNewest caches per object; fresh objects keep the cache honest
    const idx = mr.map((s: any) => DATA.schools.indexOf(s));
    idx.forEach((i: number, j: number) => { DATA.schools[i] = { ...mr[j] }; });
    try {
      expect(staleCounties()).toEqual(['Møre og Romsdal']);
      expect(shownCounties().map(c => c.fylke)).not.toContain('Møre og Romsdal');
      S.mapFylke = 'Møre og Romsdal';
      setStale(false);
      expect(S.mapFylke).toBe('all');            // a county with nothing shown is let go
      const fsel = document.getElementById('map-fylke') as HTMLSelectElement;
      const opt = [...fsel.options].find(o => o.textContent === 'Møre og Romsdal')!;
      expect(opt.disabled).toBe(true);
      expect((opt.parentElement as HTMLOptGroupElement).label).toBe(t('fylkeNoRecent'));
      openSettings();
      expect(document.getElementById('settings-body')!.textContent)
        .toContain(t('setStaleHint', DATA.schools.filter((s: any) => !isCurrentSchool(s)).length, 2025, 'Møre og Romsdal'));
    } finally {
      idx.forEach((i: number, j: number) => { DATA.schools[i] = mr[j]; mr[j].programs = saved[j]; });
    }
  });
});
