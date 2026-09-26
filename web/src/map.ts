import { LngLatBounds, Map as GLMap } from 'maplibre-gl';
import type { IControl } from 'maplibre-gl';
import Supercluster from 'supercluster';
import { framePad } from "./boot";
import { bucketColor, bucketOf, chanceMode, pct, schoolChance } from "./chance";
import { legendZoomHint, renderCatNote, renderLegend, renderPanel } from "./chrome";
import { colorFor, cssVar, esc, fmt, HELD_OUT, isVg1, levelScope, progName, schoolPressure, shownPrograms, visibleCount, yearSpan, zeroLabel } from "./helpers";
import { CATS, t } from "./i18n";
import { EASE, play } from "./motion";
import { say } from "./tips";
import { renderListView } from "./listview";
import { PREFS } from "./prefs";
import { syncUrl } from './router';
import { closeSide, mapKeyed, openSide, renderSide } from "./sidebar";
import { S } from './state';
import type { School } from './types';

/* ================= map ================= */

export const isDark = () => PREFS.theme === 'dark' ||
  (PREFS.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
export const prefersStill = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The map is MapLibre GL drawing CARTO's vector tiles (stage 4). It needs
// WebGL2; a browser without it gets the list view (boot). The probe runs once.
export function hasWebGL() {
  if (S.webgl === null) {
    try {
      const ctx = document.createElement('canvas').getContext('webgl2');
      S.webgl = !!ctx;
      // a probe context counts against the browser's handful of live ones:
      // hand it back before the map asks for its own
      ctx?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch (e) { S.webgl = false; }
  }
  return S.webgl;
}
// Light mode is CARTO Voyager rather than Positron: the same pale land, but
// with tinted water and parks, so the map has some colour and the glass has
// something to show through. The two styles are pinned copies under
// web/public/map (tools/vendor-map-styles.mjs); the key rides in them.
export const styleUrl = () => isDark() ? '/map/dark-matter.json' : '/map/voyager.json';
export function setMapStyle() {
  S.map?.setStyle(styleUrl());
  S.miniMap?.setStyle(styleUrl());
}

// MapLibre's zoom is Leaflet's minus one (512px tiles): the numbers below and
// in boot, searchov and locate are one lower than the app used before stage 4.
const CLUSTER_MAX_ZOOM = 9;   // clusters up to here; from zoom 10 every school is its own dot
const MAX_ZOOM = 18;
const MIN_ZOOM = -1;          // Leaflet's 0

// [lat, lon] pairs, as the data gives them
export function boundsOf(pts: [number, number][]) {
  const b = new LngLatBounds([pts[0][1], pts[0][0]], [pts[0][1], pts[0][0]]);
  for (const [lat, lon] of pts) b.extend([lon, lat]);
  return b;
}
export function padBounds(b: LngLatBounds, f: number) {
  const dx = (b.getEast() - b.getWest()) * f, dy = (b.getNorth() - b.getSouth()) * f;
  return new LngLatBounds([b.getWest() - dx, b.getSouth() - dy], [b.getEast() + dx, b.getNorth() + dy]);
}
const visiblePts = () => visibleSchools().filter(s => s.lat).map(s => [s.lat, s.lon] as [number, number]);

export function createMap() {
  const container = document.getElementById('map')!;
  S.map = new GLMap({
    // minZoom −1 is Leaflet's 0: MapLibre's own default is −2, a whole zoom
    // further out than the app ever showed (the world twice over on one screen)
    container, style: styleUrl(), maxZoom: MAX_ZOOM, minZoom: MIN_ZOOM,
    attributionControl: { compact: false },
    bounds: S.HOME!, fitBoundsOptions: { padding: framePad() },
    // the canvas is a region a screen reader lands in: name it in the app's
    // language from the first paint, not from updateMapLabels a tick later
    locale: { 'Map.Title': t('viewMap') },
    // MapLibre itself turns every flight into a jump under reduced motion
    // (respectPrefersReducedMotion); the tile fade is the one thing it keeps
    fadeDuration: prefersStill() ? 0 : 300,
    // …and the fling after a drag is the other: the inertia handler is not a
    // flight, so the preference never reaches it. maxSpeed 0 clamps the drag
    // velocity to nothing, so the map stops where the finger does — Leaflet's
    // `inertia: false`. The other inertia options keep their defaults.
    dragPan: prefersStill() ? { maxSpeed: 0 } : true,
  });
  S.map.addControl(zoomControl(), 'bottom-right');
  S.map.on('move', positionPane);
  S.map.on('movestart', () => { unspider(); endWave(); });
  S.map.on('moveend', () => { renderClusters(); });
  S.map.on('zoom', () => { if (S.loc) sizeLocRing(); });
  // a blocked tile host is a blank map with the dots still on it, as before;
  // say so once in the console rather than once per tile
  const seen = new Set<string>();
  S.map.on('error', e => {
    const msg = String((e as any)?.error?.message || e);
    if (!seen.has(msg)) { seen.add(msg); console.error('map:', msg); }
  });
}
export function fitHome(animate: boolean) {
  S.map!.fitBounds(S.HOME!, { padding: framePad(), animate });
}
// the schools the filters leave, framed; false when there is nothing to frame
export function fitVisible(animate: boolean) {
  const pts = visiblePts();
  if (!pts.length) return false;
  S.map!.fitBounds(padBounds(boundsOf(pts), 0.08), { padding: framePad(), animate, duration: 600 });
  return true;
}
export function viewSchool(s: School, zoom: number, animate = true) {
  const to = { center: [s.lon, s.lat] as [number, number], zoom };
  if (animate && !prefersStill()) S.map!.flyTo(to); else S.map!.jumpTo(to);
}
// Bring a school into the strip between the panel and a sheet beside the map
// (openSide): pan by just enough that its point clears the paddings.
export function panSchoolInside(s: School, left: number) {
  const m = S.map!, pt = m.project([s.lon, s.lat]), c = m.getContainer();
  const W = c.clientWidth, H = c.clientHeight, pad = { left, top: 24, right: 24, bottom: 24 };
  const dx = pt.x < pad.left ? pad.left - pt.x : pt.x > W - pad.right ? W - pad.right - pt.x : 0;
  const dy = pt.y < pad.top ? pad.top - pt.y : pt.y > H - pad.bottom ? H - pad.bottom - pt.y : 0;
  if (dx || dy) m.panBy([-dx, -dy], { animate: !prefersStill() });
}
export function resizeMap() { S.map?.resize(); }
export const mapZoom = () => S.map ? S.map.getZoom() : 0;
// run fn once any flight in progress has landed
export function onceSettled(fn: () => void) {
  if (S.map && S.map.isMoving()) S.map.once('moveend', fn); else fn();
}

/* ---------- controls ---------- */
// The app's own zoom buttons: MapLibre's are fixed-colour SVG backgrounds
// that cannot take the glass chrome's ink colour. Labelled by updateZoomAria.
export function zoomControl(): IControl {
  let div: HTMLElement;
  return {
    onAdd(map) {
      div = document.createElement('div');
      div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
      for (const [cls, glyph, fn] of [['pk-zoom-in', '+', () => map.zoomIn()], ['pk-zoom-out', '−', () => map.zoomOut()]] as const) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = `pk-zoom ${cls}`; b.textContent = glyph;
        b.addEventListener('click', fn);
        div.appendChild(b);
      }
      return div;
    },
    onRemove() { div.remove(); },
  };
}

/* ---------- the pane: dots, clusters, tooltip, location ---------- */
// Every dot, cluster, the tooltip and the position marker are HTML elements
// in one pane over the canvas, moved with map.project() on every `move` — as
// Leaflet moved its SVG. Nothing here depends on the style, so a blocked tile
// host leaves the schools drawn on a blank map.
export type Rec = { el: HTMLElement; s: School; lngLat: [number, number]; line: string; html: string; bucket: string };
type Placed = { el: HTMLElement; lngLat: [number, number]; dx: number; dy: number };
let pane: HTMLElement | null = null;
let tip: HTMLElement | null = null;
let index: Supercluster | null = null;
const recs = new Map<School, Rec>();                    // every visible school's dot, built by drawMarkers
export const byEl = new WeakMap<Element, Rec>();        // a dot's element → its record (sidebar's closeSide)
const clusterEls = new Map<number, HTMLElement>();      // cluster_id → its element, for this index
const clusterOf = new WeakMap<Element, any>();          // a cluster's element → its feature
let placed: Placed[] = [];                              // what the pane shows now, with any fan-out offset
let spread: { id: number; els: HTMLElement[] } | null = null;
let tipRec: Rec | null = null;
let tipAt = { dir: 'top', dx: 0 };

function getPane() {
  if (pane && pane.isConnected) return pane;
  pane = document.createElement('div');
  pane.className = 'pk-pane';
  tip = document.createElement('div');
  tip.className = 'pk-tip tip pk-tip-top';
  tip.hidden = true;
  pane.appendChild(tip);
  // The pane hangs inside the canvas container, and MapLibre's KeyboardHandler
  // listens for keydown on exactly that element, whatever the event's target:
  // + and − on a focused dot or cluster zoomed the map underneath, and the zoom
  // then re-rendered the dot the reader was standing on. Leaflet's keyboard
  // handler only acted while its container itself held focus. Enter, Space and
  // Escape are the dot's own and travel on. (The arrow keys are stopped where
  // they are handled, in the sidebar's capture listener.)
  pane.addEventListener('keydown', ev => {
    if (['+', '-', '=', '_'].includes(ev.key)) ev.stopPropagation();
  });
  S.map!.getCanvasContainer().appendChild(pane);
  return pane;
}
function setPos(el: HTMLElement, lngLat: [number, number], dx = 0, dy = 0) {
  const p = S.map!.project(lngLat);
  el.style.transform = `translate(-50%,-50%) translate(${p.x + dx}px,${p.y + dy}px)`;
}
function positionPane() {
  if (!S.map) return;
  for (const p of placed) setPos(p.el, p.lngLat, p.dx, p.dy);
  if (tipRec && tip && !tip.hidden) placeTip(tipRec);
}

// A cluster's schools counted by the rule that colours their dots: the bucket
// of each school's best chance, or none without a forecast. supercluster sums
// them (map/reduce below), so the ring and the spoken label read the dots' own
// numbers and cannot disagree with them.
export function clusterMix(f) {
  const p = f.properties;
  return { likely: p.likely || 0, possible: p.possible || 0, unlikely: p.unlikely || 0, none: p.none || 0 };
}
export const anyClusters = () => !!pane && !!pane.querySelector('.pk-cluster:not([hidden])');

function clusterEl(f) {
  const n = f.properties.point_count, size = n < 10 ? 32 : n < 30 ? 38 : 44;
  const el = document.createElement('div');
  el.className = `pk-cluster${n >= 30 ? ' big' : ''}${chanceMode() ? ' mix' : ''}`;
  el.style.width = el.style.height = size + 'px';
  if (chanceMode()) {
    const x = clusterMix(f), at = k => `${(100 * k / n).toFixed(2)}%`;
    el.dataset.mix = `${x.likely},${x.possible},${x.unlikely},${x.none}`;
    el.style.setProperty('--l', at(x.likely));
    el.style.setProperty('--p', at(x.likely + x.possible));
    el.style.setProperty('--u', at(x.likely + x.possible + x.unlikely));
  }
  el.textContent = String(n);
  const pl = clusterPlace(f);
  if (pl) el.dataset.place = pl.label;
  el.addEventListener('click', () => expandCluster(f));
  el.addEventListener('dblclick', ev => ev.stopPropagation());
  clusterOf.set(el, f);
  return el;
}
const clusterSchools = (f): School[] => index!.getLeaves(f.properties.cluster_id, Infinity).map(l => l.properties.school);
// The name under a cluster: its schools' kommune when they share one, or the
// kommune of two in three of them with «m.fl.»; none for a mixed bag, where
// any one name would mislead. The count stays the element's own text.
function clusterPlace(f): { name: string; label: string; all: boolean } | null {
  const ss = clusterSchools(f), by = new Map<string, number>();
  for (const s of ss) if (s.kommune) by.set(s.kommune, (by.get(s.kommune) || 0) + 1);
  const [name, k] = [...by].sort((a, b) => b[1] - a[1])[0] || [];
  if (!name || 3 * k! < 2 * ss.length) return null;
  const all = k === ss.length;
  return { name, all, label: all ? name : t('clusterMore', name) };
}
// Click or Enter on a cluster: zoom to where it splits. A cluster no zoom
// splits — supercluster answers maxZoom + 1, the zoom at which clustering is
// off altogether — fans its schools out round the point instead. That is
// markercluster's own rule (_zoomOrSpiderfy): spiderfy the cluster that
// survives to the last clustered zoom, whether its schools share a coordinate
// or merely sit inside the 44px radius wherever the map can go.
function expandCluster(f) {
  const id = f.properties.cluster_id;
  const zx = index!.getClusterExpansionZoom(id);
  if (zx > CLUSTER_MAX_ZOOM) spider(f);
  else S.map!.easeTo({ center: f.geometry.coordinates, zoom: zx });
}
function spider(f) {
  unspider();
  const id = f.properties.cluster_id;
  const leaves = index!.getLeaves(id, Infinity);
  const n = leaves.length, r = 18 + 4 * n, pn = getPane();
  const els: HTMLElement[] = [];
  leaves.forEach((l, i) => {
    const rec = recs.get(l.properties.school)!;
    const a = 2 * Math.PI * i / n - Math.PI / 2;
    placed.push({ el: rec.el, lngLat: rec.lngLat, dx: Math.round(r * Math.cos(a)), dy: Math.round(r * Math.sin(a)) });
    pn.appendChild(rec.el);
    els.push(rec.el);
  });
  const cel = clusterEls.get(id);
  // The cluster is about to be display:none, and a hidden element holds
  // neither focus nor a tab stop: hand both to the first school of the fan-out
  // before it goes, rather than let the browser drop focus on <body> and the
  // map lose its only tab stop. (labelMarkers then roves from the focused one.)
  const held = !!cel && document.activeElement === cel;
  if (cel) cel.hidden = true;
  spread = { id, els };
  positionPane();
  if (held) els[0]?.focus({ preventScroll: true });
  S.labelMarkers();
}
function unspider() {
  if (!spread) return;
  for (const el of spread.els) { hideMapTip(el); el.remove(); placed = placed.filter(p => p.el !== el); }
  const cel = clusterEls.get(spread.id);
  if (cel) cel.hidden = false;
  spread = null;
}
// What the viewport (padded by half its size) holds at this zoom: a cluster
// per group, a school's own dot otherwise. Runs after drawMarkers and on
// every moveend — the moment markercluster's `animationend` used to mark.
export function renderClusters() {
  if (!S.map || !index) return;
  const pn = getPane();
  unspider();
  const b = S.map.getBounds(), z = Math.floor(S.map.getZoom());
  const w = b.getEast() - b.getWest(), h = b.getNorth() - b.getSouth();
  const bbox: [number, number, number, number] = [
    b.getWest() - w / 2, Math.max(-90, b.getSouth() - h / 2), b.getEast() + w / 2, Math.min(90, b.getNorth() + h / 2)];
  const keep = new Set<HTMLElement>();
  const next: Placed[] = [];
  // the reader's own position is not one of the index's points: it stays put
  // through every re-render, at its own coordinate
  for (const p of placed) if (p.el === locDot || p.el === locRing) { keep.add(p.el); next.push(p); }
  for (const f of index.getClusters(bbox, z)) {
    let el: HTMLElement;
    if (f.properties.cluster) {
      el = clusterEls.get(f.properties.cluster_id) || clusterEl(f);
      clusterEls.set(f.properties.cluster_id, el);
    } else {
      el = recs.get(f.properties.school)!.el;
    }
    keep.add(el);
    if (!el.isConnected) pn.appendChild(el);
    next.push({ el, lngLat: f.geometry.coordinates as [number, number], dx: 0, dy: 0 });
  }
  // Removing an element fires neither mouseleave nor blur, so a dot that
  // clusters away under the pointer left its tooltip floating over empty map
  // (Leaflet closed a marker's tooltip when the marker left the map).
  for (const p of placed) if (!keep.has(p.el)) { hideMapTip(p.el); p.el.remove(); }
  placed = next;
  positionPane();
  S.labelMarkers();
  legendZoomHint();
}

/* ---------- tooltip ---------- */
// Where the dot actually is: its coordinate, plus the offset a fan-out gave
// it. Aimed at the coordinate alone, the tooltip of a fanned-out school stood
// 26-58px away from the dot the reader was pointing at, over the cluster's
// centre — arrow and all.
function pointOf(rec: Rec) {
  const p = S.map!.project(rec.lngLat), o = placed.find(q => q.el === rec.el);
  return o ? { x: p.x + o.dx, y: p.y + o.dy } : p;
}
// A tooltip reads 180-480px wide, and at a fixed 'top' it slid under the panel
// for a school near the panel's edge (at 1280px the whole of Bergen's west
// side) or past the map's edge. Try each side, slide top and bottom sideways,
// and keep the placement that hides the least of it.
function placeTip(rec: Rec) {
  const pt = pointOf(rec), w = tip!.offsetWidth, h = tip!.offsetHeight;
  const { dir, dx } = tipAt;
  const x = dir === 'right' ? pt.x + 16 : dir === 'left' ? pt.x - 16 - w : pt.x - w / 2 + dx;
  const y = dir === 'top' ? pt.y - 16 - h : dir === 'bottom' ? pt.y + 16 : pt.y - h / 2;
  tip!.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
}
export function aimTip(rec: Rec, wrapTo = 0) {
  if (!S.map || !tip) return;
  if (tipRec !== rec || tip.hidden) { tipRec = rec; tip.innerHTML = rec.html; tip.hidden = false; }
  const wrap = el => { el.style.maxWidth = wrapTo ? wrapTo + 'px' : ''; el.style.whiteSpace = wrapTo ? 'normal' : ''; };
  wrap(tip);
  const c = S.map.getContainer();
  const w = tip.offsetWidth, h = tip.offsetHeight, W = c.clientWidth, H = c.clientHeight;
  const pt = pointOf(rec);
  const mr = c.getBoundingClientRect(), pr = document.getElementById('panel')!.getBoundingClientRect();
  const pn = S.view === 'map' && pr.width ? { l: pr.left - mr.left, t: pr.top - mr.top, r: pr.right - mr.left, b: pr.bottom - mr.top } : null;
  const span = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const lost = (x, y) => w * h - span(x, x + w, 0, W) * span(y, y + h, 0, H)
    + (pn ? span(x, x + w, pn.l, pn.r) * span(y, y + h, pn.t, pn.b) : 0);
  const cands: { dir: string; dx: number; lost: number }[] = [];
  for (const dir of ['top', 'bottom']) {
    const y = dir === 'top' ? pt.y - 16 - h : pt.y + 16, x0 = pt.x - w / 2;
    const lo = pn && span(y, y + h, pn.t, pn.b) ? pn.r + 8 : 8, hi = W - 8 - w;
    const room = Math.max(0, w / 2 - 18);            // the arrow stays on the box
    const dx = Math.round(Math.max(-room, Math.min(room, Math.min(Math.max(x0, lo), Math.max(lo, hi)) - x0)));
    cands.push({ dir, dx, lost: lost(x0 + dx, y) });
  }
  cands.push({ dir: 'right', dx: 0, lost: lost(pt.x + 16, pt.y - h / 2) });
  cands.push({ dir: 'left', dx: 0, lost: lost(pt.x - 16 - w, pt.y - h / 2) });
  const least = Math.min(...cands.map(c => c.lost));
  const pick = cands.find(c => c.lost <= least + 1)!;
  // No side has room: at Ekstra stor with a sheet open, the 480px chance
  // tooltip met a 449px strip between the panel and the sheet and lost 33px
  // whichever way it went. Wrap it to the strip and aim again.
  const free = Math.floor(W - 8 - Math.max(8, pn ? pn.r + 8 : 8));
  if (pick.lost > 0 && !wrapTo && free >= 200 && free < w) return aimTip(rec, free);
  tipAt = { dir: pick.dir, dx: pick.dx };
  tip.className = `pk-tip tip pk-tip-${pick.dir}`;
  tip.style.setProperty('--ax', -pick.dx + 'px');
  placeTip(rec);
}
export function showMapTip(rec: Rec) { aimTip(rec); }
// hide the tooltip — or, given an element, only if it is that dot's
export function hideMapTip(el?: Element) {
  if (!tip || tip.hidden) return;
  if (el && byEl.get(el) !== tipRec) return;
  tip.hidden = true; tipRec = null;
}

/* ---------- the reader's position ---------- */
let locDot: HTMLElement | null = null, locRing: HTMLElement | null = null;
const metresPerPixel = (lat: number, zoom: number) => 40075016.686 * Math.cos(lat * Math.PI / 180) / (512 * Math.pow(2, zoom));
function sizeLocRing() {
  if (!S.loc || !locRing || !S.map) return;
  const d = Math.round(2 * S.loc.acc / metresPerPixel(S.loc.lat, S.map.getZoom()));
  locRing.style.width = locRing.style.height = d + 'px';
}
export function showLocation(lat: number, lon: number, acc: number) {
  hideLocation();
  S.loc = { lat, lon, acc };
  const pn = getPane();
  locRing = document.createElement('div'); locRing.className = 'pk-loc-ring';
  locDot = document.createElement('div'); locDot.className = 'pk-loc';
  pn.append(locRing, locDot);
  placed.push({ el: locRing, lngLat: [lon, lat], dx: 0, dy: 0 }, { el: locDot, lngLat: [lon, lat], dx: 0, dy: 0 });
  sizeLocRing();
  positionPane();
}
export function hideLocation() {
  for (const el of [locDot, locRing]) if (el) { el.remove(); placed = placed.filter(p => p.el !== el); }
  locDot = locRing = null;
  S.loc = null;
}

/* ---------- minimap ---------- */
// the location map in the photo header: a school with no photo, or a photo
// whose upstream URL has since died
export function dropMiniMap() {
  if (S.miniMapRO) { S.miniMapRO.disconnect(); S.miniMapRO = null; }
  if (S.miniMap) { S.miniMap.remove(); S.miniMap = null; }
}
export function buildMiniMap(s: School) {
  dropMiniMap();
  const c = document.getElementById('s-minimap');
  if (!c) return;
  if (!hasWebGL()) { c.classList.add('off'); return; }
  S.miniMap = new GLMap({
    container: c, style: styleUrl(), center: [s.lon, s.lat], zoom: 15,
    interactive: false, attributionControl: false, fadeDuration: 0,
    // its canvas is named too, or the sheet's location map answered a screen
    // reader in English («Map») where the rest of the page speaks Norwegian
    locale: { 'Map.Title': t('viewMap') },
  });
  const dot = document.createElement('div');
  dot.className = 'pk-minidot';          // centred by CSS: the map keeps its centre on resize
  S.miniMap.getCanvasContainer().appendChild(dot);
  // the phone sheet is still sliding in when the map is built, so a single
  // deferred redraw left tiles on a fifth of the box; redraw on every resize
  S.miniMapRO = new ResizeObserver(() => S.miniMap && S.miniMap.resize());
  S.miniMapRO.observe(c);
}

// Under a lens with no figure in its newest year, the reason, as the sheet
// gives it: a bare «–» said nothing about a lens that is admission by
// documentation, fortrinnsrett or discontinued.
export function lensNoFigure(s) {
  const scope = levelScope(s.programs).filter(p => p.category === S.mapCat);
  const yr = ([...new Set(scope.flatMap(p => Object.keys(p.values)))].sort().pop()
    || S.DATA!.years[S.DATA!.years.length - 1]) as string | number;
  const cells = scope.filter(p => yr in p.values).map(p => p.values[yr]);
  const all = set => cells.length && cells.every(v => set.includes(v));
  if (cells.includes('D') && all(['D', 'F', 'U'])) return `${t('docAdm').toLowerCase()} (${yr})`;
  if (all(['F'])) return `${t('priority').toLowerCase()} (${yr})`;
  if (all(['U', 'F'])) return `${t('gone').toLowerCase()} (${yr})`;
  return t('tipNoData', yr).toLowerCase();
}

/* ---------- the dots ---------- */
// Points arriving or changing recolour the map as a wave from the points
// field outwards: each dot on screen goes from its old colour and size to its
// new ones with a small swell, later the further it is from the field (up to
// 380ms), so the reader sees their figure reach the map. Clusters swell with
// their neighbours. A figure corrected within 1.5s of a wave (a pause while
// typing «44») only crossfades, all dots at once, and so does every recolour
// with less motion asked for.
//
// What cannot be interpolated — a cluster's halo becoming its chance ring or a
// ring changing its mix, a dashed dot turning solid — keeps its old element on
// top and fades it out when the wave reaches it. Swapped at once, the rings
// changed up to 640ms before the dots beside them, and a cluster between its
// halo and its ring had neither for a moment: the map blinked.
let waveAt = -Infinity, wave: Animation[] = [];
// the swell holds the dot's transform, so a map that moves ends it at once
export const endWave = () => { wave.forEach(a => a.finish()); wave = []; };
const clusterLook = (el: HTMLElement) => el.classList.contains('mix') ? el.dataset.mix : 'plain';
export function recolourMap() {
  if (S.view === 'list' || !S.map || !pane) { drawMarkers(); return; }
  endWave();
  const before = new Map<School, { el: HTMLElement; bg: string; bc: string; bs: string; w: number }>();
  for (const [s, r] of recs) if (r.el.isConnected) before.set(s, { el: r.el, bg: r.el.style.backgroundColor, bc: r.el.style.borderColor, bs: r.el.style.borderStyle, w: parseFloat(r.el.style.width) });
  const wasCluster = new Map<string, HTMLElement>();
  for (const el of clusterEls.values()) if (el.isConnected) wasCluster.set(el.style.transform, el);
  drawMarkers();
  const calm = prefersStill(), m = S.map.getContainer().getBoundingClientRect();
  const f = document.getElementById('my-points')!.getBoundingClientRect();
  const [ox, oy] = f.width ? [f.left + f.width / 2, f.top + f.height / 2] : [m.left, m.top];
  const jobs: { el: HTMLElement; d: number; old?: { bg: string; bc: string; w: number }; ghost?: HTMLElement }[] = [];
  const onScreen = (el: HTMLElement) => {
    if (!el.isConnected || el.hidden) return null;
    const b = el.getBoundingClientRect();
    return b.right < m.left || b.left > m.right || b.bottom < m.top || b.top > m.bottom ? null
      : Math.hypot(b.left + b.width / 2 - ox, b.top + b.height / 2 - oy);
  };
  for (const [s, r] of recs) {
    const old = before.get(s), d = onScreen(r.el);
    if (d === null || !old || (old.bg === r.el.style.backgroundColor && old.w === parseFloat(r.el.style.width) && old.bs === r.el.style.borderStyle)) continue;
    jobs.push({ el: r.el, d, old, ghost: old.bs !== r.el.style.borderStyle ? old.el : undefined });
  }
  for (const el of clusterEls.values()) {
    const d = onScreen(el), was = wasCluster.get(el.style.transform);
    if (d !== null) jobs.push({ el, d, ghost: was && clusterLook(was) !== clusterLook(el) ? was : undefined });
  }
  const now = performance.now(), full = !calm && now - waveAt > 1500;
  if (full) waveAt = now;
  const far = Math.max(1, ...jobs.map(j => j.d));
  const fade = { duration: full ? 260 : 200, easing: full ? EASE.out : 'ease', fill: 'backwards' as FillMode };
  for (const { el, d, old, ghost } of jobs) {
    const delay = full ? d / far * 380 : 0;
    const a: (Animation | null)[] = [];
    if (ghost) {
      // The old marker, back where it stood above the new one and out of every
      // reader's way: a class of its own (pk-dot-was, pk-cluster-was), so
      // nothing that counts markers finds it.
      const wasLook = clusterLook(ghost);
      ghost.className = ghost.className.replace(/\bpk-(dot|cluster)\b/, 'pk-$1-was');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.removeAttribute('tabindex'); ghost.removeAttribute('role');
      ghost.style.pointerEvents = 'none';
      el.after(ghost);
      const out = play(ghost, [{ opacity: 1 }, { opacity: 0 }], { ...fade, delay, fill: 'both' });
      if (out) { out.finished.then(() => ghost.remove(), () => ghost.remove()); a.push(out); } else ghost.remove();
      // A dot's faint dashed fill would show the new one through it before the
      // wave arrives, so the new dot comes in as the old one goes. A cluster's
      // body is the same on both and stays; only a ring replacing the halo,
      // which the halo cannot hide, waits for the wave.
      if (el.classList.contains('pk-dot')) a.push(play(el, [{ opacity: 0 }, { opacity: 1 }], { ...fade, delay }));
      else if (wasLook === 'plain' && el.classList.contains('mix'))
        a.push(play(el, [{ opacity: 0 }, { opacity: 1 }], { ...fade, delay, pseudoElement: '::before' }));
    } else if (old) {
      a.push(play(el, [{ backgroundColor: old.bg, borderColor: old.bc }, { backgroundColor: el.style.backgroundColor, borderColor: el.style.borderColor }], { ...fade, delay }));
    }
    // The swell rides at the end of the dot's own transform, which is its
    // position: the individual scale property would compose outside it and
    // scale the position too, flinging every dot away from the pane's corner.
    const at = el.style.transform, k = old ? old.w / parseFloat(el.style.width) : 1;
    if (full) a.push(play(el, [{ transform: `${at} scale(${k})` }, { transform: `${at} scale(${old ? 1.3 : 1.12})`, offset: .35 }, { transform: at }],
      { duration: 320, delay, easing: EASE.out, fill: 'backwards' }));
    else if (!calm && k !== 1) a.push(play(el, [{ transform: `${at} scale(${k})` }, { transform: at }], { ...fade }));
    wave.push(...a.filter(Boolean) as Animation[]);
  }
}
export function drawMarkers() {
  if (S.view === 'list') { renderListView(); return; }   // the map is display:none
  if (!S.map) return;
  const pn = getPane();
  unspider(); hideMapTip();
  for (const p of placed) if (p.el !== locDot && p.el !== locRing) p.el.remove();
  placed = placed.filter(p => p.el === locDot || p.el === locRing);
  recs.clear(); clusterEls.clear();
  const points: any[] = [];
  const drawn: Rec[] = [];
  for (const s of visibleSchools()) {
    if (!s.lat) continue;
    const st8 = schoolPressure(s, S.mapCat);
    const v = st8.kind === 'points' ? st8.v : null;
    // with points set the dot answers "can I get in here", not "how hard is it"
    const ch = chanceMode() ? schoolChance(s, S.mapCat, S.myPoints) : null;
    const style = chanceMode()
      ? (ch
        ? { radius: 7 + 5 * ((ch.likely + ch.possible) / ch.n), weight: 2.5,
            color: cssVar('--surface-solid'), fillColor: bucketColor(bucketOf(ch.best)), fillOpacity: 0.96 }
        : { radius: 7.5, weight: 2, color: cssVar('--surface-solid'), fillColor: cssVar('--context'), fillOpacity: 0.9 })
      : st8.kind === 'points'
      // share is null where the county publishes no fill state (HELD_OUT): the
      // size legend would otherwise read the fallback as "half filled up", the
      // size 25 dots draw at today. A dashed ring says the share is unknown,
      // and renderLegend() adds the line that names the county
      ? (st8.share == null
        ? { radius: 8.5, weight: 2, dashed: true,
            color: cssVar('--surface-solid'), fillColor: colorFor(v), fillOpacity: 0.96 }
        : { radius: 7 + 5 * st8.share, weight: 2.5,
            color: cssVar('--surface-solid'), fillColor: colorFor(v), fillOpacity: 0.96 })
      : st8.kind === 'open'
      ? { radius: 8, weight: 2, color: cssVar('--accent'), dashed: true, fillColor: cssVar('--accent'), fillOpacity: 0.14 }
      // filled, but the last admitted had no points: the open ring, solid
      : st8.kind === 'zero'
      ? { radius: 8, weight: 2, color: cssVar('--accent'), fillColor: cssVar('--accent'), fillOpacity: 0.35 }
      : { radius: 7.5, weight: 2, color: cssVar('--surface-solid'), fillColor: cssVar('--context'), fillOpacity: 0.9 };
    const bucket = ch ? bucketOf(ch.best) : 'none';
    const el = document.createElement('div');
    el.className = 'pk-dot';
    // Leaflet's stroke straddled the radius, so a dot measured 2r + weight
    // across on the tiles: the box is that wide, the border drawn inside it
    el.style.width = el.style.height = (2 * style.radius + style.weight) + 'px';
    el.style.border = `${style.weight}px ${(style as any).dashed ? 'dashed' : 'solid'} ${style.color}`;
    el.style.background = `color-mix(in srgb, ${style.fillColor} ${Math.round(style.fillOpacity * 100)}%, transparent)`;
    el.dataset.pkBucket = bucket;
    el.dataset.pkRadius = String(style.radius);
    let line;
    if (chanceMode()) {
      line = (S.mapCat === 'all' ? '' : `${CATS[S.mapCat][S.lang]}: `) + (ch
        ? t('tipChance', fmt(S.myPoints), ch.likely, ch.possible, ch.unlikely, ch.n, ch.year)
          + `<br>${t('tipBest', pct(ch.best), esc(progName(ch.bestProg)))}`
        : HELD_OUT.has(s.fylke) ? t('heldOutForecast', s.fylke) : t('tipNoForecast'));
    } else if (S.mapCat === 'all') {
      if (st8.kind === 'points') {
        line = (st8.filled == null ? t('tipMeanOnly', fmt(st8.v), st8.total) : t('tipMedian', fmt(st8.v), st8.filled, st8.total)) +
               (st8.mostlyOpen ? `<br><span class="warn">⚠ ${t('tipMostlyOpen')}</span>` : '') +
               `<br>${t('tipTop')} ${fmt(st8.top)} · ${esc(progName(st8.topProg))}`;
      } else if (st8.kind === 'open') {
        line = t('tipAllOpen', st8.year);
      } else if (st8.kind === 'zero') {
        line = `${zeroLabel(st8.zeroN, st8.openN)} (${st8.year})`;
      } else if (st8.kind === 'stale') {
        line = t('tipStale', st8.year);
      } else {
        const sy: any = yearSpan(s);
        line = t('tipNoData', sy ? sy.split('–').pop() : S.DATA!.years[S.DATA!.years.length - 1]);
      }
    } else {
      line = st8.kind === 'points'
             ? `${CATS[S.mapCat][S.lang]}: ` + (st8.filled == null ? t('tipMeanOnly', fmt(st8.v), st8.total) : t('tipMedian', fmt(st8.v), st8.filled, st8.total))
               + (st8.mostlyOpen ? `<br><span class="warn">⚠ ${t('tipMostlyOpen')}</span>` : '')
           : st8.kind === 'open' ? `${CATS[S.mapCat][S.lang]}: ${t('allIn').toLowerCase()} (${st8.year})`
           : st8.kind === 'zero' ? `${CATS[S.mapCat][S.lang]}: ${zeroLabel(st8.zeroN, st8.openN).toLowerCase()} (${st8.year})`
           : st8.kind === 'stale' ? `${CATS[S.mapCat][S.lang]}: ` + t('tipStale', st8.year)
           : `${CATS[S.mapCat][S.lang]}: ${lensNoFigure(s)}`;
    }
    const html = `<div class="n">${esc(s.name)}</div><div class="v">${line}</div>` +
      `<div class="v">${t('tipPrograms', visibleCount(s), yearSpan(s))}` +
      ` · <span class="round${s.round ? '' : ' unknown'}">` +
      `${s.round ? t('roundChip', s.round) : t('roundUnknown')}</span></div>` +
      `<div class="h">${t('tipHint')}</div>`;
    const rec: Rec = { el, s, lngLat: [s.lon, s.lat], line, html, bucket };
    el.addEventListener('mouseenter', () => showMapTip(rec));
    el.addEventListener('mouseleave', () => { if (document.activeElement !== el) hideMapTip(el); });
    el.addEventListener('click', () => openSide(s));
    el.addEventListener('dblclick', ev => ev.stopPropagation());   // don't zoom the map underneath
    recs.set(s, rec); byEl.set(el, rec); drawn.push(rec);
    points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { school: s, bucket } });
  }
  // 190 schools overlap badly at national zoom — nearly half had no reachable
  // pixel before clustering
  index = new Supercluster({
    radius: 44, maxZoom: CLUSTER_MAX_ZOOM,
    map: p => ({ likely: +(p.bucket === 'likely'), possible: +(p.bucket === 'possible'), unlikely: +(p.bucket === 'unlikely'), none: +(p.bucket === 'none') }),
    reduce: (a, p) => { a.likely += p.likely; a.possible += p.possible; a.unlikely += p.unlikely; a.none += p.none; },
  } as any).load(points);
  // A clustered school has no element on screen — and at the opening view
  // almost every school is clustered, so labelling once left the map with
  // nothing a keyboard could reach. Label whatever is on screen now, and again
  // after every render.
  const labelPoints = () => {
    for (const { el, s, line } of drawn) {
      if (el.dataset.pkKeyed) continue;
      el.dataset.pkKeyed = '1';                   // keyboard access (WCAG 2.1.1)
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      // a <br> is a sentence break: stripped to a space, the best programme's
      // name ran straight into the next figure
      el.setAttribute('aria-label', t('markerAria', s.name,
        line.replace(/<br\s*\/?>/g, '. ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/ \./g, '.').trim()));
      el.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openSide(s); }
      });
      el.addEventListener('focus', () => showMapTip(byEl.get(el)!));
      el.addEventListener('blur', () => hideMapTip(el));
    }
  };
  // A cluster is a button too: named by what it holds, and Enter does what a
  // click does.
  const labelClusters = () => {
    for (const el of clusterEls.values()) {
      if (el.dataset.pkKeyed) continue;
      const f = clusterOf.get(el);
      el.dataset.pkKeyed = '1';
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', t('clusterAria', f.properties.point_count, chanceMode() ? clusterMix(f) : null,
        clusterPlace(f)?.label || null));
      el.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        S.mapFocusPending = Date.now();    // the zoom removes this element; see below
        expandCluster(f);
      });
    }
  };
  // Tab used to stop on every marker and cluster on screen — 32 stops before
  // the county select. One of them holds tabindex 0; the arrow keys, Home and
  // End move between them (a roving tabindex, WAI-ARIA toolbar pattern).
  const roveMarkers = () => {
    const els = mapKeyed();
    if (!els.length) return;
    const cur = els.includes(document.activeElement) ? document.activeElement
      : els.find(e => e.dataset.pkRove === '0') || els[0];
    els.forEach(e => { const on = e === cur; e.setAttribute('tabindex', on ? '0' : '-1'); e.dataset.pkRove = on ? '0' : '1'; });
  };
  S.labelMarkers = () => {
    labelPoints(); labelClusters(); roveMarkers();
    // Enter on a cluster zooms in, and the zoom takes the focused cluster away:
    // focus fell to <body> and the next Tab began at the top of the page. Once
    // the new markers are keyed, hand focus to the one the roving tabindex holds.
    if (S.mapFocusPending && Date.now() - S.mapFocusPending < 3000
        && (!document.activeElement || document.activeElement === document.body)) {
      S.mapFocusPending = 0;
      // the canvas, not the container: MapLibre keys the canvas, and a focus()
      // on the unfocusable container would drop focus back to <body>
      (mapKeyed().find(e => e.dataset.pkRove === '0') || S.map!.getCanvas()).focus({ preventScroll: true });
    }
  };
  renderClusters();
}

