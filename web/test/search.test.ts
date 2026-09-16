import { describe, it, expect } from 'vitest';
import { loadFixtures, DATA } from './fixtures';
import { stubMap } from './mapstub';
import { runSearch, foldName } from '../src/search';
import { renderOvList, pickOv, openSearchOv, closeSearchOv } from '../src/searchov';
import { initHelpers } from '../src/helpers';
import { initListview } from '../src/listview';
import { isSheetOpen } from '../src/intro';
import { t } from '../src/i18n';
import { S } from '../src/state';

const q = () => document.getElementById('ov-q') as HTMLInputElement;
const search = (s: string) => { S.ovHits = runSearch(s) || []; q().value = s; renderOvList(); };

describe('finding a school', () => {
  it('folds the Norwegian letters so that "as" finds Ås and "sorumsand" Sørumsand', () => {
    expect(foldName('Ås')).toBe('as');
    expect(foldName('Sørumsand')).toBe('sorumsand');
    expect(foldName('Møre og Romsdal')).toBe('more og romsdal');
    expect(foldName('St. Olav')).toBe('st olav');
  });

  it('ranks an exact name first and finds a school by the middle of a word', () => {
    loadFixtures(); initHelpers();
    const hits = runSearch('asker')!;
    expect(hits[0].name).toBe('Asker');
    expect(runSearch('elveb')!.map((h: any) => h.name)).toEqual(['Elvebakken videregående skole']);
    // the exact tier exists because Norwegian collation puts Å after Z
    const aas = runSearch('ås')!;
    expect(aas[0].name).toBe('Ås');
    expect(runSearch('')).toBeNull();
    expect(runSearch('zzzzzz')).toEqual([]);
  });

  it('a county name answers with one county row above the schools', () => {
    loadFixtures(); initHelpers();
    const hits = runSearch('oslo')!;
    expect(hits[0].county).toBe('Oslo');
    expect(hits.slice(1).every((h: any) => h.name && !h.county)).toBe(true);
    // "Møre" answered "Ingen treff" before the county row: no school is called it
    const more = runSearch('møre')!;
    expect(more.length).toBe(1);
    expect(more[0].county).toBe('Møre og Romsdal');
  });

  it('the overlay lists one option per hit, with the county beside the name', () => {
    loadFixtures(); initHelpers();
    search('asker');
    const opts = document.querySelectorAll('#ov-list .opt');
    expect(opts.length).toBe(S.ovHits.length);
    expect(opts[0].querySelector('span')!.textContent).toBe('Asker');
    expect(opts[0].querySelector('.fy')!.textContent).toBe('Akershus');
    expect(q().getAttribute('aria-expanded')).toBe('true');
    // the active option is the one the arrow keys have landed on
    search('ås');
    expect(S.ovHits.length).toBeGreaterThan(1);
    S.ovAct = 1; renderOvList();
    expect(document.getElementById('ov-opt-1')!.getAttribute('aria-selected')).toBe('true');
    expect(q().getAttribute('aria-activedescendant')).toBe('ov-opt-1');
    S.ovAct = -1; renderOvList();
    expect(q().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('a query with no hits says so, and an empty box lists nothing', () => {
    loadFixtures(); initHelpers();
    search('zzzzzz');
    expect(document.querySelector('#ov-list .none')!.textContent).toBe(t('noMatch'));
    search('');
    expect(document.getElementById('ov-list')!.innerHTML).toBe('');
    expect(q().getAttribute('aria-expanded')).toBe('false');
  });

  it('picking a school opens its sheet; picking the county row filters the map instead', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    search('asker');
    pickOv(0);
    expect(S.current.name).toBe('Asker');
    expect(document.getElementById('side')!.classList.contains('open')).toBe(true);
    search('møre');
    pickOv(0);
    expect(S.mapFylke).toBe('Møre og Romsdal');
    expect((document.getElementById('map-fylke') as HTMLSelectElement).value).toBe('Møre og Romsdal');
    // a second event on the same option is a no-op
    const before = S.mapFylke;
    pickOv(0);
    expect(S.mapFylke).toBe(before);
  });

  it('the overlay opens empty, labelled, and closes again', () => {
    loadFixtures(); initHelpers(); stubMap();
    S.ovHits = DATA.schools.slice(0, 2); S.ovAct = 3;
    openSearchOv();
    expect(isSheetOpen(document.getElementById('searchov'))).toBe(true);
    expect(q().value).toBe('');
    expect(S.ovHits).toEqual([]);
    expect(S.ovAct).toBe(-1);
    expect(q().placeholder).toBe(t('searchPh'));
    expect(document.getElementById('ov-box')!.getAttribute('aria-label')).toBe(t('searchLabel'));
    closeSearchOv(true);
    expect(isSheetOpen(document.getElementById('searchov'))).toBe(false);
  });
});
