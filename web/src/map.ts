import L from 'leaflet';
import { framePad } from "./boot";
import { bucketColor, bucketOf, chanceMode, pct, schoolChance } from "./chance";
import { legendZoomHint, renderCatNote, renderLegend, renderPanel } from "./chrome";
import { colorFor, cssVar, esc, fmt, isVg1, levelScope, progName, schoolPressure, shownPrograms, visibleCount, yearSpan, zeroLabel } from "./helpers";
import { CATS, t } from "./i18n";
import { renderListView } from "./listview";
import { PREFS } from "./prefs";
import { closeSide, mapKeyed, openSide, renderSide, syncUrl } from "./sidebar";
import { S } from './state';

/* ================= map ================= */

// A tooltip reads 180-480px wide, and at a fixed 'top' it slid under the panel
// for a school near the panel's edge (at 1280px the whole of Bergen's west
// side) or past the map's edge. Try each side, slide top and bottom sideways,
// and keep the placement that hides the least of it.
export const TIP_OFF = { top: [0, -10], bottom: [0, 10], left: [-10, 0], right: [10, 0] };
export const tipOpts = (dir, dx = 0) => ({ className: 'tip', direction: dir, opacity: 1, offset: [TIP_OFF[dir][0] + dx, TIP_OFF[dir][1]] });
export function aimTip(m, html, wrapTo = 0) {
  if (!S.map || !m.getTooltip()) return;
  if (!m.isTooltipOpen()) m.openTooltip();
  const te = m.getTooltip().getElement();
  if (!te) return;
  const wrap = el => { el.style.maxWidth = wrapTo ? wrapTo + 'px' : ''; el.style.whiteSpace = wrapTo ? 'normal' : ''; };
  wrap(te);
  const w = te.offsetWidth, h = te.offsetHeight, W = S.map.getSize().x, H = S.map.getSize().y;
  const pt = S.map.latLngToContainerPoint(m.getLatLng());
  const mr = S.map.getContainer().getBoundingClientRect(), pr = document.getElementById('panel').getBoundingClientRect();
  const pn = S.view === 'map' && pr.width ? { l: pr.left - mr.left, t: pr.top - mr.top, r: pr.right - mr.left, b: pr.bottom - mr.top } : null;
  const span = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const lost = (x, y) => w * h - span(x, x + w, 0, W) * span(y, y + h, 0, H)
    + (pn ? span(x, x + w, pn.l, pn.r) * span(y, y + h, pn.t, pn.b) : 0);
  const cands = [];
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
  const pick = cands.find(c => c.lost <= least + 1);
  // No side has room: at Ekstra stor with a sheet open, the 480px chance
  // tooltip met a 449px strip between the panel and the sheet and lost 33px
  // whichever way it went. Wrap it to the strip and aim again.
  const free = Math.floor(W - 8 - Math.max(8, pn ? pn.r + 8 : 8));
  if (pick.lost > 0 && !wrapTo && free >= 200 && free < w) return aimTip(m, html, free);
  if (m._pkAim !== pick.dir + pick.dx) {
    const was = m._pkAim;
    m._pkAim = pick.dir + pick.dx;
    if (was !== undefined || pick.dir !== 'top' || pick.dx) m.unbindTooltip().bindTooltip(html, tipOpts(pick.dir, pick.dx)).openTooltip();
  }
  const el = m.getTooltip().getElement();
  if (!el) return;
  wrap(el);
  el.style.setProperty('--ax', -pick.dx + 'px');
  m.getTooltip().update();
}