export function onMapFylke(v) {
  S.mapFylke = v;
  // a county may not offer the selected category at all; widen rather than
  // leave a blank control over an empty map
  if (S.mapCat !== 'all' && !S.DATA!.schools.some(s =>
      (v === 'all' || s.fylke === v) && shownPrograms(s).some(p => p.category === S.mapCat))) {
    S.mapCat = 'all';
  }
  // The reader's own filter wins over a panel opened earlier: a school the new
  // selection excludes can no longer be shown as if it were on the map.
  if (S.current && !visibleSchools().includes(S.current)) closeSide(true);
  drawMarkers(); renderPanel(); renderLegend(); renderCatNote(); renderSide();
  syncUrl(true);
  sayScope();
  // A 0×0 container has nothing to frame — the list view is only the most
  // obvious way to have no map on screen; a hidden tab or a pane still laying
  // out is another. And without WebGL there is no map at all.
  if (S.view === 'list' || !S.map || !S.map.getContainer().clientWidth) { S.refitPending = true; return; }
  fitVisible(!prefersStill());
}

// Under a lens, the programme areas the school's sheet lists: counted over every
// row, a lens took in 58 schools whose sheets then said «tilbys ikke her», the
// lens's rows there being history the list hides (shownPrograms).
export function visibleSchools() {
  return S.DATA!.schools.filter(s =>
    (S.mapFylke === 'all' || s.fylke === S.mapFylke) &&
    (S.mapCat === 'all' || shownPrograms(s).some(p => p.category === S.mapCat)));
}

