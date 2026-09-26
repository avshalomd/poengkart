import { bucketColor, bucketOf, chanceMode, chanceOf, isChosen, OPEN_CHANCE, openOnly, pctS, predFor, schoolChance, toggleChoice } from "./chance";
import { forecastYears, liftMapControls } from "./chrome";
import { BINS, colorFor, esc, fmt, HELD_OUT, meanStep, partitionPrograms, progName, round1, schoolPressure, shownPrograms, X_ICON, zeroLabel } from "./helpers";
import { CATS, t } from "./i18n";
import { locHelpKind, toast } from "./locate";
import { drawMarkers, fitVisible, mapZoom, prefersStill, resizeMap, visibleSchools } from "./map";
import { distOf, fmtKm, placeLabel, saveNear } from "./places";
import { schoolUrl } from './router';
import { EASE, play, still } from "./motion";
import { listLayout, openSide, renderSide, sideTrap } from "./sidebar";
import { S } from './state';
import { PICK_FACE } from "./templates";
import { bindTitleTips, hideTip, say, showTip } from "./tips";
import type { CellValue, Place, Program, School } from './types';

const PIN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
  ' stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/>' +
  '<circle cx="12" cy="10" r="2.3"/></svg>';

/* ================= list view ================= */
export function setView(v) {
  if (v !== 'map' && v !== 'list') return;
  if (v === 'map' && !S.map && S.DATA) return;  // the map view cannot be entered without a map
  if (v === 'list' && !S.DATA) return;     // the toggle is live before the fetch lands
  const moved = viewShown && S.view !== v;
  S.view = v;
  // the view the app opens in is not a switch: the pill starts where it is
  const over = document.querySelector('#view-toggle .over') as HTMLElement;
  if (!viewShown && over) over.style.transition = 'none';
  document.body.classList.toggle('view-list', v === 'list');
  document.getElementById('listview')!.hidden = v !== 'list';
  if (!viewShown && over) { void over.offsetWidth; over.style.transition = ''; }
  viewShown = true;
  for (const [id, name] of [['view-map', 'map'], ['view-list', 'list']]) {
    const b = document.getElementById(id);
    b!.classList.toggle('on', S.view === name);
    b!.setAttribute('aria-pressed', String(S.view === name));
  }
  try { localStorage.setItem('pk-view', v); } catch (e) {}
  listLayout();
  sideTrap(document.body.classList.contains('side-open'));   // the two views cover differently
  if (v === 'list') renderListView();
  else if (S.map) {
    drawMarkers();                       // list mode skipped every marker rebuild
    resizeMap();
    liftMapControls();
    if (S.refitPending) { S.refitPending = false; fitVisible(false); }
  }
  if (moved) pushView(v);
}
// The view comes in from the side the pill went to — the list from the right,
// the map from the left — 10% of the way, as it fades in. With less motion
// asked for it only fades.
let viewShown = false, viewAnim: Animation[] = [];
function pushView(v) {
  viewAnim.forEach(a => a.cancel());
  const el = document.getElementById(v === 'list' ? 'listview' : 'map');
  const x = still() ? [] : [
    play(el, [{ transform: `translateX(${v === 'list' ? 10 : -10}%)` }, { transform: 'none' }], { duration: 260, easing: EASE.out })];
  viewAnim = [...x, play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: still() ? 200 : 220, easing: still() ? 'ease' : EASE.out })]
    .filter(Boolean) as Animation[];
}
export function deltaFor(s, cat, yr) {
  const base = shownPrograms(s);
  const st = meanStep(cat === 'all' ? base : base.filter(p => p.category === cat));
  return st.latest === yr ? st.d : null;
}
const BAND_RANK = { likely: 2, possible: 1, unlikely: 0 };
// the direction a column opens in: names and distance up, figures down
const ASC = new Set(['name', 'fylke', 'place', 'dist']);
export function sortList(key) {
  const fromHeader = !!document.activeElement?.closest?.('#listview th');
  S.listSort = S.listSort.key === key
    ? { key, dir: -S.listSort.dir }
    : { key, dir: ASC.has(key) ? 1 : -1 };
  renderListView();
  // the table was rebuilt under the pressed header; keep the reader on it
  if (fromHeader) (document.querySelector(`#listview th.col-${key} button`) as any)?.focus({ preventScroll: true });
}
/* A place to measure from: a kommune or post town picked in the search, or
   the reader's own position. The list gains a distance column and sorts by it;
   the map flies there. Kept in this browser (places.ts saveNear), never sent. */
