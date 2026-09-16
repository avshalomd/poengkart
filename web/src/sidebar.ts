import L from 'leaflet';
import { bucketOf, chanceFinal, chanceMode, finalRoundBridge, predFor, schoolChance } from "./chance";
import { renderChartCard } from "./chart";
import { liftMapControls, renderCatNote, renderLegend, renderPanel } from "./chrome";
import { BUG_ICON, OPEN_RULE, X_ICON, cssVar, esc, fmt, isPoints, isVg1, openMix, round1, shownPrograms, staleBefore, visibleIn, zeroLabel } from "./helpers";
import { CATS, t } from "./i18n";
import { meanStep } from "./listview";
import { drawMarkers, markerOf, prefersStill, setLens, tileUrl } from "./map";
import { renderList } from "./programs";
import { S } from './state';
import { bindTitleTips } from "./tips";

/* ================= sidebar ================= */
// The open school is a place someone will want to send to someone else, so it
// lives in the URL fragment: #s=Fylke/Skolenavn. replaceState edits the
// address without firing popstate, so the back-gesture machinery below never
// sees these writes.
// The county and programme filters used to live nowhere: a reload dropped you
// back to the whole country, and a link you sent carried the school but not the
// selection you were looking at it under. They join the school in the fragment
// as `&f=` and `&c=`, omitted when they are "all" so the common link stays
// short and every #s= link already in the wild still parses.
export const schoolPart = s => 's=' + encodeURIComponent(s.fylke) + '/' + encodeURIComponent(s.name);
export function buildHash(s) {
  const parts = [];
  if (s) parts.push(schoolPart(s));
  if (S.mapFylke !== 'all') parts.push('f=' + encodeURIComponent(S.mapFylke));
  if (S.mapCat !== 'all') parts.push('c=' + encodeURIComponent(S.mapCat));
  if (S.allLevels) parts.push('l=all');
  return parts.length ? '#' + parts.join('&') : location.pathname + location.search;
}
export const schoolHash = s => buildHash(s);
export function hashParts() {
  const out: any = {};
  (location.hash || '').replace(/^#/, '').split('&').forEach(kv => {
    const i = kv.indexOf('=');
    if (i > 0) out[kv.slice(0, i)] = kv.slice(i + 1);
  });
  return out;
}
export function setUrlSchool(s) {
  try { history.replaceState(history.state, '', buildHash(s)); } catch (e) {}
}
// A filter change is a place you can come back to, so it gets its own history
// entry rather than editing the current one.
export function syncUrl(push?) {
  try {
    const h = buildHash(S.current);
    if (h === (location.hash || location.pathname + location.search)) return;
    // An open sheet is ONE history entry (see openSide). A filter changed
    // while it is open rewrites that entry: pushed, it sat on top of the
    // sheet's, so the ✕'s back() landed on the sheet's own entry, re-read
    // its filters and turned the Vg2+ switch (or a county change) back off.
    const st = history.state || {};
    if (push && !st.pkSide && !st.pkSheet) history.pushState(history.state, '', h);
    else history.replaceState(history.state, '', h);
  } catch (e) {}
}
export function schoolFromUrl() {
  const p = hashParts();
  if (!p.s) return null;
  const m = /^([^/]+)\/(.+)$/.exec(p.s);
  if (!m) return null;
  try {
    const fy = decodeURIComponent(m[1]), name = decodeURIComponent(m[2]);
    const inFylke = S.DATA.schools.filter(x => x.fylke === fy);
    // a pasted link may carry stray spaces or decomposed å/ø from another app
    const key = name.trim().normalize('NFC').toLowerCase();
    // Buskerud and Akershus carry the county's own short school name ("Kongsberg");
    // the national register's full name ("Kongsberg videregående skole") is on
    // nsr_name, and that is the form people paste from elsewhere. Accept both.
    // The school's own `name` wins outright, the alias is only a fallback:
    // a county's short name can never be shadowed by another school's
    // nsr_name. Links the app writes are unaffected; buildHash still uses name.
    return inFylke.find(x => x.name.toLowerCase() === key)
        // nsr_name also holds the geocoder's provenance sentinels "(manual)" and
        // "(stedsnavn)"; those are not names and must not open a school
        || inFylke.find(x => { const a = x.nsr_name || ''; return a && a[0] !== '(' && a.toLowerCase() === key; })
        // a link shared before a merger names the old school; it lives on as
        // merged_from of the school that absorbed it
        || inFylke.find(x => (x.merged_from || []).some(a => a.toLowerCase() === key))
        || null;
  } catch (e) { return null; }
}
// The name a #s= link asked for, when no school answers to it.
export function unresolvedLinkName() {
  const p = hashParts();
  const m = p.s && /^([^/]+)\/(.+)$/.exec(p.s);
  try { return m ? decodeURIComponent(m[2]).trim() : ''; } catch (e) { return p.s; }
}
// Put the filters named in the address back on the controls. Used at boot and
// on every history traversal, so Back steps through filter changes too.
export function applyUrlFilters(boot?) {
  const p = hashParts();
  let fy = 'all', cat = 'all';
  // the level scope rides as `l=all` when it is not the Vg1 default. A link
  // without it leaves a reader's own saved choice alone on a fresh load, while
  // Back over a toggle steps the scope back to Vg1 like any other filter.
  let lv = 'l' in p ? p.l === 'all' : boot ? S.allLevels : false;
  try {
    if (p.f) fy = decodeURIComponent(p.f);
    if (p.c) cat = decodeURIComponent(p.c);
  } catch (e) { return false; }
  if (!S.DATA.schools.some(s => s.fylke === fy)) fy = 'all';        // a county we do not carry
  if (cat !== 'all' && !CATS[cat]) cat = 'all';
  // a lens with nothing at Vg1 (påbygging) is a link to the later years
  if (cat !== 'all' && !lv && !S.DATA.schools.some(s => (fy === 'all' || s.fylke === fy)
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
  const [split, wide] = LIST_LAYOUT[document.documentElement.dataset.font] || LIST_LAYOUT.n;
  const lv = S.view !== 'list' ? '' : innerWidth >= wide ? 'wide' : innerWidth >= split ? 'split' : 'thin';
  const c = document.body.classList;
  // Wide scrolls #listview and the stacked layouts scroll #app, so crossing
  // between them (a resize, a text size) handed the list to a scroller at 0: a
  // reader 120 rows down was thrown back to the top, and closing a school then
  // focused a row 4,600px away. The first row on screen stays where it was.
  const was = c.contains('lv-wide') ? 'wide' : c.contains('lv-stack') ? 'stack' : '';
  const now = lv === 'wide' ? 'wide' : lv ? 'stack' : '';
  let anchor = null, anchorTop = 0;
  if (was && now && was !== now) {
    anchor = [...document.querySelectorAll('#listview tbody tr')].find(r => r.getBoundingClientRect().bottom > 0);
    if (anchor) anchorTop = anchor.getBoundingClientRect().top;
  }
  for (const k of ['wide', 'split', 'thin']) c.toggle('lv-' + k, lv === k);
  c.toggle('lv-stack', lv === 'split' || lv === 'thin');
  if (anchor) document.getElementById(now === 'wide' ? 'listview' : 'app').scrollTop += anchor.getBoundingClientRect().top - anchorTop;
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
  for (const id of ['listview', 'panel']) document.getElementById(id).toggleAttribute('inert', covered);
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
  S.miniMapRO.observe(document.getElementById('s-minimap'));
}
export function openSide(s) {
  const ae = document.activeElement;
  S.sideOpener = ae && document.getElementById('map')?.contains(ae) ? ae : null;
  // opened from a wish or from search: closing goes back there, not to the
  // county select above them (a marker and a list row have their own way back)
  if (!document.getElementById('side').classList.contains('open')) {
    S.sideReturn = ae?.closest?.('#choices .who') ? { who: ae.getAttribute('aria-label') }
      : ae?.closest?.('#searchov') ? { id: 'searchov-btn' } : null;
  }
  widenFor(s);
  S.current = s;
  S.chart.prog = null;                     // the lens itself is global
  const side = document.getElementById('side');
  side.removeAttribute('inert');
  side.classList.add('open');
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
  if (!(history.state || {}).pkSide) {
    try { history.pushState({ pkSide: 1 }, '', schoolHash(s)); } catch (e) {}
  } else {
    setUrlSchool(s);
  }
  setTimeout(() => (document.querySelector('#s-photo .close') as any)?.focus(), 60);
  // Beside the map the sheet takes 480px of it, and a school clicked in that
  // part vanished under its own sheet. Bring it into the strip left between the
  // panel and the sheet once the sheet is in (and after any flight has landed).
  if (S.view === 'map' && s.lat && S.map && !phoneSheet()) {
    clearTimeout((openSide as any).pan);
    const reveal = () => {
      const mc = S.map.getContainer();
      if (S.current !== s || !mc.clientWidth) return;
      S.map.invalidateSize({ pan: false });
      const mr = mc.getBoundingClientRect(), pr = document.getElementById('panel').getBoundingClientRect();
      let left = pr.width && pr.right > mr.left ? Math.round(pr.right - mr.left) + 24 : 24;
      if (left + 64 > mc.clientWidth) left = 24;     // no strip beside the panel to aim for
      S.map.panInside([s.lat, s.lon], { paddingTopLeft: [left, 24], paddingBottomRight: [24, 24], animate: !prefersStill() });
    };
    (openSide as any).pan = setTimeout(() => (S.map._flyToFrame ? S.map.once('moveend', reveal) : reveal()), prefersStill() ? 0 : 260);
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
  if (!fromHistory && (history.state || {}).pkSide) {
    // The entry below is usually school-less, but a tab BOOTED from a deep
    // link sits on the pasted "#s=..." itself — and landing there used to
    // reopen that school, so the ✕ resurrected the first school instead of
    // closing. The flag makes the intent unambiguous; a genuine back/forward
    // gesture onto a school entry still reopens it, as a URL should.
    S.sideClosing = true;
    history.back();                        // popstate closes it, once
    return;
  }
  side.classList.remove('open');
  document.body.classList.remove('side-open');
  sideTrap(false);
  S.current = null;      // or the next county switch writes the closed school back into the URL
  setUrlSchool(null);
  liftMapControls();                       // the legend is visible again
  side.setAttribute('inert', '');          // keep 17 hidden controls out of Tab
  const opener: any = openedName
    ? mapKeyed().find(e => (e.getAttribute('aria-label') || '').startsWith(openedName + '.')) || null
    : null;
  if (opener) { mapKeyed().forEach(e => { e.setAttribute('tabindex', '-1'); e.dataset.pkRove = '1'; }); opener.setAttribute('tabindex', '0'); opener.dataset.pkRove = '0'; }
  S.sideOpener = null;
  const ret = S.sideReturn && (S.sideReturn.id ? document.getElementById(S.sideReturn.id)
    : [...document.querySelectorAll('#choices .who')].find(b => b.getAttribute('aria-label') === S.sideReturn.who));
  S.sideReturn = null;
  // From the list, focus goes back to the school's own row. The county select
  // at the top of the card scrolled a list read halfway down back up to it.
  const row = S.view === 'list' && closed
    ? [...document.querySelectorAll('#listview td.sc a')].find(a => a.getAttribute('href') === schoolHash(closed))
    : null;
  // Otherwise the first of these on screen: with a phone's panel folded both
  // selects are hidden, and focus() on a hidden one left focus on <body>.
  const fallback = [ret, 'map-fylke', 'map-cat', 'panel-sum', 'searchov-btn']
    .map(e => typeof e === 'string' ? document.getElementById(e) : e).find((e: any) => e && e.offsetParent)
    || document.getElementById('panel');
  // A row that a rotation or a text size moved off screen is scrolled to; one
  // still in view keeps the list exactly where it was.
  const rr = row && row.getBoundingClientRect();
  (row || opener || fallback)?.focus({ preventScroll: S.view === 'list' && (!row || (rr.top >= 0 && rr.bottom <= innerHeight)) });
  // A click or a tap focuses the marker too, so a sheet opened that way hands
  // focus back like any other, and Leaflet opens a tooltip on every focus: the
  // school's tooltip was left floating over the map after the ✕. Only a return
  // the keyboard can see keeps it.
  if (opener && !opener.matches(':focus-visible')) markerOf.get(opener)?.closeTooltip();
}

// Rogaland's image handler serves nothing but the original: a width in the
// path 404s and one in the query is ignored. Those few go through the host's
// image optimiser instead; every other photo already asks its own server for a
// display-sized rendition when the dataset is built.
export const photoSrc = u => (/\/bv\.ashx\//.test(u) && location.protocol === 'https:'
                       && !/^(localhost|127\.)/.test(location.hostname))
  ? `/_vercel/image?url=${encodeURIComponent(u)}&w=960&q=75` : u;

export function renderSide() {
  // current outlives closeSide, so a language or theme change would otherwise
  // rebuild the whole panel — minimap included — inside a zero-width box
  if (!S.current || !document.getElementById('side').classList.contains('open')) return;
  const s = S.current;
  // photo header
  const ph = document.getElementById('s-photo');
  // the pipeline stores the credit with a Norwegian "Foto:" prefix; the label
  // is UI text and follows the language, the credited name does not
  const creditText = t('photoCredit', (s.photo_credit
    || (s.photo_source === 'commons' ? 'Wikimedia Commons' : 'Wikipedia')).replace(/^\s*(foto|photo)\s*:\s*/i, ''));
  // esc() protects the attribute but not the scheme, and every one of these
  // comes from a scrape rather than from us
  const web = u => (/^https?:\/\//i.test(u || '') ? u : '');
  const creditHref = web(s.photo_page) || web(s.wiki_url) || '';
  const credit = s.photo
    ? `<div class="credit">` + (creditHref
        ? `<a href="${esc(creditHref)}" target="_blank" rel="noopener">${esc(creditText)}</a>`
        : esc(creditText)) + '</div>'
    : '';
  const pos = s.photo_position ? ` style="--photo-pos:${esc(s.photo_position)}"` : '';
  ph.innerHTML = (s.photo ? `<img src="${esc(photoSrc(s.photo))}" data-full="${esc(s.photo)}"`
                          + ` alt="" loading="lazy"${pos}>`
                          : `<div id="s-minimap"></div>`) +
    `<div class="veil"></div>` +
    `<button class="close bug" onclick="openBug(current, this)" aria-label="${esc(t('bugSchoolLabel'))}">${BUG_ICON}</button>` +
    `<button class="close" onclick="closeSide()" aria-label="${esc(t('closeAria'))}">${X_ICON}</button>` +
    `<div class="name"><h2>${esc(s.name)}</h2>${credit}</div>`;
  // an optimiser that is not there, or a county URL that has expired since the
  // last build, should not leave a broken image in the header
  const pimg = ph.querySelector('img');
  if (pimg) {
    pimg.onerror = () => {
      if (!pimg.isConnected) return;                       // the panel has moved on
      if (pimg.dataset.full && pimg.src !== pimg.dataset.full) { pimg.src = pimg.dataset.full; return; }
      // both the proxy and the county URL are gone (St.Hallvard, Os): the header
      // used to keep a broken-image glyph and a credit for a photo that is not there
      pimg.onerror = null; pimg.remove(); ph.querySelector('.credit')?.remove();
      if (s.lat && !ph.querySelector('#s-minimap')) { ph.insertAdjacentHTML('afterbegin', '<div id="s-minimap"></div>'); buildMiniMap(s); }
    };
  }
  // no freely licensed photo exists for this school: show where it actually is
  if (S.miniMap) { S.miniMap.remove(); S.miniMap = null; }
  if (S.miniMapRO) { S.miniMapRO.disconnect(); S.miniMapRO = null; }
  if (!s.photo && s.lat) buildMiniMap(s);
  // meta links
  const meta = [];
  if (s.url) meta.push(`<a href="${esc(s.url.startsWith('http') ? s.url : 'https://' + s.url)}" target="_blank" rel="noopener">${t('website')} ↗</a>`);
  if (web(s.wiki_url)) meta.push(`<a href="${esc(s.wiki_url)}" target="_blank" rel="noopener">${t('wiki')} ↗</a>`);
  if (s.address) meta.push(`<span>${esc(s.address)}</span>`);
  if (s.fylke) meta.push(`<span>${esc(s.fylke)}</span>`);
  meta.push(s.round
    ? `<span class="round" title="${esc(t('roundTitle'))}">${t('roundChip', s.round)}</span>`
    : `<span class="round unknown" title="${esc(t('roundUnknownTitle'))}">${t('roundUnknown')}</span>`);
  // the map shows this school as "no data"; say why, where the history is
  const newest = [...new Set(s.programs.flatMap(p => Object.keys(p.values)))].sort().pop();
  if (newest && +newest < staleBefore()) {
    meta.push(`<span class="round stale" title="${esc(t('staleTitle'))}">`
            + `${t('staleChip', newest)}</span>`);
  }
  document.getElementById('s-meta').innerHTML = meta.join('');
  // the county's own history of this school, where it is not one school's own
  const notes = [];
  if (s.merged_from && s.merged_year) {
    notes.push(t('mergedNote', s.merged_from.join(t('listAnd')), s.merged_year, s.merged_from.length));
  }
  if (s.uncertain_years && s.uncertain_years.length) {
    notes.push(t('uncertainNote', s.uncertain_years.join(', ')));
  }
  const cy = (S.DATA.counties || []).find(c => c.fylke === s.fylke) || {};
  const odd = Object.entries(cy.round_years || {})
    .filter(([y]) => s.programs.some(p => y in p.values));
  for (const [y, r] of odd) notes.push(t('roundYearNote', y, r));
  // where "ingen venteliste" is the county's own rule, say so beside the rows
  if (OPEN_RULE.has(s.fylke) && s.programs.some(p => Object.values(p.values).includes('open'))) {
    notes.push(t('openRuleNote'));
  }
  const noteBox = document.getElementById('s-notes');
  noteBox.innerHTML = notes.map(n => `<p>${esc(n)}</p>`).join('');
  noteBox.hidden = !notes.length;
  // One statistic everywhere: the dot on the map, this figure and the blue
  // line are all the mean of the same cells, and the change is the last step
  // of that line — so a reader can check the subtraction and it comes out.
  // What a mean cannot say on its own is how much of the school never had a
  // waitlist, so that is spelled out underneath instead of hidden in it.
  const lensCat = S.mapCat !== 'all' ? S.mapCat : null;
  const cells = [];
  const base = shownPrograms(s);
  const scopePrograms = lensCat ? base.filter(p => p.category === lensCat) : base;
  const step = meanStep(scopePrograms);
  const { latest, prev, mean, meanPrev }: any = step;
  const scopeLabel = lensCat ? CATS[lensCat][S.lang] : t('heroTypicalAll');
  if (mean !== null) {
    cells.push({ v: fmt(mean), l: `${t('heroTypical')} · ${scopeLabel} ${latest}` });
    if (meanPrev !== null) {
      const d = step.d;
      cells.push({ v: (d > 0 ? '+' : '') + fmt(d), l: t('heroDelta', prev),
                   cls: d > 0 ? 'up' : d < 0 ? 'dn' : '', ti: t('heroDeltaBasis') });
    }
  } else if (!scopePrograms.length) {
    // the lens names a programme this school does not offer: say that, rather
    // than let the no-cells fallback claim "everyone admitted"
    cells.push({ v: '\u2013', l: `${scopeLabel} \u00b7 ${t('notOffered')}` });
  } else {
    const last = scopePrograms.map(p => p.values[latest]).filter(v => v !== undefined);
    // a 0 outranks "ingen venteliste": see schoolPressure
    const zeroN = last.filter(v => v === 0).length, openN = last.filter(v => v === 'open').length;
    const label = zeroN ? zeroLabel(zeroN, openN)
                : openN ? t('allIn')
                : last.includes('D') ? t('docAdm')
                : last.includes('F') ? t('priority')
                : last.length && last.every(v => v === 'U') ? t('gone')
                : t('allIn');
    cells.push({ v: label, l: `${scopeLabel} ${latest || ''}`.trim() });
  }
  cells.push({ v: visibleIn(scopePrograms), l: t('heroProgs', visibleIn(scopePrograms)) });
  const mix = openMix(scopePrograms, latest);
  const mixBox = document.getElementById('s-mix');
  mixBox.hidden = !(mix.mostly && mean !== null);
  if (!mixBox.hidden) {
    mixBox.innerHTML = `<span class="sign" aria-hidden="true">⚠</span><span>` +
      esc(t('mostlyOpenNote', mix.open, mix.total, latest,
             scopePrograms.map(p => p.values[latest]).filter(isPoints).length)) + `</span>`;
  }
  document.getElementById('s-hero').innerHTML =
    cells.map(c => `<div class="cell"${c.ti ? ` title="${esc(c.ti)}"` : ''}>` +
                   `<div class="v ${c.cls || ''}">${c.v}</div><div class="l">${capFirst(c.l)}</div></div>`).join('');
  renderChance(s, lensCat);
  document.getElementById('src-note').innerHTML = esc(t('srcNote')) +
    ` <button class="lnk" onclick="contactOpener = this; openContact('tall')">${esc(t('srcNoteLink'))}</button>`;
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
// every hero label starts with a capital, including the ones that open with
// «alle programområder»
export function capFirst(x) { return x.charAt(0).toUpperCase() + x.slice(1); }
export function renderChance(s, lensCat) {
  const box = document.getElementById('s-chance');
  const e = S.MODEL && S.MODEL.schools && S.MODEL.schools[`${s.fylke}|${s.name}`];
  if (!e || !e.programs) {
    // The map tooltip says "ingen prognose for denne skolen" for exactly this
    // case, and the branch below says it when a *category* has no forecast —
    // but hiding the box outright meant the whole-school case was the one
    // absence the panel never explained. A reader who never hovered the dot
    // would not learn the feature existed here at all.
    box.hidden = false;
    box.innerHTML = `<div>${esc(t('tipNoForecast'))}</div>`;
    return;
  }
  box.hidden = false;
  const adj = e.alpha === undefined ? ''
    : `<div class="adj tipped" title="${esc(t('adjTitle'))}">`
      + `${esc(t('adjLine', (round1(e.alpha) > 0 ? '+' : '') + fmt(e.alpha), fmt(e.alpha_se)))}</div>`;
  if (!chanceMode()) {
    box.className = 'chance prompt';
    box.innerHTML = `<div>${esc(t('chancePrompt', e.year))}</div>` + (adj ? chanceMore(adj) : '');
    return;
  }
  box.className = 'chance';
  const ch = schoolChance(s, lensCat || 'all', S.myPoints);
  if (!ch) { box.innerHTML = `<div>${esc(t('chanceNoneInScope'))}</div>` + (adj ? chanceMore(adj) : ''); return; }
  const noPred = Math.max(0, ch.total - ch.n);
  const head = ch.likely ? t('chanceHeadL', fmt(S.myPoints), ch.likely, ch.n, noPred, ch.total)
             : ch.possible ? t('chanceHeadR', fmt(S.myPoints), ch.possible, ch.n, noPred, ch.total)
             : t('chanceHeadU', fmt(S.myPoints), ch.n, noPred, ch.total);
  const bar = ['likely', 'possible', 'unlikely']
    .map(b => `<span class="b-${b}" style="width:${100 * ch[b] / ch.n}%"></span>`).join('');
  // the spread range the footnote quotes: history buckets times the level
  // multipliers (model.json meta), i.e. the narrowest and widest s deployed
  const sf: any[] = Object.values((S.MODEL.meta || {}).sigma_forecast || {});
  const sm: any[] = Object.values((S.MODEL.meta || {}).sigma_level_multiplier || {});
  const mlo = sm.length ? Math.min(...sm) : 1, mhi = sm.length ? Math.max(...sm) : 1;
  const lo = sf.length ? Math.round(Math.min(...sf) * mlo) : 5, hi = sf.length ? Math.round(Math.max(...sf) * mhi) : 8;
  const cov = S.MODEL.meta && S.MODEL.meta.backtest_eval_years && S.MODEL.meta.backtest_eval_years.coverage80;
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
  box.innerHTML = `<div class="h">${esc(head)}</div><div class="bar">${bar}</div>` + chanceMore(
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