export function setLens(v) {
  S.mapCat = v;
  S.chart.cat = null;                  // an open sheet follows the filter it was opened on
  (document.getElementById('map-cat') as any).value = v;
  // a selected row survives any lens that still contains it
  if (S.chart.prog && v !== 'all' && S.chart.prog.category !== v) S.chart.prog = null;
  if (S.current && !visibleSchools().includes(S.current)) closeSide(true);
  drawMarkers(); renderLegend(); renderCatNote(); renderPanelSum();
  renderSide();
  syncUrl(true);
}
// the count a sighted reader gets from the note, the list's head or the map
const sayScope = () => say(S.mapCat === 'all' ? t('scopeCount', visibleSchools().length)
                                              : t('catNote', visibleSchools().length));
export function onMapCat(v) { setLens(v); sayScope(); }
// The level scope (levelScope). Everything that counts the shown set follows,
// as it does for the history toggle; a lens with nothing left at Vg1
// (påbygging) is relaxed rather than left pointing at an empty map, and a
// selected row that left the scope is let go.
export function setLevels(v) {
  S.allLevels = !!v;
  try { localStorage.setItem('pk-alllevels', S.allLevels ? '1' : '0'); } catch (e) {}
  if (S.chart.prog && S.current && !levelScope(S.current.programs).includes(S.chart.prog)) S.chart.prog = null;
  if (S.mapCat !== 'all' && (S.current ? !shownPrograms(S.current).some(p => p.category === S.mapCat)
                                   : !visibleSchools().length)) S.mapCat = 'all';
  renderPanel();                       // the category list depends on the scope
  drawMarkers(); renderLegend(); renderCatNote(); renderPanelSum();
  if (S.view === 'list') renderListView();
  renderSide();
  syncUrl(true);
}
// the scope has nothing to say where the county publishes Vg1 only
export const laterPublished = () => S.DATA!.schools.some(s => (S.mapFylke === 'all' || s.fylke === S.mapFylke)
                                                    && s.programs.some(p => !isVg1(p)));

