import { describe, it, expect, beforeEach } from 'vitest';
import { loadFixtures, DATA } from './fixtures';
import { stubMap } from './mapstub';
import { placeLabel, places, findPlaces, distKm, distOf, fmtKm, initPlaces } from '../src/places';
import { setView, setNear, setListMode, areaRows, renderListView, initListview } from '../src/listview';
import {
  toggleChoice, moveChoice, choicesText, anyChanceText, openOnly, wishChance, OPEN_CHANCE,
} from '../src/chance';
import { initHelpers, shownPrograms, fmt } from '../src/helpers';
import { visibleSchools } from '../src/map';
import { t } from '../src/i18n';
import { S } from '../src/state';

const rows = () => [...document.querySelectorAll('#listview tbody tr')] as HTMLElement[];
const setup = () => { loadFixtures(); initHelpers(); initListview(); stubMap(); S.placeIx = null; S.near = null; };

describe('places', () => {
  beforeEach(() => { S.choices = []; S.myPoints = null; S.listMode = 'schools'; });

  it('every school in the fixture has a kommune, and the label adds the post town where they differ', () => {
    setup();
    expect(DATA.schools.every((s: any) => s.kommune && s.sted)).toBe(true);
    expect(placeLabel({ kommune: 'Bærum', sted: 'Hosle' } as any)).toBe('Bærum (Hosle)');
    expect(placeLabel({ kommune: 'Oslo', sted: 'Oslo' } as any)).toBe('Oslo');
  });

  it('a place sits at the middle of its schools, and a post town named as its kommune is that kommune', () => {
    setup();
    const oslo = places().filter(p => p.name === 'Oslo');
    expect(oslo.length).toBe(1);
    expect(oslo[0].kind).toBe('kommune');
    const own = DATA.schools.filter((s: any) => s.kommune === 'Oslo' || s.sted === 'Oslo');
    expect(oslo[0].n).toBe(own.length);
    const lat = own.reduce((a: number, s: any) => a + s.lat, 0) / own.length;
    expect(oslo[0].lat).toBeCloseTo(lat, 9);
    // a prefix finds it; nothing finds nothing
    expect(findPlaces('osl')[0].name).toBe('Oslo');
    expect(findPlaces('')).toEqual([]);
  });

  it('distance is great-circle, and printed in metres under a kilometre', () => {
    // Oslo S to Bergen stasjon, about 305 km in a straight line
    expect(distKm(59.9111, 10.7528, 60.3903, 5.3328)).toBeGreaterThan(300);
    expect(distKm(59.9111, 10.7528, 60.3903, 5.3328)).toBeLessThan(310);
    expect(distKm(60, 10, 60, 10)).toBe(0);
    expect(fmtKm(0.04)).toBe('100 m');
    expect(fmtKm(0.84)).toBe('800 m');
    expect(fmtKm(12.6)).toBe('13 km');
  });

  it('picking a place sorts the list nearest first, is remembered, and letting go drops the column', () => {
    setup();
    setView('list');
    const p = findPlaces('oslo')[0];
    setNear(p);
    expect(S.listSort).toEqual({ key: 'dist', dir: 1 });
    // the printed distances, in metres, run nearest first
    const ds = [...document.querySelectorAll('#listview td.dist')].map(e => {
      const m = e.textContent!.replace(/\s/g, ' ').match(/([\d ]+) (k?m)/)!;
      return +m[1].replace(/ /g, '') * (m[2] === 'km' ? 1000 : 1);
    });
    expect(ds.length).toBeGreaterThan(1);
    for (let i = 1; i < ds.length; i++) expect(ds[i]).toBeGreaterThanOrEqual(ds[i - 1]);
    expect(document.querySelectorAll('#listview td.dist').length).toBe(rows().length);
    expect(JSON.parse(localStorage.getItem('pk-near')!).name).toBe('Oslo');
    // a reload: the list starts in its default order, the saved place puts it
    // back in distance order
    S.near = null; initListview(); initPlaces();
    expect(S.near!.name).toBe('Oslo');
    expect(S.listSort).toEqual({ key: 'dist', dir: 1 });
    setNear(null);
    expect(S.near).toBe(null);
    expect(localStorage.getItem('pk-near')).toBe(null);
    expect(document.querySelectorAll('#listview td.dist').length).toBe(0);
    expect(S.listSort.key).not.toBe('dist');
  });
});