export function setNear(p: Place | null) {
  if (p && p.kind === 'me') {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(pos => {
      setNear({ name: t('nearMeName'), kind: 'me', lat: pos.coords.latitude, lon: pos.coords.longitude });
    }, err => {
      if (err && err.code === 1) toast(t('locDenied') + ' ' + t('locHow', ...locHelpKind()), 12000);
      else toast(t('locFail'));
    }, { timeout: 10000, maximumAge: 60000 });
    return;
  }
  S.near = p ? { name: p.name, kind: p.kind, lat: p.lat, lon: p.lon } : null;
  saveNear();
  if (S.near) S.listSort = { key: 'dist', dir: 1 };
  else if (S.listSort.key === 'dist') S.listSort = { key: 'value', dir: -1 };
  if (S.view === 'list') renderListView();
  else if (S.near && S.map) {
    const to = { center: [S.near.lon, S.near.lat] as [number, number], zoom: Math.max(mapZoom(), 9.5) };
    if (prefersStill()) S.map.jumpTo(to); else S.map.flyTo(to);
  }
  say(S.near ? t('nearSet', S.near.name) : t('nearCleared'));
}
export function setListMode(m) {
  if (m !== 'schools' && m !== 'areas') return;
  S.listMode = m;
  try { localStorage.setItem('pk-listmode', m); } catch (e) {}
  // programme areas are there to be ranked by chance; a place picked first
  // keeps its distance order
  if (m === 'areas' && chanceMode() && !S.near) S.listSort = { key: 'chance', dir: -1 };
  renderListView();
  (document.querySelector(`#listview .lmode button[data-m="${m}"]`) as any)?.focus({ preventScroll: true });
}
// One row per programme area, across the schools the filters leave: what is
// open to 33 points near Voss, on one screen. The areas are the ones the
// school's own sheet lists under the lens, less fortrinnsrett-only rows and
// discontinued ones, which no application can name.
type AreaRow = { s: School; p: Program; si: number; lv: CellValue | null; yr: string | null;
                 m: number | null; c: number | null; open: boolean; dist: number | null };
