import { esc } from "./helpers";
import { t } from "./i18n";
import { hideSheet, openSheetHistory, setModalTrap, showSheet } from "./intro";
import { mapZoom, onMapFylke, viewSchool } from "./map";
import { openSide } from "./sidebar";
import { S } from './state';
import type { School } from './types';

/* ================= search overlay (design C trial) ================= */
export function renderOvList() {
  const box = document.getElementById('ov-list');
  const q: any = document.getElementById('ov-q');
  box!.innerHTML = !q.value.trim() ? ''
    : S.ovHits.length
    ? S.ovHits.map((s, i) =>
        s.county
        ? `<div class="opt county${i === S.ovAct ? ' act' : ''}" id="ov-opt-${i}" role="option"` +
          ` aria-selected="${i === S.ovAct}"><span>${esc(t('searchCounty', s.county))}</span></div>`
        : `<div class="opt${i === S.ovAct ? ' act' : ''}" id="ov-opt-${i}" role="option"` +
        ` aria-selected="${i === S.ovAct}"><span>${esc(s.name)}</span>` +
        `<span class="fy">${esc(s.fylke)}</span></div>`).join('')
    : `<div class="none" role="option" aria-disabled="true">${esc(t('noMatch'))}</div>`;
  q.setAttribute('aria-expanded', String(!!q.value.trim()));
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
export function openSearchOv() {
  const q: any = document.getElementById('ov-q');
  q.value = ''; S.ovHits = []; S.ovAct = -1;
  q.placeholder = t('searchPh');
  q.setAttribute('aria-label', t('searchLabel'));
  document.getElementById('ov-box')!.setAttribute('aria-label', t('searchLabel'));
  document.getElementById('ov-list')!.setAttribute('aria-label', t('searchLabel'));
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
  const b = document.getElementById('searchov-btn');
  (b && b.offsetParent ? b : document.getElementById('panel'))?.focus();
}

export function initSearchov() {
}
