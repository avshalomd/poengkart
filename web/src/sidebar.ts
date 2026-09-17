import L from 'leaflet';
import { bucketOf, chanceFinal, chanceMode, finalRoundBridge, predFor, schoolChance } from "./chance";
import { renderChartCard } from "./chart";
import { liftMapControls, renderCatNote, renderLegend, renderPanel } from "./chrome";
import { cssVar, esc, fmt, isVg1, round1, shownPrograms } from "./helpers";
import { CATS, t } from "./i18n";
import { drawMarkers, markerOf, prefersStill, setLens, tileUrl } from "./map";
import { renderList } from "./programs";
import { docTitle, queryParts, schoolUrl, setUrlSchool, syncUrl } from './router';
import { S } from './state';
import { heroHtml, metaHtml, notesHtml, photoHtml, srcNoteHtml } from "./templates";
import { bindTitleTips } from "./tips";

/* ================= sidebar ================= */
// Put the filters named in the address back on the controls. Used at boot and
// on every history traversal, so Back steps through filter changes too.
export function applyUrlFilters(boot?) {
  const p = queryParts();
  let fy = 'all', cat = 'all';
  // the level scope rides as `l=all` when it is not the Vg1 default. A link
  // without it leaves a reader's own saved choice alone on a fresh load, while
  // Back over a toggle steps the scope back to Vg1 like any other filter.
  let lv = 'l' in p ? p.l === 'all' : boot ? S.allLevels : false;
  // queryParts() reads the address through URLSearchParams, so these are
  // already decoded; decoding a second time threw a URIError on any value
  // carrying a literal «%» and dropped every filter in the address with it.
  if (p.f) fy = p.f;
  if (p.c) cat = p.c;
  if (!S.DATA!.schools.some(s => s.fylke === fy)) fy = 'all';        // a county we do not carry
  if (cat !== 'all' && !CATS[cat]) cat = 'all';
  // a lens with nothing at Vg1 (påbygging) is a link to the later years
  if (cat !== 'all' && !lv && !S.DATA!.schools.some(s => (fy === 'all' || s.fylke === fy)
        && s.programs.some(q => isVg1(q) && q.category === cat))) lv = true;
  if (fy === S.mapFylke && cat === S.mapCat && lv === S.allLevels) return false;
  S.mapFylke = fy; S.mapCat = cat; S.allLevels = lv;
  const fs: any = document.getElementById('map-fylke'), cs: any = document.getElementById('map-cat');
  if (fs) fs.value = fy;
  renderPanel();
  if (cs) cs.value = cat;
  drawMarkers(); renderLegend(); renderCatNote();
  // an open sheet lists what the scope lists: stepping Back over a toggle
  // left it showing the rows the address no longer names
  if (S.current) renderSide();
  return true;
}
// On a phone the school sheet covers the screen, and the CSS that hides the
// panel, legend and controls behind it does not touch #map — whose markers each
// carry tabindex="0" and role="button", and whose Leaflet container is itself
// focusable. So Tab and a VoiceOver swipe walked straight through the sheet
// into a hundred invisible markers underneath. The four modal sheets already
// avoid this via setModalTrap(); the most-used surface in the app did not.
// where #side is the full-width sheet: phones, and iPad widths at Stor/Ekstra
// stor text (the CSS rule of the same shape lives beside the 760px block)
export const phoneSheet = () => {
  const f = document.documentElement.dataset.font;
  // a phone held sideways too: wider than 760px, but the 480px sheet stood over
  // the right third of its landscape card (the CSS query is the same)
  return matchMedia('(max-width: 760px), (max-width: 1023px) and (max-height: 480px)').matches
    || (f === 'lg' && matchMedia('(max-width: 1024px)').matches)
    || (f === 'xl' && matchMedia('(max-width: 1080px)').matches);
};
// The List view's three layouts; the CSS beside «the List view's three layouts»
// explains the numbers: [two columns from, three columns from] per text size.
// [split, wide] per text size: the CSS's 668px column (×1.15, ×1.3) plus the
// 400px sheet, and the docked panel's 346px on top of a 760px column
export const LIST_LAYOUT = { n: [1068, 1582], lg: [1168, 1734], xl: [1268, 1905] };
export function listLayout() {
  const [split, wide] = LIST_LAYOUT[document.documentElement.dataset.font as string] || LIST_LAYOUT.n;
  const lv = S.view !== 'list' ? '' : innerWidth >= wide ? 'wide' : innerWidth >= split ? 'split' : 'thin';
  const c = document.body.classList;
  // Wide scrolls #listview and the stacked layouts scroll #app, so crossing
  // between them (a resize, a text size) handed the list to a scroller at 0: a
  // reader 120 rows down was thrown back to the top, and closing a school then
  // focused a row 4,600px away. The first row on screen stays where it was.
  const was = c.contains('lv-wide') ? 'wide' : c.contains('lv-stack') ? 'stack' : '';
  const now = lv === 'wide' ? 'wide' : lv ? 'stack' : '';
  let anchor: Element | null | undefined = null, anchorTop = 0;
  if (was && now && was !== now) {
    anchor = [...document.querySelectorAll('#listview tbody tr')].find(r => r.getBoundingClientRect().bottom > 0);
    if (anchor) anchorTop = anchor.getBoundingClientRect().top;
  }
  for (const k of ['wide', 'split', 'thin']) c.toggle('lv-' + k, lv === k);
  c.toggle('lv-stack', lv === 'split' || lv === 'thin');
  if (anchor) document.getElementById(now === 'wide' ? 'listview' : 'app')!.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
  return lv;
}
export const sheetFull = () => phoneSheet() || (S.view === 'list' && listLayout() === 'thin');
export function sideTrap(on) {
  const m = document.getElementById('map');
  if (!m) return;
  m.toggleAttribute('inert', on && phoneSheet());            // where the sheet covers the map
  // Where it covers the list, the list and its controls stay laid out, so
  // closing finds the list scrolled where it was; they only leave the Tab order.
  const covered = on && S.view === 'list' && sheetFull();
  for (const id of ['listview', 'panel']) document.getElementById(id)!.toggleAttribute('inert', covered);
}
// Opening a school the current filter excludes used to leave the panel and the
// map disagreeing: full detail on the right, no marker anywhere — and for a
// search hit, the map flew to an empty patch of coastline. It reaches us that
// way from a search, a pasted link and the choices list, none of which consult
// the filter. Relax whichever filter is in the way, so that what the panel
// describes is always something you can see. Returns true if it changed
// anything, so the caller can redraw.
export function widenFor(s) {
  if (!s || !S.DATA) return false;
  let moved = false;
  if (S.mapFylke !== 'all' && s.fylke !== S.mapFylke) { S.mapFylke = 'all'; moved = true; }
  if (S.mapCat !== 'all' && !shownPrograms(s).some(p => p.category === S.mapCat)) { S.mapCat = 'all'; moved = true; }
  if (!moved) return false;
  const fy: any = document.getElementById('map-fylke'), ct: any = document.getElementById('map-cat');
  if (fy) fy.value = S.mapFylke;
  renderPanel();                       // the category list depends on the county
  if (ct) ct.value = S.mapCat;
  drawMarkers(); renderLegend(); renderCatNote(); syncUrl();
  return true;
}
// the location map in the photo header: a school with no photo, or a photo
// whose upstream URL has since died
// every marker and cluster the keyboard can reach, in DOM order
export const mapKeyed = () => [...document.querySelectorAll('#map [role="button"][data-pk-keyed]')] as any[];
export function buildMiniMap(s) {
  S.miniMap = L.map('s-minimap', {
    zoomControl: false, attributionControl: false, dragging: false,
    scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
    keyboard: false, touchZoom: false, tap: false,
  } as any).setView([s.lat, s.lon], 16);
  L.tileLayer(tileUrl(), { detectRetina: true }).addTo(S.miniMap);
  L.circleMarker([s.lat, s.lon], {
    radius: 9, weight: 3, color: '#fff', fillColor: cssVar('--accent'), fillOpacity: 1,
  }).addTo(S.miniMap);
  // the phone sheet is still sliding in when the map is built, so a single
  // deferred redraw left tiles on a fifth of the box; redraw on every resize
  if (S.miniMapRO) S.miniMapRO.disconnect();
  S.miniMapRO = new ResizeObserver(() => S.miniMap && S.miniMap.invalidateSize());
  S.miniMapRO.observe(document.getElementById('s-minimap')!);
}
// `landing`: the school the address named at boot — the page the reader
// arrived on, not one they opened.
export function openSide(s, landing?: boolean) {
  const ae = document.activeElement;
  S.sideOpener = ae && document.getElementById('map')?.contains(ae) ? ae : null;
  // opened from a wish or from search: closing goes back there, not to the
  // county select above them (a marker and a list row have their own way back)
  if (!document.getElementById('side')!.classList.contains('open')) {
    S.sideReturn = ae?.closest?.('#choices .who') ? { who: ae.getAttribute('aria-label') }
      : ae?.closest?.('#searchov') ? { id: 'searchov-btn' } : null;
  }
  widenFor(s);
  S.current = s;
  S.chart.prog = null;                     // the lens itself is global
  const side = document.getElementById('side');
  side!.removeAttribute('inert');
  side!.classList.add('open');
  renderSide();
  document.body.classList.add('side-open');
  sideTrap(true);
  // On a phone the details fill the screen, and the system back gesture is how
  // people expect to leave a screen. Give it something to pop — ONE entry for
  // the whole open-sheet episode; switching schools rewrites that entry rather
  // than stacking new ones. The order matters: the first open must push the
  // school's own hash directly. Writing it with replaceState first and pushing
  // after baked the first school into the PRE-open entry, so every ✕ — which
  // is a history.back() — landed on "#s=first school" and reopened it instead
  // of closing: school D's close resurrected school A, closing took two
  // presses, and the address kept naming a school nothing was showing.
  // A school the address named at boot is the page itself: nothing is pushed
  // over the landing entry, so one Back leaves the site as it does from any
  // page (it used to take two — the first only closed the sheet), and the
  // entry is flagged so the ✕ closes in place instead of backing out of it.
  if (landing) {
    document.title = docTitle(s);
    try { history.replaceState({ pkSide: 1, pkLanding: 1 }, '', schoolUrl(s)); } catch (e) {}
  } else if (!(history.state || {}).pkSide) {
    document.title = docTitle(s);        // the branch that does not go through setUrlSchool
    try { history.pushState({ pkSide: 1 }, '', schoolUrl(s)); } catch (e) {}
  } else {
    setUrlSchool(s);
  }
  // Focus follows a sheet the reader opened. A page that arrives with its
  // sheet open keeps focus where every page load leaves it — at the top, so
  // the first Tab and a screen reader start from the document's beginning.
  if (!landing) setTimeout(() => (document.querySelector('#s-photo .close') as any)?.focus(), 60);
  // Beside the map the sheet takes 480px of it, and a school clicked in that
  // part vanished under its own sheet. Bring it into the strip left between the
  // panel and the sheet once the sheet is in (and after any flight has landed).
  if (S.view === 'map' && s.lat && S.map && !phoneSheet()) {
    clearTimeout((openSide as any).pan);
    const reveal = () => {
      const mc = S.map!.getContainer();
      if (S.current !== s || !mc.clientWidth) return;
      S.map!.invalidateSize({ pan: false });
      const mr = mc.getBoundingClientRect(), pr = document.getElementById('panel')!.getBoundingClientRect();
      let left = pr.width && pr.right > mr.left ? Math.round(pr.right - mr.left) + 24 : 24;
      if (left + 64 > mc.clientWidth) left = 24;     // no strip beside the panel to aim for
      S.map!.panInside([s.lat, s.lon], { paddingTopLeft: [left, 24], paddingBottomRight: [24, 24], animate: !prefersStill() });
    };
    (openSide as any).pan = setTimeout(() => (S.map!._flyToFrame ? S.map!.once('moveend', reveal) : reveal()), prefersStill() ? 0 : 260);
  }
}
export function clearScope() {
  S.chart.prog = null;
  setLens('all');
}

