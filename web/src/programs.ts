import { isChosen, refocus, toggleChoice } from "./chance";
import { renderChartCard } from "./chart";
import { renderCatNote, renderLegend } from "./chrome";
import { esc, progName, sheetLens } from "./helpers";
import { t } from "./i18n";
import { renderListView } from "./listview";
import { drawMarkers, setLevels } from "./map";
import { clearScope, renderSide, setSheetLens, widenFor } from "./sidebar";
import { S } from './state';
import { play, POP, still } from "./motion";
import { listHtml } from "./templates";
import { bindTips, hideTip, showTip } from "./tips";

/* ================= program list ================= */
// A wish added or removed changes one thing in the sheet, its pick: set it
// where it stands, so its transitions run and focus never leaves it. Turning
// on, it answers with a small spring.
export function syncPicks() {
  const set = (b: any, on: boolean, name?: string) => {
    if (b.classList.contains('on') === on) return;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', t(on ? 'pickRemove' : 'pickAdd') + (name ? ` – ${name}` : ''));
    b.title = t(on ? 'pickRemove' : 'pickAdd');
    if (on && !still()) play(b, [{ transform: 'scale(.86)' }, { transform: 'none' }], POP);
  };
  const s = S.current;
  if (s) document.querySelectorAll('#s-list .pick').forEach((b: any) => set(b, isChosen(s, s.programs[+b.dataset.idx])));
  // the List view's programme-area rows carry the same toggle
  if (S.DATA) document.querySelectorAll('#listview .pick').forEach((b: any) => {
    const x = S.DATA!.schools[+b.dataset.si], p = x && x.programs[+b.dataset.idx];
    if (p) set(b, isChosen(x, p), `${progName(p)}, ${x.name}`);
  });
}
export function renderList() {
  // The sheet's utdanningsprogram lens (sheetLens). Selecting a
  // programme-area row narrows the chart but never the list or the map.
  // (The programme-area filter box was removed 2 Sept 2026 — the longest list
  // is 41 rows, short enough to scroll — so the lens is the only filter left.)
  const scope = sheetLens() !== 'all' ? sheetLens() : null;
  const el = document.getElementById('s-list');
  el!.innerHTML = listHtml(S.current!, scope);
  el!.querySelector('.lvnote')?.addEventListener('click', () => {
    setLevels(!S.allLevels);
    refocus('#s-list .lvnote', '#s-list .prow button.nm');
  });
  el!.querySelector('.oldnote')?.addEventListener('click', () => {
    S.showOld = !S.showOld;
    try { localStorage.setItem('pk-showold', S.showOld ? '1' : '0'); } catch (e) {}
    // Everything that counts the shown set follows: the lens (hiding history
    // can leave it empty), the dots and their tooltips, the legend's count,
    // the note under the select and the List view's rows.
    widenFor(S.current);
    drawMarkers(); renderLegend(); renderCatNote();
    if (S.view === 'list') renderListView();
    renderSide();
    refocus('#s-list .oldnote', '#s-list .prow button.nm');
  });
  // Each of these redraws the list under the pressed control; the refocus puts
  // a keyboard reader back on it rather than on <body>.
  el!.querySelector('.scope-all')?.addEventListener('click', () => {
    clearScope();
    refocus('#s-list .cat-head[data-cat="' + scope + '"]', '#s-list .prow button.nm');
  });
  el!.querySelectorAll('.cat-head[data-cat]').forEach((b: any) => b.onclick = () => {
    const cat = b.dataset.cat;
    S.chart.prog = null; setSheetLens(cat);
    refocus(`#s-list .cat-head[data-cat="${cat}"]`, '#s-list .scope-all', '#s-list .prow button.nm');
  });
  // the whole row still selects, as it did as one button; its name carries the focus
  el!.querySelectorAll('.prow').forEach((r: any) => r.onclick = ev => {
    if (ev.target.closest('.pick')) return;
    S.chart.prog = S.current!.programs[+r.dataset.idx]; renderChartCard(); renderList();
    refocus(`#s-list .prow[data-idx="${r.dataset.idx}"] button.nm`);
  });
  el!.querySelectorAll('.pick').forEach((k: any) => k.onclick = ev => {
    ev.stopPropagation();
    toggleChoice(S.current, S.current!.programs[+k.dataset.idx]);
    refocus(`#s-list .pick[data-idx="${k.dataset.idx}"]`);
  });
  bindTips(el);
  // what a chip or the level says on hover, on keyboard focus too
  el!.querySelectorAll('.prow button.nm').forEach((b: any) => {
    const row = b.closest('.prow'), c = row.querySelector('.ch[data-tip], .soft[data-tip]');
    const entry = t('levels')[row.querySelector('.lv')?.textContent.trim()];
    const html = c ? esc(c.dataset.tip) : entry ? `<b>${esc(entry[0])}</b><br>${esc(entry[1])}` : '';
    if (!html) return;
    b.addEventListener('focus', () => { if (b.matches(':focus-visible')) showTip(b, html); });
    b.addEventListener('blur', hideTip);
    b.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && !document.getElementById('tip')!.hidden) { hideTip(); ev.stopPropagation(); }
    });
  });
}

export function initPrograms() {
}
