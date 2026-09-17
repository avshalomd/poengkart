import { refocus, toggleChoice } from "./chance";
import { renderChartCard } from "./chart";
import { renderCatNote, renderLegend } from "./chrome";
import { esc } from "./helpers";
import { t } from "./i18n";
import { renderListView } from "./listview";
import { drawMarkers, setLens, setLevels } from "./map";
import { clearScope, renderSide, widenFor } from "./sidebar";
import { S } from './state';
import { listHtml } from "./templates";
import { bindTips, hideTip, showTip } from "./tips";

/* ================= program list ================= */
export function renderList() {
  // One scope for the whole app: the utdanningsprogram lens. Selecting a
  // programme-area row narrows the chart but never the list or the map.
  // (The programme-area filter box was removed 2 Sept 2026 — the longest list
  // is 41 rows, short enough to scroll — so the lens is the only filter left.)
  const scope = S.mapCat !== 'all' ? S.mapCat : null;
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
    S.chart.prog = null; setLens(cat);
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