export function closeSide(fromHistory?) {
  // opened from the map: closing goes back to that school's marker, found by
  // name because drawMarkers() has rebuilt the marker DOM since
  const openedName = S.sideOpener && S.current ? S.current.name : null;
  const closed = S.current;
  const side = document.getElementById('side');
  const st = history.state || {};
  // the landing entry's own sheet (pkLanding) has no entry under it to back
  // onto: it closes in place, below
  if (!fromHistory && st.pkSide && !st.pkLanding) {
    // The entry below is usually school-less, but a tab BOOTED from a deep
    // link sits on the pasted "#s=..." itself — and landing there used to
    // reopen that school, so the ✕ resurrected the first school instead of
    // closing. The flag makes the intent unambiguous; a genuine back/forward
    // gesture onto a school entry still reopens it, as a URL should.
    S.sideClosing = true;
    history.back();                        // popstate closes it, once
    return;
  }
  side!.classList.remove('open');
  document.body.classList.remove('side-open');
  sideTrap(false);
  S.current = null;      // or the next county switch writes the closed school back into the URL
  // the landing entry's flags come off with its sheet: the next open pushes
  // its own entry again, and its ✕ backs onto this one
  if (st.pkLanding) { try { history.replaceState(null, '', location.href); } catch (e) {} }
  setUrlSchool(null);
  liftMapControls();                       // the legend is visible again
  side!.setAttribute('inert', '');          // keep 17 hidden controls out of Tab
  const opener: any = openedName
    ? mapKeyed().find(e => (e.getAttribute('aria-label') || '').startsWith(openedName + '.')) || null
    : null;
  if (opener) { mapKeyed().forEach(e => { e.setAttribute('tabindex', '-1'); e.dataset.pkRove = '1'; }); opener.setAttribute('tabindex', '0'); opener.dataset.pkRove = '0'; }
  S.sideOpener = null;
  const ret = S.sideReturn && (S.sideReturn.id ? document.getElementById(S.sideReturn.id)
    : [...document.querySelectorAll('#choices .who')].find(b => b.getAttribute('aria-label') === S.sideReturn!.who));
  S.sideReturn = null;
  // From the list, focus goes back to the school's own row. The county select
  // at the top of the card scrolled a list read halfway down back up to it.
  const row = S.view === 'list' && closed
    ? [...document.querySelectorAll('#listview td.sc a')].find(a => a.getAttribute('href') === schoolUrl(closed))
    : null;
  // Otherwise the first of these on screen: with a phone's panel folded both
  // selects are hidden, and focus() on a hidden one left focus on <body>.
  const fallback = [ret, 'map-fylke', 'map-cat', 'panel-sum', 'searchov-btn']
    .map(e => typeof e === 'string' ? document.getElementById(e) : e).find((e: any) => e && e.offsetParent)
    || document.getElementById('panel');
  // A row that a rotation or a text size moved off screen is scrolled to; one
  // still in view keeps the list exactly where it was.
  const rr = row && row.getBoundingClientRect();
  (row || opener || fallback)?.focus({ preventScroll: S.view === 'list' && (!row || (rr!.top >= 0 && rr!.bottom <= innerHeight)) });
  // A click or a tap focuses the marker too, so a sheet opened that way hands
  // focus back like any other, and Leaflet opens a tooltip on every focus: the
  // school's tooltip was left floating over the map after the ✕. Only a return
  // the keyboard can see keeps it.
  if (opener && !opener.matches(':focus-visible')) markerOf.get(opener)?.closeTooltip();
}

