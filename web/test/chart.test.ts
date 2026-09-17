import { describe, it, expect } from 'vitest';
import { loadFixtures, DATA } from './fixtures';
import { stubMap } from './mapstub';
import { renderChartCard, drawChart, seriesFor } from '../src/chart';
import { openSide } from '../src/sidebar';
import { initHelpers, shownPrograms, isPoints, meanOf, fmt, chartMode, numericLatest } from '../src/helpers';
import { initListview } from '../src/listview';
import { t, CATS } from '../src/i18n';
import { S } from '../src/state';

// shownPrograms() is untyped, so the Set comes back as Set<unknown>; the keys are years
const years = (s: any) => [...new Set(shownPrograms(s).flatMap((p: any) => Object.keys(p.values)) as string[])].sort();
const plotted = () => [...document.querySelectorAll('#chart-svg svg polyline')];
const xLabels = () => [...document.querySelectorAll('#chart-svg svg text[text-anchor="middle"]')];

describe('the school chart', () => {
  it('the tabs name the three resolutions and mark the one in force', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    openSide(DATA.schools.find((s: any) => years(s).length > 5));
    const tabs = [...document.querySelectorAll('#tabs button')] as any[];
    expect(tabs.map(b => b.textContent)).toEqual([t('tabAll'), t('tabCat'), t('tabProg')]);
    expect(tabs.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.mode)).toEqual([chartMode()]);
    expect(document.getElementById('chart-cat')!.hidden).toBe(true);
  });

  it('draws the mean line over the school’s own years, one x label per year', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const s = DATA.schools.find((x: any) => years(x).length > 5);
    openSide(s);
    const own = years(s);
    const all = DATA.years.map(String);
    const win = all.filter(y => y >= own[0] && y <= own[own.length - 1]);
    expect(document.querySelector('#chart-svg svg')).toBeTruthy();
    expect(xLabels().map(e => e.textContent)).toEqual(win.map(y => y.slice(2)));
    // every programme with a numeric cell is a context line; the mean is one
    // more, and a series with a gap or a single point draws fewer than one
    const series = seriesFor('all', 'all', null);
    expect(series).toEqual(shownPrograms(s).filter((p: any) => Object.values(p.values).some(isPoints)));
    expect(plotted().length).toBeGreaterThan(0);
    expect(plotted().length).toBeLessThanOrEqual(series.length + 1);
    // the subline counts the plotted series against the rows the panel lists
    expect(document.getElementById('chart-sub')!.textContent)
      .toContain(String(series.length));
  });

  it('the newest point of the mean line is the hero’s own figure', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const s = DATA.schools.find((x: any) => years(x).length > 5);
    openSide(s);
    const yr = years(s)[years(s).length - 1];
    const mean = meanOf(shownPrograms(s).map((p: any) => p.values[yr]).filter(isPoints));
    expect(document.getElementById('s-hero')!.textContent).toContain(fmt(mean));
    // as many mean dots as years with a figure
    const withMean = years(s).filter(y =>
      shownPrograms(s).map((p: any) => p.values[y]).filter(isPoints).length).length;
    expect(document.querySelectorAll('#chart-svg svg circle').length).toBe(withMean);
  });

  it('one programme selected draws that row alone, labelled with its newest figure', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const s = DATA.schools.find((x: any) => years(x).length > 5);
    openSide(s);
    const p = shownPrograms(s).find((q: any) => numericLatest(q.values));
    S.chart.prog = p;
    renderChartCard();
    expect(chartMode()).toBe('prog');
    expect(document.getElementById('chart-sub')!.textContent).toContain(t('chartSubProg'));
    const l = numericLatest(p.values)!;
    expect(document.querySelector('#chart-svg svg text[font-weight="700"]')!.textContent).toBe(fmt(l[1]));
    S.chart.prog = null;
  });

  it('a lens the school runs narrows the chart and names the utdanningsprogram', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const s = DATA.schools.find((x: any) => years(x).length > 5
      && new Set(shownPrograms(x).map((p: any) => p.category)).size > 2);
    openSide(s);
    S.mapCat = shownPrograms(s)[0].category;
    renderChartCard();
    expect(chartMode()).toBe('cat');
    const cs = document.getElementById('chart-cat') as HTMLSelectElement;
    expect(cs.hidden).toBe(false);
    expect(cs.value).toBe(S.mapCat);
    expect([...cs.options].map(o => o.textContent)).toContain(CATS[S.mapCat][S.lang]);
    expect(document.getElementById('chart-sub')!.textContent)
      .toContain(String(seriesFor('cat', S.mapCat, null).length));
  });

  it('a single year is said in words instead of drawn as a chart', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const s = DATA.schools.find((x: any) => years(x).length === 1);
    expect(s).toBeTruthy();
    openSide(s);
    // the real behaviour: below two years there is no chart at all — not a
    // scatter of points, which is what a nine-column grid with one column
    // filled used to read as
    expect(document.getElementById('chart-svg')!.innerHTML).toBe('');
    expect(document.getElementById('chart-sub')!.textContent).toBe(t('oneYearOnly', years(s)[0]));
  });

  it('a selection with no threshold to plot says so rather than drawing a bare grid', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const s = DATA.schools.find((x: any) => years(x).length > 2
      && !shownPrograms(x).some((p: any) => Object.values(p.values).some(isPoints)));
    expect(s).toBeTruthy();
    openSide(s);
    expect(document.getElementById('chart-svg')!.innerHTML).toBe('');
    expect(document.getElementById('chart-sub')!.textContent).toBe(t('chartNoPoints'));
  });

  it('a lens the school does not run says «tilbys ikke her»', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const s = DATA.schools.find((x: any) => years(x).length > 5
      && !shownPrograms(x).some((p: any) => p.category === 'NA'));
    openSide(s);
    S.mapCat = 'NA';
    drawChart();
    expect(document.getElementById('chart-svg')!.innerHTML).toBe('');
    expect(document.getElementById('chart-sub')!.textContent).toBe(`${CATS.NA[S.lang]} · ${t('notOffered')}`);
  });

  it('reading along the line shows the year and the figure under the pointer', () => {
    loadFixtures(); initHelpers(); initListview(); stubMap();
    const s = DATA.schools.find((x: any) => years(x).length > 5);
    openSide(s);
    const svg = document.getElementById('the-chart')!;
    const tip = document.getElementById('chart-tip')!;
    expect(tip.style.display).toBe('none');
    svg.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 40, bubbles: true }));
    expect(tip.style.display).toBe('block');
    expect(tip.querySelector('.y')!.textContent).toMatch(/^20\d\d$/);
    expect(svg.querySelector('#xh')!.getAttribute('visibility')).toBe('visible');
    svg.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(tip.style.display).toBe('none');
    expect(svg.querySelector('#xh')!.getAttribute('visibility')).toBe('hidden');
  });
});
