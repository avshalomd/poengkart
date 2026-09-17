import { describe, it, expect } from 'vitest';
import { loadFixtures, DATA, asker } from './fixtures';
import { stubMap } from './mapstub';
import {
  drawMarkers, visibleSchools, setLens, setLevels, onMapFylke, lensNoFigure, clusterMix,
  tileUrl, setTiles, isDark, prefersStill, laterPublished, panelFolds, foldPanel, unfoldPanel,
  renderPanelSum, initMap,
} from '../src/map';
import { openSide } from '../src/sidebar';
import { initHelpers, shownPrograms, levelScope, schoolPressure } from '../src/helpers';
import { initListview } from '../src/listview';
import { PREFS } from '../src/prefs';
import { renderPanel } from '../src/chrome';
import { t, CATS } from '../src/i18n';
import type L from 'leaflet';
import { S } from '../src/state';

const markers = () => S.markerLayer!.getLayers() as L.CircleMarker[];
const onMap = () => visibleSchools().filter((s: any) => s.lat);

describe('the map layer', () => {
  it('draws one dot per school on screen, and the filters decide which', () => {
    loadFixtures(); initHelpers(); initListview(); initMap(); stubMap();
    drawMarkers();
    expect(markers().length).toBe(onMap().length);
    S.mapFylke = 'Oslo';
    drawMarkers();
    expect(markers().length).toBe(onMap().length);
    expect(onMap().every((s: any) => s.fylke === 'Oslo')).toBe(true);
    S.mapCat = 'ST';
    drawMarkers();
    expect(markers().length).toBe(onMap().length);
    expect(visibleSchools().every((s: any) => shownPrograms(s).some((p: any) => p.category === 'ST'))).toBe(true);
  });

  it('a dot’s size and colour come from the school’s own pressure figure', () => {
    loadFixtures(); initHelpers(); initListview(); initMap(); stubMap();
    S.mapFylke = 'Oslo';
    drawMarkers();
    for (const m of markers()) {
      const s = (m.options as any).pkSchool;
      const pr: any = schoolPressure(s, 'all');
      // the share that filled up drives the radius; everything else is a fixed size
      if (pr.kind === 'points') expect(m.options.radius).toBeCloseTo(7 + 5 * (pr.share ?? 0.5), 10);
      else expect([7.5, 8]).toContain(m.options.radius);
      expect((m.options as any).pkBucket).toBe('none');       // no points entered
      expect(m.getTooltip()).toBeTruthy();
    }
  });

  it('with points entered every dot answers “can I get in”, and the cluster ring counts the same buckets', () => {
    loadFixtures(); initHelpers(); initListview(); initMap(); stubMap();
    S.myPoints = 45;
    drawMarkers();
    const buckets = markers().map((m: any) => m.options.pkBucket);
    expect(buckets.length).toBe(onMap().length);
    expect(buckets.every((b: string) => ['likely', 'possible', 'unlikely', 'none'].includes(b))).toBe(true);
    expect(buckets.some((b: string) => b !== 'none')).toBe(true);
    // the cluster's mix is those same buckets, counted
    const kids = markers().slice(0, 12);
    const cluster: any = { getChildCount: () => kids.length, getAllChildMarkers: () => kids };
    const mix = clusterMix(cluster);
    expect(mix.likely + mix.possible + mix.unlikely + mix.none).toBe(kids.length);
    for (const b of ['likely', 'possible', 'unlikely', 'none']) {
      expect(mix[b]).toBe(kids.filter((m: any) => (m.options.pkBucket || 'none') === b).length);
    }
    const icon = (S.markerLayer!.options as any).iconCreateFunction(cluster);
    expect(icon.options.html).toContain(`>${kids.length}<`);
    expect(icon.options.html).toContain('data-mix="' + [mix.likely, mix.possible, mix.unlikely, mix.none].join(','));
  });

  it('under a lens with no figure the dot says which state it is, not a bare dash', () => {
    loadFixtures(); initHelpers(); initListview(); initMap(); stubMap();
    S.mapCat = 'ST';
    const s = DATA.schools.find((x: any) => {
      const scope = levelScope(x.programs).filter((p: any) => p.category === 'ST');
      if (!scope.length) return false;
      const yr = [...new Set(scope.flatMap((p: any) => Object.keys(p.values)) as string[])].sort().pop();
      const cells = scope.filter((p: any) => yr! in p.values).map((p: any) => p.values[yr!]);
      return cells.length && cells.every((v: any) => ['D', 'F', 'U'].includes(v));
    });
    expect(s, 'no school in the fixture has an all-D/F/U ST scope').toBeTruthy();
    const line = lensNoFigure(s);
    expect(line).toBe(line.toLowerCase());
    expect(line.length).toBeGreaterThan(0);
    expect([t('docAdm'), t('priority'), t('gone')].map(x => x.toLowerCase())
      .some(x => line.startsWith(x))).toBe(true);
  });

  it('picking a county redraws everything and remembers it in the address', () => {
    loadFixtures(); initHelpers(); initListview(); initMap(); stubMap();
    openSide(asker());
    onMapFylke('Oslo');
    expect(S.mapFylke).toBe('Oslo');
    expect(S.current).toBeNull();                       // Asker is not in Oslo any more
    expect(markers().length).toBe(onMap().length);
    expect(location.hash).toContain('f=Oslo');
    expect(S.refitPending).toBe(true);                  // nothing to fit while the map is 0×0
    // a county that does not run the chosen lens widens rather than empty the map
    const missing = Object.keys(CATS).find(c => !DATA.schools.some((s: any) =>
      s.fylke === 'Oslo' && shownPrograms(s).some((p: any) => p.category === c)))!;
    expect(missing).toBeTruthy();
    S.mapCat = missing;
    onMapFylke('Oslo');
    expect(S.mapCat).toBe('all');
    onMapFylke('all');
    location.hash = '';
  });

  it('the lens and the level scope are one switch each, and both redraw', () => {
    loadFixtures(); initHelpers(); initListview(); initMap(); stubMap();
    renderPanel();                                      // setLens writes into the select the panel fills
    setLens('ST');
    expect(S.mapCat).toBe('ST');
    expect((document.getElementById('map-cat') as HTMLSelectElement).value).toBe('ST');
    expect(document.getElementById('cat-note')!.textContent).toBe(t('catNote', visibleSchools().length));
    setLens('all');
    expect(laterPublished()).toBe(true);
    setLevels(true);
    expect(S.allLevels).toBe(true);
    expect(localStorage.getItem('pk-alllevels')).toBe('1');
    expect(markers().length).toBe(onMap().length);
    setLevels(false);
    expect(localStorage.getItem('pk-alllevels')).toBe('0');
    location.hash = '';
  });

  it('the folded panel is a phone’s affordance, and unfolding puts the selects back', () => {
    loadFixtures(); initHelpers(); initListview(); initMap(); stubMap();
    expect(panelFolds()).toBe(false);                   // happy-dom's window is 1024×768
    foldPanel(true);
    expect(document.body.classList.contains('panel-folded')).toBe(false);   // refused off a phone
    document.body.classList.add('panel-folded');
    unfoldPanel({ detail: 0 } as any);
    expect(document.body.classList.contains('panel-folded')).toBe(false);
    renderPanelSum();
    expect(document.getElementById('panel-sum-t')!.textContent).toContain(t('allCats'));
  });

  it('the basemap follows the theme', () => {
    loadFixtures(); initHelpers(); initMap(); stubMap();
    PREFS.theme = 'light';
    expect(isDark()).toBe(false);
    expect(tileUrl()).toContain('rastertiles/voyager');
    PREFS.theme = 'dark';
    expect(isDark()).toBe(true);
    expect(tileUrl()).toContain('dark_all');
    setTiles();
    expect(S.tileLayer).toBeTruthy();
    expect((S.tileLayer as any)._url).toBe(tileUrl());
    const old = S.tileLayer;
    setTiles();                                          // the old layer comes off first
    expect(S.tileLayer).not.toBe(old);
    expect((S.tileLayer as any)._url).toBe(tileUrl());
    PREFS.theme = 'auto';
    // happy-dom answers every media query it does not model with "no": nothing
    // here asks for still motion, so the animated flights stay on
    expect(prefersStill()).toBe(false);
  });

  it('every dot’s tooltip names the school, its figure and how many programme areas it has', () => {
    loadFixtures(); initHelpers(); initListview(); initMap(); stubMap();
    S.mapFylke = 'Rogaland';
    drawMarkers();
    for (const m of markers()) {
      const s = (m.options as any).pkSchool;
      const html = (m.getTooltip() as any)._content;
      expect(html).toContain(s.name);
      expect(html).toContain(t('tipHint'));
    }
    // and under a lens it leads with the utdanningsprogram
    S.mapCat = 'ST';
    drawMarkers();
    for (const m of markers()) {
      expect((m.getTooltip() as any)._content).toContain(CATS.ST[S.lang]);
    }
  });
});