describe('the programme-area list', () => {
  beforeEach(() => { S.choices = []; S.myPoints = null; S.listMode = 'schools'; });

  it('writes one row per programme area the schools offer, never a discontinued one', () => {
    setup();
    setView('list');
    setListMode('areas');
    expect(localStorage.getItem('pk-listmode')).toBe('areas');
    const ar = areaRows();
    expect(rows().length).toBe(ar.length);
    expect(ar.length).toBeGreaterThan(visibleSchools().length);
    for (const r of ar) {
      const ys = Object.keys(r.p.values).sort();
      expect(['U', 'F']).not.toContain(r.p.values[ys[ys.length - 1]]);
      expect(shownPrograms(r.s)).toContain(r.p);
    }
    expect(document.querySelector('#listview .lhead .n')!.textContent).toBe(t('listCountAreas', ar.length));
    setListMode('schools');
    expect(rows().length).toBe(visibleSchools().length);
  });

  it('with points entered it sorts by chance, highest first, and an area with no waiting list counts as near-certain', () => {
    setup();
    setView('list');
    S.myPoints = 40;
    setListMode('areas');
    expect(S.listSort).toEqual({ key: 'chance', dir: -1 });
    const cs = areaRows().map(r => r.c).filter(c => c !== null) as number[];
    expect(cs.length).toBeGreaterThan(0);
    const sorted = [...areaRows()].sort((a, b) => (b.c ?? -1) - (a.c ?? -1)).map(r => r.c);
    expect(sorted[0]).toBeGreaterThan(0);
    for (const r of areaRows().filter(r => r.open)) {
      expect(r.c).toBe(OPEN_CHANCE);
      expect(openOnly(r.p)).toBe(true);
    }
    renderListView();
    expect(rows().length).toBe(areaRows().length);
  });
});

describe('planning with the wish list', () => {
  beforeEach(() => { S.choices = []; S.choicesNote = null; S.myPoints = null; });

  const three = () => DATA.schools.filter((s: any) => shownPrograms(s).some((p: any) => p.level === 'Vg1'))
    .slice(0, 3).map((s: any) => ({ s, p: shownPrograms(s).find((p: any) => p.level === 'Vg1') }));

  it('a wish moves up and down one place, and not past either end', () => {
    setup();
    const w = three();
    w.forEach(({ s, p }) => toggleChoice(s, p));
    const order = () => S.choices.map(c => c.s);
    expect(order()).toEqual(w.map(x => x.s.name));
    moveChoice(2, -1);
    expect(order()).toEqual([w[0], w[2], w[1]].map(x => x.s.name));
    expect(JSON.parse(localStorage.getItem('pk-choices')!).map((c: any) => c.s)).toEqual(order());
    moveChoice(0, -1);                                  // already first
    moveChoice(2, 1);                                   // already last
    expect(order()).toEqual([w[0], w[2], w[1]].map(x => x.s.name));
    expect([...document.querySelectorAll('#choices .rk')].map(e => e.textContent)).toEqual(['1.', '2.', '3.']);
    expect((document.querySelector('#choices .mv[data-i="0"][data-d="up"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('copies as plain numbered lines, with each chance and the combined figure when points are in', () => {
    setup();
    const w = three();
    w.forEach(({ s, p }) => toggleChoice(s, p));
    const plain = choicesText().split('\n');
    expect(plain[0]).toBe(t('copyHead'));
    expect(plain[1]).toMatch(new RegExp(`^1\\. ${w[0].s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} – .+ \\(Vg1\\)$`));
    expect(plain.filter(l => /^\d+\. /.test(l)).length).toBe(3);
    S.myPoints = 45;
    const txt = choicesText();
    expect(txt.split('\n')[0]).toBe(t('copyHeadPts', fmt(45)));
    expect(txt).toMatch(/Sjansen for minst én plass: (ca\.|over) \d+ %/);
    expect(txt).not.toMatch(/<[a-z]/);                // no markup in what goes on the clipboard
  });

  it('the combined chance never prints above 95 %', () => {
    expect(anyChanceText(0.999)).toBe(t('choicesAnyOver', '95'));
    expect(anyChanceText(0.95)).toBe(t('choicesAny', '95'));
    expect(anyChanceText(0.62)).toBe(t('choicesAny', '62'));
  });

  it('an area whose newest published cell is «open» and never had a figure counts as near-certain', () => {
    expect(openOnly({ values: { '2024': 'open', '2025': 'open' } } as any)).toBe(true);
    expect(openOnly({ values: { '2024': 'open', '2025': 'F' } } as any)).toBe(true);
    expect(openOnly({ values: { '2024': 31.5, '2025': 'open' } } as any)).toBe(false);
    expect(openOnly({ values: { '2024': 'open', '2025': 'D' } } as any)).toBe(false);
    expect(openOnly({ values: { '2025': 'F' } } as any)).toBe(false);
    setup();
    S.myPoints = 30;
    const hit = DATA.schools.flatMap((s: any) => shownPrograms(s).map((p: any) => ({ s, p })))
      .find(({ s, p }: any) => wishChance(s, p)?.open);
    expect(hit, 'no open-only area without a forecast in the fixture').toBeTruthy();
    expect(openOnly(hit!.p)).toBe(true);
    expect(wishChance(hit!.s, hit!.p)!.c).toBe(OPEN_CHANCE);
  });
});
