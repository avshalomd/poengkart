import { describe, it, expect } from 'vitest';
import { loadFixtures } from './fixtures';
import { sortList, deltaFor, initListview } from '../src/listview';
import { meanStep } from '../src/helpers';
import { S } from '../src/state';

describe('list view', () => {
  it('meanStep is the change between the two newest years the mean line actually plots', () => {
    // meanStep(progs) takes an array of programme rows directly (not a
    // pre-built values object), and returns {latest, prev, mean, meanPrev, d}.
    expect(meanStep([{ values: { '2024': 38, '2025': 40, '2026': 42.5 } }] as any).d).toBeCloseTo(2.5, 6);
    expect(meanStep([{ values: { '2026': 42.5 } }] as any).d).toBeNull();
    expect(meanStep([{ values: { '2025': 'open', '2026': 42.5 } }] as any).d).toBeNull();
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