// The folded panel's button (see the CSS for why it folds). Drawn: the county
// over the education programme; read: each value after its select's own label,
// so a screen reader hears what it would have heard on the selects.
export function renderPanelSum() {
  if (!S.DATA) return;
  const parts: [string, string][] = [];
  if (!document.getElementById('fylke-field')!.hidden)
    parts.push([t('fylkeLabel'), S.mapFylke === 'all' ? t('allFylker') : S.mapFylke]);
  parts.push([t('catLabel'), S.mapCat === 'all' ? t('allCats') : CATS[S.mapCat][S.lang]]);
  // the scope only when it is not the default: the folded line has to say
  // what the checkbox it hides is set to
  if (S.allLevels && laterPublished()) parts.push([t('levelsSumLabel'), t('levelsChipAll')]);
  document.getElementById('panel-sum-t')!.innerHTML = parts.map(([l, v], i) =>
    `<span class="ln"><span class="vh">${i ? ', ' : ''}${esc(l)}: </span>${esc(v)}</span>`).join('');
}
export const panelFolds = () => S.view === 'map' && matchMedia('(max-width: 560px), (max-height: 480px)').matches;
export function foldPanel(fold) {
  if (fold && !panelFolds()) return;
  if (fold === document.body.classList.contains('panel-folded')) return;
  if (fold) renderPanelSum();
  document.body.classList.toggle('panel-folded', fold);
}
export function unfoldPanel(ev) {
  foldPanel(false);
  // the pressed line is gone; from the keyboard, land on the first select it
  // uncovered. A tap moves nothing: focusing a select on iOS opens its picker.
  if (ev && ev.detail === 0) {
    document.getElementById(document.getElementById('fylke-field')!.hidden ? 'map-cat' : 'map-fylke')!.focus();
  }
}

export function initMap() {
  S.labelMarkers = () => {};
}