export function renderSide() {
  // current outlives closeSide, so a language or theme change would otherwise
  // rebuild the whole panel — minimap included — inside a zero-width box
  if (!S.current || !document.getElementById('side')!.classList.contains('open')) return;
  const s = S.current;
  // photo header
  const ph = document.getElementById('s-photo');
  ph!.innerHTML = photoHtml(s);
  // an optimiser that is not there, or a county URL that has expired since the
  // last build, should not leave a broken image in the header
  const pimg = ph!.querySelector('img');
  if (pimg) {
    pimg.onerror = () => {
      if (!pimg.isConnected) return;                       // the panel has moved on
      if (pimg.dataset.full && pimg.src !== pimg.dataset.full) { pimg.src = pimg.dataset.full; return; }
      // both the proxy and the county URL are gone (St.Hallvard, Os): the header
      // used to keep a broken-image glyph and a credit for a photo that is not there
      pimg.onerror = null; pimg.remove(); ph!.querySelector('.credit')?.remove();
      if (s.lat && !ph!.querySelector('#s-minimap')) { ph!.insertAdjacentHTML('afterbegin', '<div id="s-minimap"></div>'); buildMiniMap(s); }
    };
  }
  // no freely licensed photo exists for this school: show where it actually is
  if (S.miniMap) { S.miniMap.remove(); S.miniMap = null; }
  if (S.miniMapRO) { S.miniMapRO.disconnect(); S.miniMapRO = null; }
  if (!s.photo && s.lat) buildMiniMap(s);
  document.getElementById('s-meta')!.innerHTML = metaHtml(s);
  const notes = notesHtml(s);
  const noteBox = document.getElementById('s-notes');
  noteBox!.innerHTML = notes;
  noteBox!.hidden = !notes;
  const lensCat = S.mapCat !== 'all' ? S.mapCat : null;
  const { hero, mix } = heroHtml(s, lensCat);
  const mixBox = document.getElementById('s-mix');
  mixBox!.innerHTML = mix;
  mixBox!.hidden = !mix;
  document.getElementById('s-hero')!.innerHTML = hero;
  renderChance(s, lensCat);
  document.getElementById('src-note')!.innerHTML = srcNoteHtml();
  renderChartCard();
  renderList();
  ['s-meta', 's-hero', 's-chance', 's-notes'].forEach(id =>
    bindTitleTips(document.getElementById(id)));
}

