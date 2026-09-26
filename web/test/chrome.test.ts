import { describe, it, expect } from 'vitest';
import { loadFixtures, DATA } from './fixtures';
import { stubMap } from './mapstub';
import { renderPanel, renderLegend, renderCatNote, forecastYears, levelChip, legendZoomHint, liftMapControls } from '../src/chrome';
import { renderPanelSum, visibleSchools, laterPublished } from '../src/map';
import { renderControls } from '../src/intro';
import { initHelpers, BIN_EDGES, shownSchools } from '../src/helpers';
import { t } from '../src/i18n';
import { S } from '../src/state';

describe('panel and legend', () => {
  it('the panel prints the dataset’s own scope and the county list with its school counts', () => {
    loadFixtures(); initHelpers(); stubMap(); renderControls(); renderPanel();
    const tag = document.getElementById('tagline')!.textContent!;
    // the header counts what the map shows: the fixture's two schools with
    // nothing since 2025 are hidden (shownSchools)
    expect(tag).toContain(String(shownSchools().length));
    expect(shownSchools().length).toBe(DATA.schools.length - 2);
    expect(tag).toContain(String(DATA.counties.length));
    const fsel = document.getElementById('map-fylke') as HTMLSelectElement;
    const oslo = [...fsel.options].find(o => o.value === 'Oslo')!;
    expect(oslo.textContent).toBe(`Oslo (${DATA.schools.filter((s: any) => s.fylke === 'Oslo' && s.lat).length})`);
    // the counties with no published figures are listed but unselectable
    expect(fsel.querySelector('optgroup option[disabled]')).toBeTruthy();
    expect(document.getElementById('cat-label')!.textContent).toBe(t('catLabel'));
  });

  it('the folded panel’s line names the county and the utdanningsprogram in force', () => {
    loadFixtures(); initHelpers(); stubMap(); renderControls(); renderPanel();
    // renderPanelSum() writes the selection, not a count: the school count is
    // the tagline's (whole dataset) and the category note's (this lens)
    const sum = () => document.getElementById('panel-sum-t')!.textContent!;
    expect(sum()).toContain(t('allFylker'));
    expect(sum()).toContain(t('allCats'));
    S.mapFylke = 'Oslo'; renderPanelSum();
    expect(sum()).toContain('Oslo');
    // the scope rides on the line only when it is not the Vg1 default, and
    // only where the counties on screen publish a later year at all
    S.mapFylke = 'all'; S.allLevels = true;
    expect(laterPublished()).toBe(true);        // the precondition: Vg2/Vg3 exist on screen
    renderPanelSum();
    expect(sum()).toContain(t('levelsChipAll'));
  });

  it('the category note counts exactly the schools the map keeps under that lens', () => {
    loadFixtures(); initHelpers(); stubMap(); renderControls(); renderPanel();
    renderCatNote();
    expect(document.getElementById('cat-note')!.textContent).toBe('');   // no lens, no note
    const sel = document.getElementById('map-cat') as HTMLSelectElement;
    S.mapCat = sel.options[1].value; renderCatNote();
    const note = document.getElementById('cat-note')!.textContent!;
    expect(note.length).toBeGreaterThan(0);
    expect(note).toBe(t('catNote', visibleSchools().length));
  });

  it('the legend shows the threshold bins without points and the three chance bands with them', () => {
    loadFixtures(); initHelpers(); stubMap(); renderLegend();
    const bins = document.getElementById('legend-bins')!;
    expect(bins.children.length).toBe(BIN_EDGES.length);
    // BIN_EDGES[0] is "<30": escaped, it reads back as text, not as a tag
    expect(bins.textContent).toContain(BIN_EDGES[0]);
    expect(bins.textContent).toContain(BIN_EDGES[1]);
    expect(bins.textContent).toContain(BIN_EDGES[BIN_EDGES.length - 1]);
    expect(document.getElementById('legend-title')!.textContent).toContain(t('legendAll'));
    expect(document.getElementById('legend-open')!.parentElement!.hidden).toBe(false);
    S.myPoints = 45; renderLegend();
    expect(bins.children.length).toBe(3);
    expect(bins.textContent).toContain(t('bandLabel', 'likely'));
    expect(document.getElementById('legend-title')!.textContent)
      .toContain(t('legendChance', '45,0', forecastYears(visibleSchools())));
    // "no waiting list" and "filled without points" are not dot states any more
    expect(document.getElementById('legend-open')!.parentElement!.hidden).toBe(true);
  });

  it('the legend names the lens, and the level chip follows the scope', () => {
    loadFixtures(); initHelpers(); stubMap();
    S.mapCat = 'ST'; renderLegend();
    expect(document.getElementById('legend-title')!.textContent).toContain(t('legendCat', 'ST'));
    expect(levelChip()).toContain('Vg1');
    S.allLevels = true;
    expect(levelChip()).toContain(t('levelsChipAll'));
  });

  it('the mixed-rounds warning appears exactly when the selection spans intake rounds', () => {
    loadFixtures(); initHelpers(); stubMap();
    S.mapFylke = 'all'; renderLegend();
    const rounds = new Set(visibleSchools().map((s: any) => s.round).filter(Boolean));
    const unknown = visibleSchools().some((s: any) => !s.round);
    expect(document.getElementById('legend-mixed')!.hidden).toBe(!(rounds.size > 1 || (rounds.size && unknown)));
    expect(document.getElementById('legend-mixed')!.textContent).toBe(t('mixedRounds'));
  });

  it('the zoom hint only speaks in chance mode, and lifting the controls sets the panel’s reserve', () => {
    loadFixtures(); initHelpers(); stubMap(); renderLegend();
    legendZoomHint();
    expect(document.getElementById('legend-zoom')!.hidden).toBe(true);   // no clusters on screen here
    expect(document.getElementById('legend-zoom')!.textContent).toBe(t('legendZoomHint'));
    liftMapControls();
    expect(document.documentElement.style.getPropertyValue('--panel-reserve')).toMatch(/px$/);
  });
});
