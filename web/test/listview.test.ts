import { describe, it, expect } from 'vitest';
import { loadFixtures } from './fixtures';
import { sortList, deltaFor, deltaMixed, initListview } from '../src/listview';
import { meanStep, round1, schoolPressure, openMix } from '../src/helpers';
import { S } from '../src/state';
import { heroCells } from '../src/templates';
import { heroFigures } from '../src/cards/card';
import { t } from '../src/i18n';

describe('list view', () => {
  it('meanStep is the change between the two newest years the mean line actually plots', () => {
    // meanStep(progs) takes an array of programme rows directly (not a
    // pre-built values object), and returns {latest, prev, mean, meanPrev, d}.
    expect(meanStep([{ values: { '2024': 38, '2025': 40, '2026': 42.5 } }] as any).d).toBeCloseTo(2.5, 6);
    expect(meanStep([{ values: { '2026': 42.5 } }] as any).d).toBeNull();
    expect(meanStep([{ values: { '2025': 'open', '2026': 42.5 } }] as any).d).toBeNull();
  });

  it('meanStep withholds the change when the two years do not cover the same programme areas', () => {
    // Hvam, Vg1: three areas had a threshold in 2025, another mix in 2026. The
    // mean fell 2,4 while the only area with a figure in both years rose 11,6
    const hvam = [
      { values: { '2025': 32.8, '2026': 44.4 } },
      { values: { '2025': 45.1, '2026': 'open' } },
      { values: { '2025': 'open', '2026': 31.2 } },
    ];
    const st: any = meanStep(hvam as any);
    expect(st.step).toBeCloseTo(round1((44.4 + 31.2) / 2 - (32.8 + 45.1) / 2), 6);
    expect(st.same).toBe(false);
    expect(st.d).toBeNull();
    // the same areas in both years: the step is the change, as before
    const same: any = meanStep([{ values: { '2025': 32.8, '2026': 44.4 } }, { values: { '2025': 'open', '2026': 'open' } }] as any);
    expect(same.same).toBe(true);
    expect(same.d).toBeCloseTo(11.6, 6);
    // a figure below 10,0 is outside the mean, so it changes the basket too
    expect((meanStep([{ values: { '2025': 30, '2026': 31 } }, { values: { '2025': 28, '2026': 6.0 } }] as any) as any).d).toBeNull();
  });

  it('the sheet and the share card print no change over different programme areas, and the sheet says why', () => {
    loadFixtures(); S.allLevels = false; S.showOld = false; S.lang = 'no';
    const s: any = { name: 'Testskole', fylke: 'Testfylke', programs: [
      { level: 'Vg1', category: 'ST', program: 'ST', values: { '2025': 40, '2026': 42.5 } },
      { level: 'Vg1', category: 'HS', program: 'HS', values: { '2025': 'open', '2026': 30 } }] };
    const cells = heroCells(s, null);
    expect(cells[1]).toMatchObject({ v: '\u2014', mixed: true, l: t('heroDeltaMixed', '2025') });
    expect(cells[1].ti).toBe(t('deltaMixedTip', '2025', '2026'));
    expect(heroFigures(s).delta).toBe('');
    // one programme area: the same cells both years, the step is shown
    expect(heroCells(s, 'ST')[1]).toMatchObject({ v: '+2,5', l: t('heroDelta', '2025') });
  });

  it('a figure below 10,0 stays out of every average and counts as everyone admitted', () => {
    // Etterstad 2026: Restaurant- og matfag printed 6,0, the last admitted had
    // grades missing; the snitt is 25,9 over the other three, not 21,0
    loadFixtures(); S.allLevels = false; S.showOld = true;
    const vg1 = (category: string, v: any) => ({ level: 'Vg1', category, program: category, values: { '2025': 30, '2026': v } });
    const progs = [vg1('RM', 6.0), vg1('TP', 13.2), vg1('EL', 27.5), vg1('ST', 37.1)];
    const st = meanStep(progs as any);
    expect(st.mean).toBeCloseTo((13.2 + 27.5 + 37.1) / 3, 6);
    expect(openMix(progs, '2026')).toMatchObject({ open: 1, total: 4 });
    const pr: any = schoolPressure({ fylke: 'Oslo', programs: progs } as any, 'all');
    expect(pr.kind).toBe('points');
    expect(pr.v).toBeCloseTo((13.2 + 27.5 + 37.1) / 3, 6);
    expect(pr).toMatchObject({ openN: 1, total: 4, filled: 3 });
    const onlyLow: any = schoolPressure({ fylke: 'Oslo', programs: [vg1('RM', 6.0)] } as any, 'all');
    expect(onlyLow.kind).toBe('open');
  });

  it('deltaFor reports the school’s meanStep for the requested year, in scope, or null', () => {
    // deltaFor(s, cat, yr) takes the school and category too (it calls
    // shownPrograms(s) and filters by cat itself) — not a bare values object —
    // and compares yr against meanStep's own (string) `latest` year.
    loadFixtures(); S.allLevels = false; S.showOld = false;
    const s2yr = { fylke: 'Testfylke', programs: [{ level: 'Vg1', category: 'ST', values: { '2025': 40, '2026': 42.5 } }] };
    expect(deltaFor(s2yr as any, 'all', '2026')).toBeCloseTo(2.5, 6);
    const s1yr = { fylke: 'Testfylke', programs: [{ level: 'Vg1', category: 'ST', values: { '2026': 42.5 } }] };
    expect(deltaFor(s1yr as any, 'all', '2026')).toBeNull();
    const sOpen = { fylke: 'Testfylke', programs: [{ level: 'Vg1', category: 'ST', values: { '2025': 'open', '2026': 42.5 } }] };
    expect(deltaFor(sOpen as any, 'all', '2026')).toBeNull();
    expect(deltaMixed(sOpen as any, 'all', '2026')).toBeNull();      // no step at all is not a mixed one
    const sMixed = { fylke: 'Testfylke', programs: [
      { level: 'Vg1', category: 'ST', values: { '2025': 40, '2026': 42.5 } },
      { level: 'Vg1', category: 'HS', values: { '2025': 'open', '2026': 30 } }] };
    expect(deltaFor(sMixed as any, 'all', '2026')).toBeNull();
    expect(deltaMixed(sMixed as any, 'all', '2026')).toEqual(['2025', '2026']);
    // within one programme area the two years are comparable again
    expect(deltaFor(sMixed as any, 'ST', '2026')).toBeCloseTo(2.5, 6);
    expect(deltaMixed(sMixed as any, 'ST', '2026')).toBeNull();
  });

  it('sortList orders the rendered table by the chosen column and flips direction on a second click', () => {
    // sortList(key) is not a pure array sort: it mutates S.listSort and
    // re-renders #listview through the full renderListView() pipeline. Drive
    // it through its real interface and read the rendered row order back.
    loadFixtures();
    initListview();
    sortList('name');
    const asc = [...document.querySelectorAll('#listview tbody tr .sc a')].map(a => a.textContent);
    expect(asc.length).toBeGreaterThan(0);
    expect(asc).toEqual([...asc].sort((a, b) => a!.localeCompare(b!, 'no')));
    sortList('name');
    const desc = [...document.querySelectorAll('#listview tbody tr .sc a')].map(a => a.textContent);
    expect(desc).toEqual([...asc].reverse());
  });

  it('Sjanse sorts by what its cell shows: the band, then the best percentage, then n', () => {
    loadFixtures();
    initListview();
    S.myPoints = 40;
    S.listSort = { key: 'value', dir: -1 };
    sortList('chance');                    // a new column opens descending
    // read the order back off the rendered cells alone; the test page has no
    // stylesheet, so the three band colours are given to it here
    const bands = ['rgb(1, 1, 1)', 'rgb(2, 2, 2)', 'rgb(3, 3, 3)'];
    ['--dot-unlikely', '--dot-possible', '--good'].forEach((v, i) => document.documentElement.style.setProperty(v, bands[i]));
    sortList('name'); sortList('chance');
    const cells = [...document.querySelectorAll('#listview tbody .ch-cell')]
      .filter(c => c.querySelector('.k'))
      .map(c => {
        // «Mulig · 62 %» or «Mulig · 62 %, best av 3»
        const [p, n = 1] = c.textContent!.match(/\d+/g)!.map(Number);
        const bg = (c.querySelector('.k') as HTMLElement).getAttribute('style')!;
        return [bands.findIndex(b => bg.includes(b)), p, n];
      });
    expect(cells.length).toBeGreaterThan(50);
    const cmp = (a: number[], b: number[]) => { const i = a.findIndex((x, j) => x !== b[j]); return i < 0 ? 0 : a[i] - b[i]; };
    for (let i = 1; i < cells.length; i++) expect(cmp(cells[i - 1], cells[i]), `row ${i}`).toBeGreaterThanOrEqual(0);
    S.myPoints = null;
    ['--dot-unlikely', '--dot-possible', '--good'].forEach(v => document.documentElement.style.removeProperty(v));
  });
});
