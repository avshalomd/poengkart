import { bucketColor, bucketOf, chanceMode, schoolChance } from "./chance";
import { forecastYears, liftMapControls } from "./chrome";
import { BINS, colorFor, esc, fmt, meanStep, round1, schoolPressure, shownPrograms, zeroLabel } from "./helpers";
import { CATS, t } from "./i18n";
import { drawMarkers, fitVisible, resizeMap, visibleSchools } from "./map";
import { schoolUrl } from './router';
import { listLayout, openSide, sideTrap } from "./sidebar";
import { S } from './state';
import { bindTitleTips, hideTip, showTip } from "./tips";

/* ================= list view ================= */
export function setView(v) {
  if (v !== 'map' && v !== 'list') return;
  if (v === 'map' && !S.map && S.DATA) return;  // the map view cannot be entered without a map
  if (v === 'list' && !S.DATA) return;     // the toggle is live before the fetch lands
  S.view = v;
  document.body.classList.toggle('view-list', v === 'list');
  document.getElementById('listview')!.hidden = v !== 'list';
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
}
export function deltaFor(s, cat, yr) {
  const base = shownPrograms(s);
  const st = meanStep(cat === 'all' ? base : base.filter(p => p.category === cat));
  return st.latest === yr ? st.d : null;
}
export function sortList(key) {
  const fromHeader = !!document.activeElement?.closest?.('#listview th');
  S.listSort = S.listSort.key === key
    ? { key, dir: -S.listSort.dir }
    : { key, dir: key === 'name' || key === 'fylke' ? 1 : -1 };
  renderListView();
  // the table was rebuilt under the pressed header; keep the reader on it
  if (fromHeader) (document.querySelector(`#listview th.col-${key} button`) as any)?.focus({ preventScroll: true });
}
export function renderListView() {
  const host = document.getElementById('listview');
  const chance = chanceMode();
  const allF = S.mapFylke === 'all';
  // a sort key can outlive its column (points cleared, county picked)
  if ((S.listSort.key === 'chance' && !chance) || (S.listSort.key === 'fylke' && !allF)) {
    S.listSort = { key: 'value', dir: -1 };
  }
  const rows = visibleSchools().map(s => {
    const pr = schoolPressure(s, S.mapCat);
    const v = pr.kind === 'points' ? pr.v : null;
    const sc = chance ? schoolChance(s, S.mapCat, S.myPoints) : null;
    return { s, pr, v, delta: pr.kind === 'points' ? deltaFor(s, S.mapCat, pr.year) : null,
             sc, best: sc ? sc.best : null };
  });
  const nil = x => x === null || x === undefined;
  rows.sort((a, b) => {
    const k = S.listSort.key;
    if (k === 'name') return a.s.name.localeCompare(b.s.name, 'no') * S.listSort.dir;
    if (k === 'fylke') return (a.s.fylke.localeCompare(b.s.fylke, 'no')
      || a.s.name.localeCompare(b.s.name, 'no')) * S.listSort.dir;
    const va = k === 'value' ? a.v : k === 'delta' ? a.delta : a.best;
    const vb = k === 'value' ? b.v : k === 'delta' ? b.delta : b.best;
    if (nil(va) && nil(vb)) return a.s.name.localeCompare(b.s.name, 'no');
    if (nil(va)) return 1;
    if (nil(vb)) return -1;
    return (va! - vb!) * S.listSort.dir || a.s.name.localeCompare(b.s.name, 'no');
  });
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
  const deltaCell = r => {
    if (r.delta === null) return `<span class="none-v">—</span>`;
    const d = round1(r.delta);           // sign, colour and text agree
    return `<span class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${esc(fmt(d))}</span>`;
  };
  const chanceCell = r => !r.sc ? `<span class="none-v">—</span>`
    : `<span class="k" style="background:${bucketColor(bucketOf(r.sc.best))}"></span>` +
      esc(t('listChanceCell', r.sc.likely, r.sc.n));
  host!.innerHTML =
    `<div class="card"><div class="lhead">` +
    `<span class="t" id="list-title">${esc(catLabel)} · ${esc(fyLabel)}</span>` +
    `<span class="n">${esc(t('listCount', rows.length))}</span></div>` +
    (rows.length === 0 ? `<div class="foot">${esc(t('listEmpty'))}</div>` : '') +
    `<div class="tblwrap"${rows.length ? '' : ' hidden'}>` +
    `<table aria-labelledby="list-title" class="${chance ? 'has-chance' : ''}${S.listSort.key === 'delta' ? ' by-delta' : ''}"><thead><tr>` +
    th('name', t('listColSchool')) +
    (allF ? th('fylke', t('listColFylke')) : '') +
    th('value', t('listColVal'), true, t('listColValTip')) +
    th('delta', t('listColDelta'), true, t('listColDeltaTip')) +
    (chance ? th('chance', t('listColChance'), false, t('listColChanceTip', fmt(S.myPoints), forecastYears(rows.map(r => r.s)))) : '') +
    `</tr></thead><tbody>` +
    rows.map((r, i) =>
      `<tr data-i="${i}">` +
      `<td class="sc"><a href="${schoolUrl(r.s)}" aria-label="${esc(t('listRowAria', r.s.name))}">${esc(r.s.name)}</a></td>` +
      (allF ? `<td class="fy">${esc(r.s.fylke)}</td>` : '') +
      `<td class="num">${chip(r)}</td>` +
      `<td class="num dl">${deltaCell(r)}</td>` +
      (chance ? `<td class="ch-cell">${chanceCell(r)}</td>` : '') +
      `</tr>`).join('') +
    `</tbody></table></div>` +
    (allF && rows.length ? `<div class="foot">${esc(t('listRounds'))}</div>` : '') +
    `</div>`;
  host!.querySelectorAll('tbody tr').forEach((tr: any) => {
    tr.onclick = ev => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1) return;  // new tab stays a new tab
      ev.preventDefault();
      openSide(rows[+tr.dataset.i].s);    // the whole row is a target; the link carries the semantics
    };
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
}