// Under a lens with no figure in its newest year, the reason, as the sheet
// gives it: a bare «–» said nothing about a lens that is admission by
// documentation, fortrinnsrett or discontinued.
export function lensNoFigure(s) {
  const scope = levelScope(s.programs).filter(p => p.category === S.mapCat);
  const yr = [...new Set(scope.flatMap(p => Object.keys(p.values)))].sort().pop()
    || S.DATA.years[S.DATA.years.length - 1];
  const cells = scope.filter(p => yr in p.values).map(p => p.values[yr]);
  const all = set => cells.length && cells.every(v => set.includes(v));
  if (cells.includes('D') && all(['D', 'F', 'U'])) return `${t('docAdm').toLowerCase()} (${yr})`;
  if (all(['F'])) return `${t('priority').toLowerCase()} (${yr})`;
  if (all(['U', 'F'])) return `${t('gone').toLowerCase()} (${yr})`;
  return t('tipNoData', yr).toLowerCase();
}
export const isDark = () => PREFS.theme === 'dark' ||
  (PREFS.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
export const prefersStill = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const markerOf = new WeakMap();   // a marker's element → its layer, so closeSide can reach the tooltip
// the key is CARTO's free non-commercial basemap tier (domain-bound,
// requested for poengkart's domains 27.08.2026); it belongs in the client
export const CARTO_KEY = 'cb1_2bsv_1_23dae695a38f70885d3b4f7b';
// Light mode is CARTO Voyager rather than Positron: the same pale land, but
// with tinted water and parks, so the map has some colour and the glass has
// something to show through. No marker loses contrast. The palest dot on
// water goes from 1.49:1 to 1.67:1, and the rest stay within 0.07:1 of before.
export const tileUrl = () =>
  `https://{s}.basemaps.cartocdn.com/${isDark() ? 'dark_all' : 'rastertiles/voyager'}/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`;
export function setTiles() {
  if (S.tileLayer) S.map.removeLayer(S.tileLayer);
  S.tileLayer = L.tileLayer(tileUrl(), {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(S.map);
}

// A cluster's schools counted by the rule that colours their dots: the bucket
// of each school's best chance, or none without a forecast. The ring and the
// cluster's spoken label both read it, so neither can disagree with the dots.
export function clusterMix(cluster) {
  const mix = { likely: 0, possible: 0, unlikely: 0, none: 0 };
  for (const m of cluster.getAllChildMarkers()) mix[m.options.pkBucket || 'none']++;
  return mix;
}
export function drawMarkers() {
  if (S.view === 'list') { renderListView(); return; }   // the map is display:none
  if (S.markerLayer) S.map.removeLayer(S.markerLayer);
  const drawn = [];
  // 190 schools overlap badly at national zoom — nearly half had no reachable
  // pixel before clustering
  S.markerLayer = L.markerClusterGroup({
    maxClusterRadius: 44,
    disableClusteringAtZoom: 11,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    chunkedLoading: true,
    iconCreateFunction: cluster => {
      const n = cluster.getChildCount();
      const size = n < 10 ? 32 : n < 30 ? 38 : 44;
      let mix = '', ring = '';
      if (chanceMode()) {
        const x = clusterMix(cluster), at = k => `${(100 * k / n).toFixed(2)}%`;
        mix = ` data-mix="${x.likely},${x.possible},${x.unlikely},${x.none}"`;
        ring = `;--l:${at(x.likely)};--p:${at(x.likely + x.possible)};--u:${at(x.likely + x.possible + x.unlikely)}`;
      }
      return L.divIcon({
        html: `<div class="pk-cluster${n >= 30 ? ' big' : ''}${mix ? ' mix' : ''}"${mix} `
            + `style="width:${size}px;height:${size}px${ring}">${n}</div>`,
        className: '', iconSize: [size, size],
      });
    },
  }).addTo(S.map);
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
      ? { radius: 7 + 5 * (st8.share ?? 0.5), weight: 2.5,
          color: cssVar('--surface-solid'), fillColor: colorFor(v), fillOpacity: 0.96 }
      : st8.kind === 'open'
      ? { radius: 8, weight: 2, color: cssVar('--accent'), dashArray: '3 3', fillColor: cssVar('--accent'), fillOpacity: 0.14 }
      // filled, but the last admitted had no points: the open ring, solid
      : st8.kind === 'zero'
      ? { radius: 8, weight: 2, color: cssVar('--accent'), fillColor: cssVar('--accent'), fillOpacity: 0.35 }
      : { radius: 7.5, weight: 2, color: cssVar('--surface-solid'), fillColor: cssVar('--context'), fillOpacity: 0.9 };
    const m = L.circleMarker([s.lat, s.lon],
      { ...style, pkSchool: s, pkBucket: ch ? bucketOf(ch.best) : 'none' } as any).addTo(S.markerLayer);
    let line;
    if (chanceMode()) {
      line = (S.mapCat === 'all' ? '' : `${CATS[S.mapCat][S.lang]}: `) + (ch
        ? t('tipChance', fmt(S.myPoints), ch.likely, ch.possible, ch.unlikely, ch.n, ch.year)
          + `<br>${t('tipBest', pct(ch.best), esc(progName(ch.bestProg)))}`
        : t('tipNoForecast'));
    } else if (S.mapCat === 'all') {
      if (st8.kind === 'points') {
        line = t('tipMedian', fmt(st8.v), st8.filled, st8.total) +
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
        line = t('tipNoData', sy ? sy.split('–').pop() : S.DATA.years[S.DATA.years.length - 1]);
      }
    } else {
      line = st8.kind === 'points'
             ? `${CATS[S.mapCat][S.lang]}: ` + t('tipMedian', fmt(st8.v), st8.filled, st8.total)
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
    m.bindTooltip(html, tipOpts('top') as any);
    m.on('mouseover', () => aimTip(m, html));
    m.on('click', () => openSide(s));
    m.on('dblclick', e => L.DomEvent.stop(e));   // don't zoom the map underneath
    drawn.push([m, s, line, html]);
  }
  // A clustered marker has no element yet — and at the opening view almost
  // every school is clustered, so labelling here and only here left the map
  // with nothing a keyboard could reach. Label whatever is on screen now, and
  // again each time clustering hands a marker a new element.
  S.labelMarkers = () => {
    for (const [m, s, line, html] of drawn) {
      const el = m.getElement();
      if (!el || el.dataset.pkKeyed) continue;
      el.dataset.pkKeyed = '1';                   // keyboard access (WCAG 2.1.1)
      markerOf.set(el, m);
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      // a <br> is a sentence break: stripped to a space, the best programme's
      // name ran straight into the next figure
      el.setAttribute('aria-label', t('markerAria', s.name,
        line.replace(/<br\s*\/?>/g, '. ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/ \./g, '.').trim()));
      el.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openSide(s); }
      });
      el.addEventListener('focus', () => { m.openTooltip(); aimTip(m, html); });
      el.addEventListener('blur', () => m.closeTooltip());
    }
  };
  // Leaflet.markercluster makes each cluster focusable with role="button" but
  // gives it no name and no key handling, so a screen reader met "2, button"
  // and Enter did nothing. Mirror what a click does.
  const labelClusters = () => {
    const fg = S.markerLayer._featureGroup;
    for (const l of (fg ? fg.getLayers() : [])) {
      const el = l._icon;
      if (!el || typeof l.getChildCount !== 'function' || el.dataset.pkKeyed) continue;
      el.dataset.pkKeyed = '1';
      el.setAttribute('aria-label', t('clusterAria', l.getChildCount(), chanceMode() ? clusterMix(l) : null));
      el.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        S.mapFocusPending = Date.now();    // the zoom removes this element; see below
        if (l._bounds && S.map.getBoundsZoom(l._bounds) > S.map.getZoom()) l.zoomToBounds({ padding: [30, 30] });
        else l.spiderfy();
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
  const labelPoints = S.labelMarkers;
  S.labelMarkers = () => {
    labelPoints(); labelClusters(); roveMarkers();
    // Enter on a cluster zooms in, and the zoom takes the focused cluster away:
    // focus fell to <body> and the next Tab began at the top of the page. Once
    // the new markers are keyed, hand focus to the one the roving tabindex holds.
    if (S.mapFocusPending && Date.now() - S.mapFocusPending < 3000
        && (!document.activeElement || document.activeElement === document.body)) {
      S.mapFocusPending = 0;
      (mapKeyed().find(e => e.dataset.pkRove === '0') || S.map.getContainer()).focus({ preventScroll: true });
    }
  };
  S.markerLayer.on('animationend', () => { S.labelMarkers(); legendZoomHint(); });
  S.labelMarkers();
}

export function onMapFylke(v) {
  S.mapFylke = v;
  // a county may not offer the selected category at all; widen rather than
  // leave a blank control over an empty map
  if (S.mapCat !== 'all' && !S.DATA.schools.some(s =>
      (v === 'all' || s.fylke === v) && shownPrograms(s).some(p => p.category === S.mapCat))) {
    S.mapCat = 'all';
  }
  // The reader's own filter wins over a panel opened earlier: a school the new
  // selection excludes can no longer be shown as if it were on the map.
  if (S.current && !visibleSchools().includes(S.current)) closeSide(true);
  drawMarkers(); renderPanel(); renderLegend(); renderCatNote(); renderSide();
  syncUrl(true);
  // A 0x0 container makes Leaflet's projection divide by zero and throw
  // "Invalid LatLng object: (NaN, NaN)", taking the whole handler with it — the
  // list view is only the most obvious way to have no map on screen; a hidden
  // tab or a pane still laying out is another.
  if (S.view === 'list' || !S.map.getContainer().clientWidth) { S.refitPending = true; return; }
  const pts = visibleSchools().filter(s => s.lat).map(s => [s.lat, s.lon]);
  if (pts.length) {
    const box = L.latLngBounds(pts).pad(0.08);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) S.map.fitBounds(box, framePad());
    else S.map.flyToBounds(box, { ...framePad(), duration: .6 });
  }
}

// Under a lens, the programme areas the school's sheet lists: counted over every
// row, a lens took in 58 schools whose sheets then said «tilbys ikke her», the
// lens's rows there being history the list hides (shownPrograms).
export function visibleSchools() {
  return S.DATA.schools.filter(s =>
    (S.mapFylke === 'all' || s.fylke === S.mapFylke) &&
    (S.mapCat === 'all' || shownPrograms(s).some(p => p.category === S.mapCat)));
}

export function setLens(v) {
  S.mapCat = v;
  (document.getElementById('map-cat') as any).value = v;
  // a selected row survives any lens that still contains it
  if (S.chart.prog && v !== 'all' && S.chart.prog.category !== v) S.chart.prog = null;
  if (S.current && !visibleSchools().includes(S.current)) closeSide(true);
  drawMarkers(); renderLegend(); renderCatNote(); renderPanelSum();
  renderSide();
  syncUrl(true);
}
export function onMapCat(v) { setLens(v); }
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
export const laterPublished = () => S.DATA.schools.some(s => (S.mapFylke === 'all' || s.fylke === S.mapFylke)
                                                    && s.programs.some(p => !isVg1(p)));

// The folded panel's button (see the CSS for why it folds). Drawn: the county
// over the education programme; read: each value after its select's own label,
// so a screen reader hears what it would have heard on the selects.
export function renderPanelSum() {
  if (!S.DATA) return;
  const parts = [];
  if (!document.getElementById('fylke-field').hidden)
    parts.push([t('fylkeLabel'), S.mapFylke === 'all' ? t('allFylker') : S.mapFylke]);
  parts.push([t('catLabel'), S.mapCat === 'all' ? t('allCats') : CATS[S.mapCat][S.lang]]);
  // the scope only when it is not the default: the folded line has to say
  // what the checkbox it hides is set to
  if (S.allLevels && laterPublished()) parts.push([t('levelsSumLabel'), t('levelsChipAll')]);
  document.getElementById('panel-sum-t').innerHTML = parts.map(([l, v], i) =>
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
    document.getElementById(document.getElementById('fylke-field').hidden ? 'map-cat' : 'map-fylke').focus();
  }
}

export function initMap() {
  S.labelMarkers = () => {};
}