export function areaRows(): AreaRow[] {
  const out: AreaRow[] = [];
  for (const s of visibleSchools()) {
    const base = shownPrograms(s);
    const { regular } = partitionPrograms(S.mapCat === 'all' ? base : base.filter(p => p.category === S.mapCat));
    const si = S.DATA!.schools.indexOf(s), dist = distOf(s);
    for (const p of regular) {
      const ys = Object.keys(p.values).sort();
      const newest = p.values[ys[ys.length - 1]];
      if (newest === 'U' || newest === 'F') continue;
      let yr: string | null = null, lv: CellValue | null = null;
      for (let i = ys.length - 1; i >= 0; i--) if (p.values[ys[i]] !== 'F') { yr = ys[i]; lv = p.values[ys[i]]; break; }
      const pr = predFor(s, p);
      const open = !pr && openOnly(p);
      out.push({ s, p, si, lv, yr, m: pr ? pr.m : null, dist, open,
                 c: chanceMode() ? (pr ? chanceOf(pr, S.myPoints) : open ? OPEN_CHANCE : null) : null });
    }
  }
  return out;
}
export function renderListView() {
  const host = document.getElementById('listview');
  const chance = chanceMode();
  const allF = S.mapFylke === 'all';
  const areas = S.listMode === 'areas';
  // a sort key can outlive its column (points cleared, county picked, the
  // place let go, the other row kind)
  const k0 = S.listSort.key;
  if ((k0 === 'chance' && !chance) || (k0 === 'fylke' && !allF) || (k0 === 'dist' && !S.near)
      || (k0 === 'delta' && areas) || (k0 === 'fc' && !areas)) {
    S.listSort = { key: 'value', dir: -1 };
  }
  const nil = x => x === null || x === undefined;
  const byName = (a, b) => a.s.name.localeCompare(b.s.name, 'no');
  const byPlace = (a, b) => (a.s.kommune || '').localeCompare(b.s.kommune || '', 'no') || (a.s.sted || '').localeCompare(b.s.sted || '', 'no');
  const k = S.listSort.key, dir = S.listSort.dir;
  const cmpNum = (va, vb, tie) => nil(va) && nil(vb) ? tie : nil(va) ? 1 : nil(vb) ? -1 : (va - vb) * dir || tie;
  let rows: any[];
  if (areas) {
    rows = areaRows();
    const pname = (a, b) => progName(a.p).localeCompare(progName(b.p), 'no') || a.p.level.localeCompare(b.p.level);
    const num = r => typeof r.lv === 'number' ? r.lv : null;
    rows.sort((a, b) => {
      const tie = byName(a, b) || pname(a, b);
      if (k === 'name') return tie * dir;
      if (k === 'fylke') return (a.s.fylke.localeCompare(b.s.fylke, 'no') || tie) * dir;
      if (k === 'place') return (byPlace(a, b) || tie) * dir;
      if (k === 'dist') return cmpNum(a.dist, b.dist, tie);
      if (k === 'fc') return cmpNum(a.m, b.m, tie);
      if (k === 'chance') return cmpNum(a.c, b.c, tie);
      return cmpNum(num(a), num(b), tie);
    });
  } else {
    rows = visibleSchools().map(s => {
      const pr = schoolPressure(s, S.mapCat);
      const v = pr.kind === 'points' ? pr.v : null;
      const sc = chance ? schoolChance(s, S.mapCat, S.myPoints) : null;
      return { s, pr, v, delta: pr.kind === 'points' ? deltaFor(s, S.mapCat, pr.year) : null,
               sc, best: sc ? sc.best : null, dist: distOf(s) };
    });
    rows.sort((a, b) => {
      if (k === 'name') return byName(a, b) * dir;
      if (k === 'fylke') return (a.s.fylke.localeCompare(b.s.fylke, 'no') || byName(a, b)) * dir;
      if (k === 'place') return (byPlace(a, b) || byName(a, b)) * dir;
      if (k === 'dist') return cmpNum(a.dist, b.dist, byName(a, b));
      const va = k === 'value' ? a.v : k === 'delta' ? a.delta : a.best;
      const vb = k === 'value' ? b.v : k === 'delta' ? b.delta : b.best;
      if (nil(va) && nil(vb)) return byName(a, b);
      if (nil(va)) return 1;
      if (nil(vb)) return -1;
      // Sjanse sorts by what its cell shows — the dot's band, then «L av n», then
      // n — so the order can be checked from the rows. It used to sort on the best
      // single chance, which the cell does not print: at 40 points most of those
      // are 0,99-something, and «4 av 4», «6 av 8», «2 av 2» came out shuffled.
      if (k === 'chance') {
        const key = r => [BAND_RANK[bucketOf(r.sc.best)], r.sc.likely / r.sc.n, r.sc.n];
        const ka = key(a), kb = key(b), i = ka.findIndex((x, j) => x !== kb[j]);
        return i < 0 ? byName(a, b) : (ka[i] - kb[i]) * dir;
      }
      return (va! - vb!) * dir || byName(a, b);
    });
  }
  // The glyph is always in the markup, invisible on the columns that are not
  // sorted. Rendering it only on the active one added ~10px to that header's
  // min-content width and removed it from the previous one, and with an auto
  // table layout that re-flowed EVERY column: sorting by Endring visibly jumped
  // the school, county and value columns sideways. Same trick as the
  // calculator's ✕ — invisible, not absent — and it doubles as the hint that an
  // unsorted header is clickable at all.
  const arrow = k => `<span aria-hidden="true" class="ar${S.listSort.key === k ? ' on' : ''}">` +
    `${S.listSort.key === k && S.listSort.dir > 0 ? '↑' : '↓'}</span>`;
  const ariaSort = k => S.listSort.key === k
    ? ` aria-sort="${S.listSort.dir < 0 ? 'descending' : 'ascending'}"` : '';
  // the column key rides on the cell so the stylesheet can drop a whole column
  // at a breakpoint without this function having to know about viewports
  const th = (k, label, num?, tip?) =>
    `<th class="col-${k} ${num ? 'num ' : ''}${S.listSort.key === k ? 'on' : ''}"${ariaSort(k)} scope="col"` +
    `${tip ? ` title="${esc(tip)}"` : ''}>` +
    `<button type="button" onclick="sortList('${k}')"${tip ? ` aria-describedby="thd-${k}"` : ''}>${esc(label)}${arrow(k)}</button>` +
    `${tip ? `<span id="thd-${k}" hidden>${esc(tip)}</span>` : ''}</th>`;
  const catLabel = S.mapCat === 'all' ? t('allCats') : (CATS[S.mapCat] || {})[S.lang] || S.mapCat;
  const fyLabel = allF ? t('allFylker') : S.mapFylke;
  const chip = r => {
    if (r.pr.kind === 'open') return `<span class="chip open">${esc(t('listOpen'))}</span>`;
    if (r.pr.kind === 'zero') return `<span class="chip zero" title="${esc(r.pr.openN ? zeroLabel(r.pr.zeroN, r.pr.openN) : `${t('noPoints')} – ${t('noPointsTitle')}`)}">${esc(t('noPointsShort'))}</span>`;
    if (r.v === null) {
      const tip = r.pr.kind === 'stale' ? ` title="${esc(t('tipStale', r.pr.year))}"` : '';
      return `<span class="none-v"${tip}>${esc(t('listNoData'))}</span>`;
    }
    const band = BINS.findIndex(b => r.v < b.max);
    return `<span class="chip b${band}" style="background:${colorFor(r.v)}"` +
      ` title="${esc(r.pr.year)}">${esc(fmt(r.v))}</span>`;
  };
  // one programme area's newest published cell, as the sheet prints it
  const areaChip = r => {
    if (r.lv === 'open') return `<span class="chip open">${esc(t('listOpen'))}</span>`;
    if (r.lv === 0) return `<span class="chip zero" title="${esc(t('noPoints'))} – ${esc(t('noPointsTitle'))}">${esc(t('noPointsShort'))}</span>`;
    if (typeof r.lv !== 'number') return `<span class="none-v">${esc(r.lv === 'D' ? t('docAdmShort') : t('listNoData'))}</span>`;
    const band = BINS.findIndex(b => r.lv < b.max);
    return `<span class="chip b${band}" style="background:${colorFor(r.lv)}" title="${esc(r.yr)}">${esc(fmt(r.lv))}</span>`;
  };
  // the same figure in words, under the name where a phone has no room for its column
  const cutInline = r => r.lv === 'open' ? t('listOpen').toLowerCase()
    : typeof r.lv === 'number' ? t('listCutInline', fmt(r.lv), r.yr) : r.lv === 0 ? t('noPointsShort') : t('listNoData').toLowerCase();
  const deltaCell = r => {
    if (r.delta === null) return `<span class="none-v">—</span>`;
    const d = round1(r.delta);           // sign, colour and text agree
    return `<span class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${esc(fmt(d))}</span>`;
  };
  const chanceCell = r => !r.sc ? `<span class="none-v">—</span>`
    : `<span class="k" style="background:${bucketColor(bucketOf(r.sc.best))}"></span>` +
      esc(t('listChanceCell', r.sc.likely, r.sc.n));
  const areaChance = r => r.c === null ? `<span class="none-v">—</span>`
    // the Grense cell beside it already says «Ingen venteliste»
    : r.open ? `<span class="ch b-likely tipped" title="${esc(t('openNearTitle'))}">${esc(pctS(r.c))}</span>`
    : `<span class="ch b-${bucketOf(r.c)}">${esc(pctS(r.c))}</span>`;
  const distTxt = r => r.dist === null ? '' : fmtKm(r.dist);
  // under the name on a phone, where the place and distance columns are gone
  const sub = r => {
    const bits = [placeLabel(r.s), S.near ? distTxt(r) : ''].filter(Boolean).join(' · ');
    return bits ? `<span class="pl">${esc(bits)}</span>` : '';
  };
  const nameCell = r => `<td class="sc"><a href="${schoolUrl(r.s)}" aria-label="${esc(t('listRowAria', r.s.name))}">${esc(r.s.name)}</a>` +
    (areas ? `<span class="pa">${esc(progName(r.p))} · ${esc(r.p.level)}<span class="gr"> · ${esc(cutInline(r))}</span></span>` : '') + sub(r) + `</td>`;
  const placeCells = r => `<td class="pc">${esc(placeLabel(r.s))}</td>` +
    (allF ? `<td class="fy">${esc(r.s.fylke)}</td>` : '') +
    (S.near ? `<td class="num dist">${esc(distTxt(r))}</td>` : '');
  const pick = r => {
    const on = isChosen(r.s, r.p), lab = t(on ? 'pickRemove' : 'pickAdd');
    return `<button type="button" class="pick${on ? ' on' : ''}" data-si="${r.si}" data-idx="${r.s.programs.indexOf(r.p)}"` +
      ` aria-pressed="${on}" aria-label="${esc(lab)} – ${esc(`${progName(r.p)}, ${r.s.name}`)}" title="${esc(lab)}">${PICK_FACE}</button>`;
  };
  const yrs = forecastYears(rows.map(r => r.s));
  const nearBtn = `<button type="button" id="list-near" class="near${S.near ? ' on' : ''}" onclick="openSearchOv('places')">` +
    `${PIN_ICON}<span>${esc(S.near ? t('nearChip', S.near.name) : t('nearBtn'))}</span></button>` +
    (S.near ? `<button type="button" id="list-near-x" class="near-x" onclick="setNear(null)" aria-label="${esc(t('nearClear'))}" title="${esc(t('nearClear'))}">${X_ICON}</button>` : '');
  const modeSeg = `<div class="seg lmode" role="group" aria-label="${esc(t('listModeLabel'))}">` +
    [['schools', t('listModeSchools')], ['areas', t('listModeAreas')]].map(([m, l]) =>
      `<button type="button" data-m="${m}" class="${S.listMode === m ? 'on' : ''}" aria-pressed="${S.listMode === m}" onclick="setListMode('${m}')">${esc(l)}</button>`).join('') +
    `</div>`;
  const head = `<tr>` +
    th('name', t('listColSchool')) +
    th('place', t('listColPlace')) +
    (allF ? th('fylke', t('listColFylke')) : '') +
    (S.near ? th('dist', t('listColDist'), true, t('listColDistTip', S.near.name)) : '') +
    (areas
      ? th('value', t('listColCut'), true, t('listColCutTip')) +
        th('fc', t('listColFc'), true, t('listColFcTip', yrs)) +
        (chance ? th('chance', t('listColChance'), true, t('listColChanceTip', fmt(S.myPoints), yrs)) : '') +
        `<th class="col-pick"><span class="vh">${esc(t('listColPick'))}</span></th>`
      : th('value', t('listColVal'), true, t('listColValTip')) +
        th('delta', t('listColDelta'), true, t('listColDeltaTip')) +
        (chance ? th('chance', t('listColChance'), false, t('listColChanceTip', fmt(S.myPoints), yrs)) : '')) +
    `</tr>`;
  const body = rows.map((r, i) => `<tr data-i="${i}">` + nameCell(r) + placeCells(r) +
    (areas
      ? `<td class="num cut">${areaChip(r)}</td>` +
        `<td class="num fc">${r.m === null ? `<span class="none-v">—</span>` : esc(fmt(r.m))}</td>` +
        (chance ? `<td class="num ch-cell">${areaChance(r)}</td>` : '') +
        `<td class="pk">${pick(r)}</td>`
      : `<td class="num">${chip(r)}</td>` +
        `<td class="num dl">${deltaCell(r)}</td>` +
        (chance ? `<td class="ch-cell">${chanceCell(r)}</td>` : '')) +
    `</tr>`).join('');
  host!.innerHTML =
    `<div class="card"><div class="lhead">` +
    `<span class="t" id="list-title">${esc(catLabel)} · ${esc(fyLabel)}</span>` +
    `<span class="n">${esc(t(areas ? 'listCountAreas' : 'listCount', rows.length))}</span></div>` +
    `<div class="lctl">${modeSeg}<span class="nearwrap">${nearBtn}</span></div>` +
    (areas && !chance && rows.length ? `<div class="foot top">${esc(t('listAreasNoPts'))}</div>` : '') +
    (rows.length === 0 ? `<div class="foot">${esc(t('listEmpty'))}</div>` : '') +
    `<div class="tblwrap"${rows.length ? '' : ' hidden'}>` +
    `<table aria-labelledby="list-title" class="${chance ? 'has-chance' : ''}${S.listSort.key === 'delta' ? ' by-delta' : ''}${areas ? ' areas' : ''}${S.near ? ' has-near' : ''}"><thead>` +
    head + `</thead><tbody>` + body + `</tbody></table></div>` +
    (allF && rows.length ? `<div class="foot">${esc(t('listRounds'))}</div>` : '') +
    (S.near && rows.length ? `<div class="foot">${esc(t('nearFoot'))}</div>` : '') +
    // the rows of a held-out county sort against the rest here, and its note
    // lives on the school sheet: say it where the comparison happens
    ((heldShown => heldShown.length
      ? `<div class="foot">${esc(t('listHeldOut', heldShown.join(', ')))}</div>` : '')(
        [...new Set(rows.filter(r => HELD_OUT.has(r.s.fylke)).map(r => r.s.fylke))])) +
    `</div>`;
  host!.querySelectorAll('tbody tr').forEach((tr: any) => {
    tr.onclick = ev => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1) return;  // new tab stays a new tab
      if (ev.target.closest('.pick')) return;
      ev.preventDefault();
      const r = rows[+tr.dataset.i];
      openSide(r.s);    // the whole row is a target; the link carries the semantics
      // an area row opens its school on that area's own line
      if (r.p) { S.chart.prog = r.p; renderSide(); }
    };
  });
  host!.querySelectorAll('.pick').forEach((b: any) => b.onclick = ev => {
    ev.stopPropagation();
    toggleChoice(S.DATA!.schools[+b.dataset.si], S.DATA!.schools[+b.dataset.si].programs[+b.dataset.idx]);
  });
  bindTitleTips(host);
  // a title reaches a pointer only; the keyboard gets the same help on focus
  host!.querySelectorAll('th button[aria-describedby]').forEach(b => {
    const d = document.getElementById(b.getAttribute('aria-describedby')!);
    b.addEventListener('focus', () => { if (d && b.matches(':focus-visible')) showTip(b, esc(d.textContent)); });
    b.addEventListener('blur', hideTip);
  });
}

export function initListview() {
  S.listSort = { key: 'value', dir: -1 };
  try { if (localStorage.getItem('pk-listmode') === 'areas') S.listMode = 'areas'; } catch (e) {}
}
