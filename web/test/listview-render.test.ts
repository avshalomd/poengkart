import { describe, it, expect } from 'vitest';
import { loadFixtures } from './fixtures';
import { stubMap } from './mapstub';
import { setView, renderListView, sortList, initListview, deltaFor } from '../src/listview';
import { visibleSchools } from '../src/map';
import { initHelpers, schoolPressure, fmt, round1 } from '../src/helpers';
import { schoolHash } from '../src/sidebar';
import { t } from '../src/i18n';
import { S } from '../src/state';

const rows = () => [...document.querySelectorAll('#listview tbody tr')];

describe('the list view', () => {
  it('switching to the list shows it, marks the toggle and remembers the choice', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    setView('list');
    expect(S.view).toBe('list');
    expect(document.body.classList.contains('view-list')).toBe(true);
    expect(document.getElementById('listview')!.hidden).toBe(false);
    expect(document.getElementById('view-list')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.getElementById('view-map')!.getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('pk-view')).toBe('list');
    setView('map');
    expect(document.getElementById('listview')!.hidden).toBe(true);
    expect(document.body.classList.contains('view-list')).toBe(false);
    expect(localStorage.getItem('pk-view')).toBe('map');
    setView('gallery' as any);
    expect(S.view).toBe('map');                       // the only two views that exist
  });

  it('writes one row per school the map would show, and counts them in the header', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    setView('list');
    expect(rows().length).toBe(visibleSchools().length);
    expect(document.querySelector('#listview .lhead .n')!.textContent).toBe(t('listCount', rows().length));
    expect(document.getElementById('list-title')!.textContent).toBe(`${t('allCats')} · ${t('allFylker')}`);
    // the county filter narrows the table to the same schools as the map
    S.mapFylke = 'Oslo';
    renderListView();
    expect(rows().length).toBe(visibleSchools().length);
    expect(rows().every(r => r.querySelector('.fy') === null)).toBe(true);   // the column goes with it
    expect(document.getElementById('list-title')!.textContent).toBe(`${t('allCats')} · Oslo`);
  });

  it('every value cell is the school’s own pressure figure, and its link is the school’s hash', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    setView('list');
    const first = rows()[0];
    const name = first.querySelector('.sc a')!.textContent;
    const s = visibleSchools().find((x: any) => x.name === name)!;
    expect(first.querySelector('.sc a')!.getAttribute('href')).toBe(schoolHash(s));
    const pr: any = schoolPressure(s, S.mapCat);
    const cell = first.querySelector('td.num')!.textContent;
    if (pr.kind === 'points') expect(cell).toBe(fmt(pr.v));
    else if (pr.kind === 'open') expect(cell).toBe(t('listOpen'));
    else if (pr.kind === 'zero') expect(cell).toBe(t('noPointsShort'));
    else expect(cell).toBe(t('listNoData'));
    // and the change column is the same meanStep the sheet's hero prints
    const d = pr.kind === 'points' ? deltaFor(s, S.mapCat, pr.year) : null;
    const delta = first.querySelector('td.dl')!.textContent;
    expect(delta).toBe(d === null ? '—' : `${round1(d) > 0 ? '+' : ''}${fmt(round1(d))}`);
  });

  it('the sort indicator follows S.listSort, and a second click flips it', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    setView('list');
    expect(S.listSort).toEqual({ key: 'value', dir: -1 });
    expect(document.querySelector('#listview th.col-value .ar.on')!.textContent).toBe('↓');
    expect(document.querySelector('#listview th.col-value')!.getAttribute('aria-sort')).toBe('descending');
    sortList('name');
    expect(S.listSort).toEqual({ key: 'name', dir: 1 });
    expect(document.querySelector('#listview th.col-name .ar.on')!.textContent).toBe('↑');
    expect(document.querySelector('#listview th.col-value .ar.on')).toBeNull();
    sortList('name');
    expect(S.listSort.dir).toBe(-1);
    expect(document.querySelector('#listview th.col-name .ar.on')!.textContent).toBe('↓');
  });

  it('the chance column appears with points and goes again when they are cleared', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    setView('list');
    expect(document.querySelector('#listview th.col-chance')).toBeNull();
    S.myPoints = 45;
    renderListView();
    expect(document.querySelector('#listview th.col-chance')).toBeTruthy();
    expect(document.querySelector('#listview table')!.classList.contains('has-chance')).toBe(true);
    sortList('chance');
    expect(S.listSort.key).toBe('chance');
    S.myPoints = null;
    renderListView();
    // a sort key can outlive its column
    expect(S.listSort).toEqual({ key: 'value', dir: -1 });
    expect(document.querySelector('#listview th.col-chance')).toBeNull();
  });

  it('a selection with no schools says so instead of drawing an empty table', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    setView('list');
    S.mapFylke = 'Svalbard';
    renderListView();
    expect(rows().length).toBe(0);
    expect(document.querySelector('#listview .foot')!.textContent).toBe(t('listEmpty'));
    expect(document.querySelector('#listview .tblwrap')!.hasAttribute('hidden')).toBe(true);
  });

  it('a row opens its school', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    setView('list');
    const first = rows()[0] as any;
    const name = first.querySelector('.sc a').textContent;
    first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(S.current.name).toBe(name);
    expect(document.getElementById('side')!.classList.contains('open')).toBe(true);
  });
});
