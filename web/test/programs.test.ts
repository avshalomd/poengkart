import { describe, it, expect } from 'vitest';
import { loadFixtures, DATA } from './fixtures';
import { stubMap } from './mapstub';
import { openSide } from '../src/sidebar';
import { renderList } from '../src/programs';
import { initHelpers, shownPrograms, visibleIn } from '../src/helpers';
import { t } from '../src/i18n';
import { S } from '../src/state';

/* The headline cell renderList() prints for a row: the newest cell that is not
   a fortrinnsrett quota, and 'F' when the newest cell of all is one (see the
   `orphan` branch in src/programs.ts). Finding a school by "some year holds
   this token" instead would pick rows whose printed state is a different one. */
function headline(p: any) {
  const ys = Object.keys(p.values).sort();
  let latestYear: string | null = null, lv: any;
  for (let i = ys.length - 1; i >= 0; i--) {
    if (p.values[ys[i]] !== 'F') { latestYear = ys[i]; lv = p.values[ys[i]]; break; }
  }
  return latestYear === null || p.values[ys[ys.length - 1]] === 'F' ? 'F' : lv;
}
const withState = (tok: any) =>
  DATA.schools.find((s: any) => shownPrograms(s).some((p: any) => headline(p) === tok));

describe('programme rows', () => {
  // the five states a cell can be printed as, with the i18n key the list uses
  // for each (src/programs.ts): never a number
  for (const [tok, key] of [['open', 'allIn'], ['F', 'priority'], ['D', 'docAdmShort'],
                            ['U', 'gone'], [0, 'noPointsShort']] as const) {
    it(`a ${tok} cell is printed as its official state, never as a number`, () => {
      loadFixtures(); initHelpers(); stubMap();
      // the widest scope: a fortrinnsrett-only row is history or a later year
      // in every county the fixture carries, so the Vg1 recent default has none
      S.allLevels = true; S.showOld = true;
      const s = withState(tok);
      expect(s, `no school in the fixture has a ${tok} headline cell`).toBeTruthy();
      openSide(s);
      const text = document.getElementById('s-list')!.textContent!;
      expect(text).toContain(t(key as any));
    });
  }

  it('renders one row per programme the panel counts, under its utdanningsprogram heading', () => {
    loadFixtures(); initHelpers(); stubMap();
    // a category with more than one row: a group of one named after its own
    // category is printed without a heading (the `solo` branch)
    const s = DATA.schools.find((x: any) => {
      const by: any = {};
      shownPrograms(x).forEach((p: any) => (by[p.category] = (by[p.category] || 0) + 1));
      return Object.values(by).some((n: any) => n > 1);
    });
    openSide(s);
    const rows = document.querySelectorAll('#s-list .prow');
    expect(rows.length).toBe(visibleIn(shownPrograms(s)));
    // every heading's count is the number of rows under it
    const heads = [...document.querySelectorAll('#s-list .cat-head[data-cat]')] as any[];
    expect(heads.length).toBeGreaterThan(0);
    let counted = 0;
    for (const h of heads) {
      const n = +h.querySelector('.cnt').textContent;
      expect(document.querySelectorAll(`#s-list .prow[data-cat="${h.dataset.cat}"]`).length).toBe(n);
      counted += n;
    }
    // a group of one named after its own category is printed without a heading
    expect(counted).toBeLessThanOrEqual(rows.length);
  });

  it('a lens puts a scope chip over the list and hides the rows outside it', () => {
    loadFixtures(); initHelpers(); stubMap();
    const s = DATA.schools.find((x: any) => new Set(shownPrograms(x).map((p: any) => p.category)).size > 2);
    openSide(s);
    const all = document.querySelectorAll('#s-list .prow').length;
    S.mapCat = shownPrograms(s)[0].category;
    renderList();
    expect(document.querySelector('#s-list .scope-chip')).toBeTruthy();
    expect(document.querySelector('#s-list .scope-all')!.textContent).toContain(t('scopeAll'));
    const inScope = document.querySelectorAll('#s-list .prow').length;
    expect(inScope).toBeLessThan(all);
    expect(inScope).toBe(visibleIn(shownPrograms(s).filter((p: any) => p.category === S.mapCat)));
  });

  it('a lens the school does not run says so instead of printing an empty list', () => {
    loadFixtures(); initHelpers(); stubMap();
    const s = DATA.schools.find((x: any) => !shownPrograms(x).some((p: any) => p.category === 'NA'));
    openSide(s);
    S.mapCat = 'NA';
    renderList();
    expect(document.querySelectorAll('#s-list .prow').length).toBe(0);
    expect(document.getElementById('s-list')!.textContent).toContain(t('noMatch'));
  });

  it('the later years are one disclosure away, and pressing it widens the scope', () => {
    loadFixtures(); initHelpers(); stubMap();
    const s = DATA.schools.find((x: any) => x.programs.some((p: any) => p.level !== 'Vg1')
                                         && x.programs.some((p: any) => p.level === 'Vg1'));
    openSide(s);
    const vg1Rows = document.querySelectorAll('#s-list .prow').length;
    const lv = document.querySelector('#s-list .lvnote') as any;
    expect(lv).toBeTruthy();
    lv.click();
    expect(S.allLevels).toBe(true);
    expect(document.querySelectorAll('#s-list .prow').length).toBeGreaterThan(vg1Rows);
    expect(document.querySelector('#s-list .lvnote')!.textContent).toBe(t('levelsShown'));
  });

  it('with points entered each row carries the chance chip for that programme', () => {
    loadFixtures(); initHelpers(); stubMap();
    const s = DATA.schools.find((x: any) => S.MODEL.schools[`${x.fylke}|${x.name}`]?.programs);
    S.myPoints = 45;
    openSide(s);
    const chips = document.querySelectorAll('#s-list .prow .ch');
    expect(chips.length).toBeGreaterThan(0);
    expect([...chips].every((c: any) => /%|Ingen historikk/.test(c.textContent))).toBe(true);
  });

  it('the + button on a row adds and removes that programme from the wishes', () => {
    loadFixtures(); initHelpers(); stubMap();
    openSide(DATA.schools.find((x: any) => shownPrograms(x).length > 1));
    const pick = document.querySelector('#s-list .prow .pick') as any;
    expect(pick.getAttribute('aria-pressed')).toBe('false');
    pick.click();
    expect(S.choices.length).toBe(1);
    expect((document.querySelector('#s-list .prow .pick') as any).getAttribute('aria-pressed')).toBe('true');
    (document.querySelector('#s-list .prow .pick') as any).click();
    expect(S.choices.length).toBe(0);
  });
});
