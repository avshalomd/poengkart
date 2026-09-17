import { esc } from "./helpers";
import { t } from "./i18n";
import { hideSheet, openSheetHistory, setModalTrap, showSheet } from "./intro";
import { onMapFylke, prefersStill } from "./map";
import { openSide } from "./sidebar";
import { S } from './state';

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
  if (s.county) {                          // the county row: filter, as the select would
    const sel: any = document.getElementById('map-fylke');
    if (sel) sel.value = s.county;
    onMapFylke(s.county);
    return;
  }
  if (s.lat && S.view === 'map') {
    const z = Math.max(S.map!.getZoom(), 11);
    prefersStill() ? S.map!.setView([s.lat, s.lon!], z) : S.map!.flyTo([s.lat, s.lon!], z);
  }
  openSide(s);
}
export function openSearchOv() {
  const q: any = document.getElementById('ov-q');
  q.value = ''; S.ovHits = []; S.ovAct = -1;
  q.placeholder = t('searchPh');
  q.setAttribute('aria-label', t('searchLabel'));
  document.getElementById('ov-box')!.setAttribute('aria-label', t('searchLabel'));
  document.getElementById('ov-list')!.setAttribute('aria-label', t('searchLabel'));
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
