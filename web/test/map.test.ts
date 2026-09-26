import { describe, it, expect, vi } from 'vitest';
import { loadFixtures, DATA, asker } from './fixtures';
import { stubMap } from './mapstub';
import {
  drawMarkers, renderClusters, visibleSchools, setLens, setLevels, onMapFylke, lensNoFigure, clusterMix, anyClusters,
  styleUrl, setMapStyle, isDark, prefersStill, laterPublished, panelFolds, foldPanel, unfoldPanel,
  renderPanelSum, initMap, createMap, aimTip, hideMapTip, byEl, buildMiniMap, dropMiniMap, hasWebGL, boundsOf, padBounds,
} from '../src/map';
import { closeSide, initSidebar, mapKeyed, openSide } from '../src/sidebar';
import { initHelpers, shownPrograms, levelScope, schoolPressure } from '../src/helpers';
import { initListview } from '../src/listview';
import { PREFS } from '../src/prefs';
import { renderPanel } from '../src/chrome';
import { t, CATS } from '../src/i18n';
import { S } from '../src/state';

const dots = () => [...document.querySelectorAll('#map .pk-dot')] as HTMLElement[];
const clusters = () => [...document.querySelectorAll('#map .pk-cluster')] as HTMLElement[];
const onMap = () => visibleSchools().filter((s: any) => s.lat);
// the stub's viewport is the whole country at zoom 5: every visible school is on screen
const shown = () => clusters().reduce((n, c) => n + Number(c.textContent), 0) + dots().length;
// the app's own map, built through the mocked engine: the listeners createMap
// registers (a move folds a fan-out back in) are live on the stub
const setup = () => { loadFixtures(); initHelpers(); initListview(); initMap(); createMap(); };

