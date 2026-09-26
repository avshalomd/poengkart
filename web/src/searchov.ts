import { esc } from "./helpers";
import { runSearch } from "./search";
import { t } from "./i18n";
import { hideSheet, openSheetHistory, setModalTrap, showSheet } from "./intro";
import { setNear } from "./listview";
import { mapZoom, onMapFylke, viewSchool } from "./map";
import { openSide } from "./sidebar";
import { S } from './state';
import type { School } from './types';

// 'places' when the list's «Nær …» button opened the overlay: it then offers
// places only, and the reader's own position before anything is typed
let ovMode: 'all' | 'places' = 'all';
export const searchMode = () => ovMode;

/* ================= search overlay (design C trial) ================= */
export function renderOvList() {
  const box = document.getElementById('ov-list');
  const q: any = document.getElementById('ov-q');
  const opt = (i, cls, inner) => `<div class="opt${cls}${i === S.ovAct ? ' act' : ''}" id="ov-opt-${i}" role="option"` +
    ` aria-selected="${i === S.ovAct}">${inner}</div>`;
  const listed = !!q.value.trim() || (ovMode === 'places' && S.ovHits.length > 0);
  box!.innerHTML = !listed ? ''
    : S.ovHits.length
    ? S.ovHits.map((s, i) =>
        s.county ? opt(i, ' county', `<span>${esc(t('searchCounty', s.county))}</span>`)
        : s.place ? opt(i, ' place', s.place.kind === 'me' ? `<span>${esc(t('nearMe'))}</span>`
            : `<span>${esc(t('nearPlace', s.place.name))}</span>` +
              `<span class="fy">${esc(t('nearSchools', s.place.n))}${s.place.fylke ? ` · ${esc(s.place.fylke)}` : ''}</span>`)
        : opt(i, '', `<span>${esc(s.name)}</span>` +
          `<span class="fy">${esc([s.kommune, s.fylke].filter((x, j, a) => x && a.indexOf(x) === j).join(' · '))}</span>`)).join('')
    : `<div class="none" role="option" aria-disabled="true">${esc(t(ovMode === 'places' ? 'nearNone' : 'noMatch'))}</div>`;
  q.setAttribute('aria-expanded', String(listed));
  if (S.ovAct >= 0) q.setAttribute('aria-activedescendant', 'ov-opt-' + S.ovAct);
  else q.removeAttribute('aria-activedescendant');
  box!.querySelectorAll('.opt').forEach((el: any, i) => {
    // mousedown wins the race against blur; the click binding is for assistive
    // tech, whose activation dispatches click only — pickOv self-guards, so a
    // mouse firing both is one pick
    el.onmousedown = ev => { ev.preventDefault(); pickOv(i); };
    el.onclick = ev => { ev.preventDefault(); pickOv(i); };
  });
  if (S.ovAct >= 0) document.getElementById('ov-opt-' + S.ovAct)?.scrollIntoView({ block: 'nearest' });
}
export function pickOv(i) {
  const s = S.ovHits[i];
  if (!s) return;
  S.ovHits = []; S.ovAct = -1;               // a second event on the same option is a no-op
  // dismiss directly instead of via closeSearchOv(): its history.back() is
  // asynchronous, and openSide() below would write the new school's hash onto
  // an entry the traversal was about to leave — sharing school A's link after
  // searching for school B. hideSheet touches no history, and the overlay
  // stops counting as the open sheet the moment it starts leaving, so the
  // panel below is reachable while the last frames of the fade play out.
  hideSheet('searchov');
  setModalTrap();
  // The overlay left in place, so its history entry is still the current one,
  // flagged pkSheet with no sheet open: syncUrl() then rewrote every later
  // filter change into it instead of giving each an entry, and after a school
  // was opened and closed it cost a Back that did nothing. Hand the entry on.
  const held = !!(history.state || {}).pkSheet;
  if (s.place) {                           // a place row: measure the list from there
    if (held) try { history.replaceState(null, '', location.href); } catch (e) {}
    setNear(s.place);
    const b = document.getElementById(S.view === 'list' ? 'list-near' : 'searchov-btn');
    (b && b.offsetParent ? b : document.getElementById('panel'))?.focus();
    return;
  }
  if (s.county) {                          // the county row: filter, as the select would
    const sel: any = document.getElementById('map-fylke');
    if (sel) sel.value = s.county;
    onMapFylke(s.county);                  // writes the county into the overlay's entry
    if (held) try { history.replaceState(null, '', location.href); } catch (e) {}
    const b = document.getElementById('searchov-btn');
    (b && b.offsetParent ? b : document.getElementById('panel'))?.focus();
    return;
  }
  if (held) {
    // no school underneath: the entry becomes the school's own, so the ✕ backs
    // out to where the search began. Over an open school it is only unflagged.
    const over = document.getElementById('side')!.classList.contains('open');
    try { history.replaceState(over ? null : { pkSide: 1 }, '', location.href); } catch (e) {}
  }
  // a hit is a school row: everything but the county row above them
  if (s.lat && S.view === 'map' && S.map) viewSchool(s as School, Math.max(mapZoom(), 10));
  openSide(s);
}
export function openSearchOv(mode?: 'all' | 'places') {
  ovMode = mode === 'places' ? 'places' : 'all';
  const q: any = document.getElementById('ov-q');
  q.value = ''; S.ovAct = -1;
  S.ovHits = ovMode === 'places' ? runSearch('', 'places') || [] : [];
  const label = t(ovMode === 'places' ? 'nearLabel' : 'searchLabel');
  q.placeholder = t(ovMode === 'places' ? 'nearPh' : 'searchPh');
  q.setAttribute('aria-label', label);
  document.getElementById('ov-box')!.setAttribute('aria-label', label);
  document.getElementById('ov-list')!.setAttribute('aria-label', label);
  document.getElementById('ov-x')!.setAttribute('aria-label', t('close'));
  renderOvList();
  showSheet('searchov');
  setModalTrap();
  openSheetHistory();
  setTimeout(() => q.focus(), 40);
}
export function closeSearchOv(fromHistory?) {
  if (!fromHistory && (history.state || {}).pkSheet) { history.back(); return; }
  hideSheet('searchov');
  setModalTrap();
  const b = document.getElementById(ovMode === 'places' ? 'list-near' : 'searchov-btn');
  (b && b.offsetParent ? b : document.getElementById('panel'))?.focus();
}

export function initSearchov() {
}