// The forecast block: with points set, how many of the school's programmes
// are within reach and on what basis; without, the mix-adjusted level and a
// pointer to the input. Follows the category lens the same way the hero does.
export const chanceMore = inner =>
  `<details class="more"${S.chanceMoreOpen ? ' open' : ''} ontoggle="chanceMoreOpen = this.open">` +
  `<summary><span class="mt">${esc(t('moreLabel'))}</span><span class="lt">${esc(t('lessLabel'))}</span></summary>${inner}</details>`;
export function renderChance(s, lensCat) {
  const box = document.getElementById('s-chance');
  const e = S.MODEL && S.MODEL.schools && S.MODEL.schools[`${s.fylke}|${s.name}`];
  if (!e || !e.programs) {
    // The map tooltip says "ingen prognose for denne skolen" for exactly this
    // case, and the branch below says it when a *category* has no forecast —
    // but hiding the box outright meant the whole-school case was the one
    // absence the panel never explained. A reader who never hovered the dot
    // would not learn the feature existed here at all.
    box!.hidden = false;
    box!.innerHTML = `<div>${esc(t('tipNoForecast'))}</div>`;
    return;
  }
  box!.hidden = false;
  const adj = e.alpha === undefined ? ''
    : `<div class="adj tipped" title="${esc(t('adjTitle'))}">`
      + `${esc(t('adjLine', (round1(e.alpha) > 0 ? '+' : '') + fmt(e.alpha), fmt(e.alpha_se)))}</div>`;
  if (!chanceMode()) {
    box!.className = 'chance prompt';
    box!.innerHTML = `<div>${esc(t('chancePrompt', e.year))}</div>` + (adj ? chanceMore(adj) : '');
    return;
  }
  box!.className = 'chance';
  const ch = schoolChance(s, lensCat || 'all', S.myPoints);
  if (!ch) { box!.innerHTML = `<div>${esc(t('chanceNoneInScope'))}</div>` + (adj ? chanceMore(adj) : ''); return; }
  const noPred = Math.max(0, ch.total - ch.n);
  const head = ch.likely ? t('chanceHeadL', fmt(S.myPoints), ch.likely, ch.n, noPred, ch.total)
             : ch.possible ? t('chanceHeadR', fmt(S.myPoints), ch.possible, ch.n, noPred, ch.total)
             : t('chanceHeadU', fmt(S.myPoints), ch.n, noPred, ch.total);
  const bar = ['likely', 'possible', 'unlikely']
    .map(b => `<span class="b-${b}" style="width:${100 * ch[b] / ch.n}%"></span>`).join('');
  // the spread range the footnote quotes: history buckets times the level
  // multipliers (model.json meta), i.e. the narrowest and widest s deployed
  const sf: any[] = Object.values((S.MODEL!.meta || {}).sigma_forecast || {});
  const sm: any[] = Object.values((S.MODEL!.meta || {}).sigma_level_multiplier || {});
  const mlo = sm.length ? Math.min(...sm) : 1, mhi = sm.length ? Math.max(...sm) : 1;
  const lo = sf.length ? Math.round(Math.min(...sf) * mlo) : 5, hi = sf.length ? Math.round(Math.max(...sf) * mhi) : 8;
  const cov = S.MODEL!.meta && S.MODEL!.meta.backtest_eval_years && S.MODEL!.meta.backtest_eval_years.coverage80;
  // where the county publishes round 1: what the final round does, if measured
  let fin = '';
  const fb = finalRoundBridge(s);
  if (fb) {
    // the same programme areas the head just counted (ch.progs), so the
    // note's "av n" is the head's n and the two never disagree
    let L3 = 0;
    for (const p of ch.progs) if (bucketOf(chanceFinal(predFor(s, p), S.myPoints, p.category, fb)) === 'likely') L3++;
    fin = `<div>${esc(t('finalRoundNote', fb.to_round, L3, ch.n, L3 === ch.likely))}</div>`;
  } else if (s.round === '1') {
    fin = `<div>${esc(t('finalRoundUnknown'))}</div>`;
  }
  // what the county's publication cannot tell the reader about this chance
  if (!s.round) fin += `<div>${esc(t('chanceRoundUnknown'))}</div>`;
  box!.innerHTML = `<div class="h">${esc(head)}</div><div class="bar">${bar}</div>` + chanceMore(
    `<div>${esc(t('chanceCounts', ch.likely, ch.possible, ch.unlikely))}</div>` +
    `<div>${esc(t('chanceSub', ch.year, e.round, lo, hi))}` +
    (s.catchment ? ' ' + esc(t('chanceCatchment')) : '') +
    (cov != null ? ' ' + esc(t('chanceCal', Math.round(cov * 100))) : '') + `</div>` + fin + adj);
}

export function initSidebar() {
  addEventListener('resize', listLayout);   // not debounced: a stale class is a broken layout
  document.addEventListener('keydown', ev => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 0, End: 0 };
    if (!(ev.key in keys)) return;
    const els = mapKeyed(), i = els.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    const j = ev.key === 'Home' ? 0 : ev.key === 'End' ? els.length - 1 : (i + keys[ev.key] + els.length) % els.length;
    els[i].setAttribute('tabindex', '-1'); els[i].dataset.pkRove = '1';
    els[j].setAttribute('tabindex', '0'); els[j].dataset.pkRove = '0';
    els[j].focus();
  });
}