describe('the map layer', () => {
  it('shows every school the filters leave — as a dot or inside a cluster', () => {
    setup();
    drawMarkers();
    expect(shown()).toBe(onMap().length);
    expect(clusters().length).toBeGreaterThan(0);          // 190 schools at national zoom cluster
    expect(anyClusters()).toBe(true);                      // what the legend's zoom hint reads
    S.mapFylke = 'Oslo';
    drawMarkers();
    expect(shown()).toBe(onMap().length);
    expect(onMap().every((s: any) => s.fylke === 'Oslo')).toBe(true);
    S.mapCat = 'ST';
    drawMarkers();
    expect(shown()).toBe(onMap().length);
    expect(visibleSchools().every((s: any) => shownPrograms(s).some((p: any) => p.category === 'ST'))).toBe(true);
  });

  it('zoomed in, every school is its own dot, sized and coloured by its own pressure figure', () => {
    setup();
    S.mapFylke = 'Oslo';
    S.map!.jumpTo({ center: [10.75, 59.91], zoom: 11 });
    drawMarkers();
    expect(clusters().length).toBe(0);
    expect(anyClusters()).toBe(false);
    expect(dots().length).toBe(onMap().length);
    for (const el of dots()) {
      const rec = byEl.get(el)!, pr: any = schoolPressure(rec.s, 'all');
      const radius = Number(el.dataset.pkRadius);
      // the share that filled up drives the radius; everything else is a fixed size
      if (pr.kind === 'points') expect(radius).toBeCloseTo(7 + 5 * (pr.share ?? 0.5), 10);
      else expect([7.5, 8]).toContain(radius);
      // the box is the circle plus its stroke, which used to straddle the radius
      expect(parseFloat(el.style.width)).toBeGreaterThanOrEqual(2 * radius + 2);
      expect(el.dataset.pkBucket).toBe('none');            // no points entered
      expect(el.getAttribute('role')).toBe('button');
      expect(el.getAttribute('aria-label')).toContain(rec.s.name);
    }
  });

  it('with points entered every dot answers “can I get in”, and the cluster ring counts the same buckets', () => {
    setup();
    S.myPoints = 45;
    drawMarkers();
    for (const c of clusters()) {
      const mix = c.dataset.mix!.split(',').map(Number);
      expect(mix.reduce((a, b) => a + b, 0)).toBe(Number(c.textContent));
      expect(c.classList.contains('mix')).toBe(true);
      expect(c.style.getPropertyValue('--u')).toMatch(/%$/);
    }
    // clusterMix reads the reduced properties supercluster summed
    expect(clusterMix({ properties: { likely: 2, possible: 1, unlikely: 0, none: 3 } })).toEqual({ likely: 2, possible: 1, unlikely: 0, none: 3 });
    S.map!.jumpTo({ center: [10.75, 59.91], zoom: 11 });
    renderClusters();
    const bs = dots().map(el => el.dataset.pkBucket);
    expect(bs.every(b => ['likely', 'possible', 'unlikely', 'none'].includes(b!))).toBe(true);
    expect(bs.some(b => b !== 'none')).toBe(true);
  });

  it('a cluster no zoom can split fans its schools out, and the next move folds them back', () => {
    setup();
    // an isolated school (none other within ~17 km north–south / ~17 km east–west
    // at 60°N), with a second school moved onto its coordinates for this test
    const all = DATA.schools.filter((s: any) => s.lat);
    const far = (p: any, q: any) => Math.abs(p.lat - q.lat) > 0.15 || Math.abs(p.lon - q.lon) > 0.3;
    const a = all.find((s: any) => all.every((o: any) => o === s || far(s, o)));
    expect(a, 'no isolated school in the fixture').toBeTruthy();
    const b = all.find((s: any) => s !== a)!;
    const keep = [b.lat, b.lon];
    b.lat = a.lat; b.lon = a.lon;
    S.map!.jumpTo({ center: [a.lon, a.lat], zoom: 9 });     // the last zoom that clusters
    drawMarkers();
    // the pair sits at the stub's centre pixel (700, 450); supercluster's own
    // mean of two identical points lands a float's width off it
    const at = (el: HTMLElement) => (el.style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)$/) || []).slice(1).map(Number);
    const pair = clusters().find(c => { const [x, y] = at(c); return Math.abs(x - 700) < 1 && Math.abs(y - 450) < 1; });
    expect(pair).toBeTruthy();
    expect(pair!.textContent).toBe('2');
    pair!.focus();
    pair!.click();
    expect(pair!.hidden).toBe(true);
    const spread = dots().filter(el => [a, b].includes(byEl.get(el)!.s));
    expect(spread.length).toBe(2);
    expect(spread[0].style.transform).not.toBe(spread[1].style.transform);   // fanned apart
    // the cluster that held focus is display:none now: the fan-out takes both
    // the focus and the map's one tab stop, rather than dropping them on <body>
    expect(spread).toContain(document.activeElement as HTMLElement);
    expect(mapKeyed()).not.toContain(pair);
    expect(mapKeyed().filter((e: HTMLElement) => e.dataset.pkRove === '0')).toEqual([document.activeElement]);
    // the tooltip follows the dot out of the fan rather than staying over the
    // coordinate the two schools share: they sit at the map's centre pixel,
    // 2 × (18 + 4 × 2) px apart, and their tooltips stand exactly that far apart
    const tipEl = () => document.querySelector('#map .pk-tip') as HTMLElement;
    const tipAt = (el: HTMLElement) => { aimTip(byEl.get(el)!); return at(tipEl()); };
    const [tx0, ty0] = tipAt(spread[0]), [tx1, ty1] = tipAt(spread[1]);
    expect(tx0).toBe(tx1);
    expect(ty1 - ty0).toBe(52);
    hideMapTip();
    S.map!.fire('movestart');
    expect(pair!.hidden).toBe(false);
    expect(mapKeyed()).toContain(pair);
    expect(dots().filter(el => [a, b].includes(byEl.get(el)!.s)).length).toBe(0);
    // A cluster whose schools sit at different coordinates fans out too, once
    // no zoom can split it: at zoom 9 that is every cluster on the map, since
    // clustering stops at 10 (markercluster's own _zoomOrSpiderfy rule).
    const other = clusters().find(c => c !== pair)!;
    const before = new Set(dots());
    other.click();
    expect(S.map!.getZoom()).toBe(9);                  // it fanned out; nothing eased
    expect(other.hidden).toBe(true);
    const fanned = dots().filter(el => !before.has(el));
    expect(fanned.length).toBe(Number(other.textContent));
    expect(new Set(fanned.map(el => el.style.transform)).size).toBe(fanned.length);
    S.map!.fire('movestart');
    // Where a zoom does split a cluster, the click still zooms: from zoom 7 the
    // map eases to the zoom supercluster says that cluster breaks at, never
    // past the 10 where every school is its own dot.
    S.map!.jumpTo({ center: [10.75, 59.91], zoom: 7 });
    drawMarkers();
    const zooms = clusters().map(c => {
      c.click();
      const z = S.map!.getZoom();
      S.map!.fire('movestart');                        // folds a fan-out back in
      S.map!.jumpTo({ center: [10.75, 59.91], zoom: 7 });
      return z;
    });
    expect(zooms.some(z => z > 7)).toBe(true);
    expect(zooms.every(z => z === 7 || (z > 7 && z <= 10))).toBe(true);
    b.lat = keep[0]; b.lon = keep[1];
  });

  it('a cluster whose schools share a kommune names it in its label, never under the dot, and a tap still zooms in', () => {
    setup();
    S.mapFylke = 'Oslo';
    S.map!.jumpTo({ center: [10.75, 59.91], zoom: 7 });
    drawMarkers();
    const c = clusters().find(x => !x.hidden)!;
    expect(c).toBeTruthy();
    expect(c.dataset.place).toBe('Oslo');
    expect(c.textContent).toMatch(/^\d+$/);          // the count stays the element's own text
    const n = Number(c.textContent);
    expect(n).toBeGreaterThan(1);
    expect(c.getAttribute('aria-label')).toBe(t('clusterAria', n, null, 'Oslo'));
    // the tap does what it always did: zoom to where the cluster splits (the
    // owner's QA, 26 Sep 2026, preferred this to a list of the schools)
    c.click();
    expect(S.map!.getZoom()).toBeGreaterThan(7);
    expect(document.querySelector('#map ~ .modal:not([hidden]), .modal:not([hidden])')).toBe(null);
  });

  it('under a lens with no figure the dot says which state it is, not a bare dash', () => {
    setup();
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
    setup();
    openSide(asker());
    onMapFylke('Oslo');
    expect(S.mapFylke).toBe('Oslo');
    expect(S.current).toBeNull();                       // Asker is not in Oslo any more
    expect(shown()).toBe(onMap().length);
    expect(location.search).toContain('f=Oslo');
    expect(S.refitPending).toBe(true);                  // nothing to fit while the map is 0×0
    // a county that does not run the chosen lens widens rather than empty the map
    const missing = Object.keys(CATS).find(c => !DATA.schools.some((s: any) =>
      s.fylke === 'Oslo' && shownPrograms(s).some((p: any) => p.category === c)))!;
    expect(missing).toBeTruthy();
    S.mapCat = missing;
    onMapFylke('Oslo');
    expect(S.mapCat).toBe('all');
    onMapFylke('all');
    history.replaceState(null, '', '/');
  });

  it('the lens and the level scope are one switch each, and both redraw', () => {
    setup();
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
    expect(shown()).toBe(onMap().length);
    setLevels(false);
    expect(localStorage.getItem('pk-alllevels')).toBe('0');
    history.replaceState(null, '', '/');
  });

  it('the folded panel is a phone’s affordance, and unfolding puts the selects back', () => {
    setup();
    expect(panelFolds()).toBe(false);                   // happy-dom's window is 1024×768
    foldPanel(true);
    expect(document.body.classList.contains('panel-folded')).toBe(false);   // refused off a phone
    document.body.classList.add('panel-folded');
    unfoldPanel({ detail: 0 } as any);
    expect(document.body.classList.contains('panel-folded')).toBe(false);
    renderPanelSum();
    expect(document.getElementById('panel-sum-t')!.textContent).toContain(t('allCats'));
  });

  it('the basemap follows the theme, on the map and the minimap alike', () => {
    loadFixtures(); initHelpers(); initMap(); stubMap();
    PREFS.theme = 'light';
    expect(isDark()).toBe(false);
    expect(styleUrl()).toBe('/map/voyager.json');
    PREFS.theme = 'dark';
    expect(isDark()).toBe(true);
    expect(styleUrl()).toBe('/map/dark-matter.json');
    setMapStyle();
    expect(S.map!.getStyle()).toBe('/map/dark-matter.json');
    PREFS.theme = 'auto';
    // happy-dom answers every media query it does not model with "no": nothing
    // here asks for still motion, so the animated flights stay on
    expect(prefersStill()).toBe(false);
    createMap();
    expect((S.map as any)._opts.dragPan).toBe(true);
    // Leaflet stopped at its zoom 0, which is MapLibre's −1; MapLibre's own
    // default is −2, a whole zoom further out than the app ever showed
    expect((S.map as any)._opts.minZoom).toBe(-1);
    // A reader who does ask for it: MapLibre turns its own flights into jumps
    // (respectPrefersReducedMotion), but the fling after a drag is not a
    // flight, so createMap clamps that velocity to nothing itself.
    vi.spyOn(window, 'matchMedia').mockImplementation(((q: string) => ({ matches: /reduced-motion/.test(q) })) as any);
    expect(prefersStill()).toBe(true);
    createMap();
    expect((S.map as any)._opts.dragPan).toEqual({ maxSpeed: 0 });
    vi.restoreAllMocks();
  });

  it('every dot’s tooltip names the school, its figure and how many programme areas it has', () => {
    setup();
    S.mapFylke = 'Rogaland';
    S.map!.jumpTo({ center: [5.73, 58.97], zoom: 11 });
    drawMarkers();
    const tip = () => document.querySelector('#map .pk-tip') as HTMLElement;
    for (const el of dots()) {
      const rec = byEl.get(el)!;
      aimTip(rec);
      expect(tip().hidden).toBe(false);
      expect(tip().innerHTML).toContain(rec.s.name);
      expect(tip().innerHTML).toContain(t('tipHint'));
      expect(tip().className).toMatch(/pk-tip-(top|bottom|left|right)/);
    }
    hideMapTip(dots()[0]);                              // another dot's tip: left alone
    expect(tip().hidden).toBe(false);
    hideMapTip();
    expect(tip().hidden).toBe(true);
    // and under a lens it leads with the utdanningsprogram
    S.mapCat = 'ST';
    drawMarkers();
    for (const el of dots()) expect(byEl.get(el)!.html).toContain(CATS.ST[S.lang]);
  });

  it('a dot that clusters away under the pointer takes its tooltip with it', () => {
    setup();
    S.mapFylke = 'Rogaland';
    S.map!.jumpTo({ center: [5.73, 58.97], zoom: 11 });
    drawMarkers();
    const el = dots()[0], tip = () => document.querySelector('#map .pk-tip') as HTMLElement;
    aimTip(byEl.get(el)!);
    expect(tip().hidden).toBe(false);
    // zooming out clusters it away. Removing an element fires no mouseleave
    // and no blur, so nothing else can tell the tooltip its dot has gone
    S.map!.jumpTo({ center: [5.73, 58.97], zoom: 6 });
    S.map!.fire('moveend');                             // what createMap listens for
    expect(el.isConnected).toBe(false);
    expect(tip().hidden).toBe(true);
  });

  it('bounds come from [lat, lon] pairs and pad by a share of their span', () => {
    const b = boundsOf([[60, 10], [62, 12]]);
    expect([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]).toEqual([10, 60, 12, 62]);
    const p = padBounds(b, 0.5);
    expect([p.getWest(), p.getSouth(), p.getEast(), p.getNorth()]).toEqual([9, 59, 13, 63]);
  });

  it('the keys that walk the markers never reach the map underneath', () => {
    setup();
    initSidebar();                                      // the roving arrow-key handler
    S.mapFylke = 'Oslo';
    S.map!.jumpTo({ center: [10.75, 59.91], zoom: 11 });
    drawMarkers();
    // MapLibre's own keyboard handler listens for keydown on the canvas
    // container the pane hangs inside, whatever the event's target: an arrow
    // key panned the map 100px while focus walked to the next dot (folding any
    // fan-out and re-rendering the clusters under it), and + zoomed it.
    const heard: string[] = [];
    S.map!.getCanvasContainer().addEventListener('keydown', (ev: any) => heard.push(ev.key));
    const els = mapKeyed();
    expect(els.length).toBeGreaterThan(1);
    els[0].focus();
    const press = (key: string) => (document.activeElement as HTMLElement)
      .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    press('x');                                         // a key nobody handles still bubbles
    expect(heard).toEqual(['x']);
    heard.length = 0;
    press('ArrowRight');
    expect(document.activeElement).toBe(els[1]);        // focus moved, as it always did
    expect(heard).toEqual([]);                          // and the map heard nothing
    const z = S.map!.getZoom();
    press('+');
    expect(heard).toEqual([]);
    expect(S.map!.getZoom()).toBe(z);
    expect(document.activeElement).toBe(els[1]);
    // Enter still belongs to the dot: it opens the school's sheet
    press('Enter');
    expect(S.current).toBe(byEl.get(els[1])!.s);
    closeSide(true);
  });

  it('the minimap is a second, still map with a dot at its centre — or nothing without WebGL', () => {
    loadFixtures(); initHelpers(); initMap(); stubMap();
    document.body.insertAdjacentHTML('beforeend', '<div id="s-photo"><div id="s-minimap"></div></div>');
    expect(hasWebGL()).toBe(false);                     // happy-dom draws nothing
    buildMiniMap(asker());
    expect(document.getElementById('s-minimap')!.classList.contains('off')).toBe(true);
    expect(S.miniMap).toBeNull();
    // and where a browser can draw it, its canvas is named in the app's own
    // language: MapLibre's default name for that region is the English «Map»
    S.webgl = null;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ getExtension: () => null } as any);
    buildMiniMap(asker());
    expect((S.miniMap as any)._opts.locale['Map.Title']).toBe(t('viewMap'));
    vi.restoreAllMocks();
    dropMiniMap();
    document.getElementById('s-photo')!.remove();
  });
});
