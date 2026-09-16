import { bucketOf, chanceFinal, chanceMode, chanceOf, finalRoundBridge, isChosen, modelEntry, pct, pctS, predFor, refocus, toggleChoice } from "./chance";
import { renderChartCard } from "./chart";
import { renderCatNote, renderLegend } from "./chrome";
import { esc, fmt, isRecent, isVg1, levelScope, numericLatest, partitionPrograms, progId, progName, shownPrograms, visibleIn } from "./helpers";
import { CATS, t } from "./i18n";
import { renderListView } from "./listview";
import { drawMarkers, setLens, setLevels } from "./map";
import { clearScope, renderSide, widenFor } from "./sidebar";
import { S } from './state';
import { bindTips, hideTip, showTip } from "./tips";

/* ================= program list ================= */
export function renderList() {
  // One scope for the whole app: the utdanningsprogram lens. Selecting a
  // programme-area row narrows the chart but never the list or the map.
  // (The programme-area filter box was removed 2 Sept 2026 — the longest list
  // is 41 rows, short enough to scroll — so the lens is the only filter left.)
  const scope = S.mapCat !== 'all' ? S.mapCat : null;
  const base = shownPrograms(S.current);
  const inScope = base.filter(p => !scope || p.category === scope);
  const { regular, orphans, prioNames } = partitionPrograms(inScope);
  const byCat = {};
  [...regular, ...orphans].forEach(p => (byCat[p.category] = byCat[p.category] || []).push(p));
  let html = '';
  if (scope) {
    // the rows the lens hides, of those the list would show without it: counted
    // over every row, «(+34)» promised history rows that «Vis alle» never showed
    const hidden = visibleIn(base) - visibleIn(inScope);
    html += `<div class="scope-chip"><span>${CATS[scope][S.lang]}</span>` +
            `<button type="button" class="scope-all">${t('scopeAll')}${hidden ? ` (+${hidden})` : ''}</button></div>`;
  }
  const badged = new Set();  // badge only the first row per program name
  let rowsSoFar = 0;
  for (const c of Object.keys(CATS).filter(c => byCat[c])) {
    const list = byCat[c];
    list.sort((a, b) => (numericLatest(b.values)?.[1] ?? -1) - (numericLatest(a.values)?.[1] ?? -1));
    // A group of one whose row carries the group's own name said the same thing
    // twice, a heading over itself («STUDIESPESIALISERING 1» above
    // «Studiespesialisering»). That row stands alone; a rule sets it off from
    // the group above, whose last row it otherwise seemed to be.
    const solo = list.length === 1 && progName(list[0]).toLowerCase() === CATS[c][S.lang].toLowerCase();
    if (!solo) html += `<button class="cat-head" data-cat="${c}" aria-pressed="${S.mapCat === c}"><span>${CATS[c][S.lang]}</span><span class="cnt">${list.length}</span></button>`;
    for (const p of list) {
      // headline value: newest non-priority cell (F is a quota fact, not a value)
      let latestYear = null, lv;
      const ys = Object.keys(p.values).sort();
      for (let i = ys.length - 1; i >= 0; i--) {
        if (p.values[ys[i]] !== 'F') { latestYear = ys[i]; lv = p.values[ys[i]]; break; }
      }
      // A programme whose NEWEST cell is F is a fortrinnsrett programme today,
      // whatever an older year says: Bergeland's Vg3 Medier (2019 U, then F
      // every year since) read "Utgått" and offered a + it cannot have.
      const orphan = latestYear === null || p.values[ys[ys.length - 1]] === 'F';
      const hasF = ys.some(y => p.values[y] === 'F');
      const val = orphan ? `<span class="soft" data-tip="${esc(t('fortrinnTitle'))}">${t('priority')} ⓘ</span>`
        : lv === 0 ? `<span class="soft" data-tip="${esc(t('noPoints'))} – ${esc(t('noPointsTitle'))}">${t('noPointsShort')} ⓘ</span>`
        : typeof lv === 'number' ? `${fmt(lv)}<small>${latestYear}</small>`
        : lv === 'open' ? `<span class="soft">${t('allIn')}</span>`
        : lv === 'D' ? `<span class="soft" data-tip="${esc(t('docAdm'))} – ${esc(t('docTitle'))}">${t('docAdmShort')}</span>`
        : `<span class="soft">${t('gone')}</span>`;
      const key = progId(p);
      let badge = '';
      if (!orphan && (prioNames.has(key) || hasF) && !badged.has(key)) {
        badged.add(key);
        badge = `<span class="fbadge" title="${esc(t('fortrinnTitle'))}">${t('prioBadge')}</span>`;
      }
      const sel = S.chart.prog === p ? ' sel' : '';
      let chip = '', chipTxt = '';
      if (chanceMode() && !orphan) {
        const pr = predFor(S.current, p);
        if (pr) {
          const ch = chanceOf(pr, S.myPoints);
          let tip = t('chTitle', pct(ch), pr.year, fmt(pr.m), fmt(pr.s), pct(pr.pi), pr.h);
          const fb = finalRoundBridge(S.current);
          if (fb) tip += ' ' + t('finalRoundChip', fb.to_round, pct(chanceFinal(pr, S.myPoints, p.category, fb)));
          chip = `<span class="ch b-${bucketOf(ch)}" data-tip="${esc(tip)}">${pctS(ch)}</span>`;
          chipTxt = tip + (pr.h === 1 ? ` (${t('lowHist')})` : '');
          // one observed year is a thin basis: say so next to the figure
          if (pr.h === 1) chip = `<span class="chw">${chip}<span class="hist">${t('lowHist')}</span></span>`;
        } else if ((modelEntry(S.current, p) || {}).h === 0) {
          chip = `<span class="ch none" data-tip="${esc(t('noHistTitle'))}">${t('noHist')}</span>`;
          chipTxt = t('noHistTitle');
        }
      }
      const on = isChosen(S.current, p), idx = S.current.programs.indexOf(p);
      // A button inside a button is invalid, and a screen reader read the whole
      // row as one control: the + had no name of its own and no role, and the
      // chips' help was unreachable. The name is now the row's button, the + a
      // button beside it, and what the chips and the figure say is the name's
      // description.
      const pick = orphan ? '' : `<button type="button" class="pick${on ? ' on' : ''}" data-idx="${idx}"` +
        ` aria-pressed="${on}" aria-label="${esc(t(on ? 'pickRemove' : 'pickAdd'))}" title="${esc(t(on ? 'pickRemove' : 'pickAdd'))}">${on ? '✓' : '+'}</button>`;
      const lvl = t('levels')[p.level];
      const valTxt = orphan ? t('fortrinnTitle')
        : lv === 0 ? `${t('noPoints')} – ${t('noPointsTitle')}`
        : typeof lv === 'number' ? `${fmt(lv)} (${latestYear})`
        : lv === 'open' ? t('allIn')
        : lv === 'D' ? `${t('docAdm')} – ${t('docTitle')}`
        : t('gone');
      const desc = [chipTxt, lvl ? `${p.level}: ${lvl[1]}` : p.level, valTxt]
        .filter(Boolean).map(x => String(x).trim().replace(/\.$/, '')).join('. ') + '.';
      html += `<div class="prow${sel}${orphan ? ' muted' : ''}${solo && rowsSoFar ? ' solo' : ''}" data-cat="${c}" data-idx="${idx}">` +
              `<button type="button" class="nm" aria-describedby="pd-${idx}"${p.official ? ` title="${esc(t('officialName', p.official))}"` : ''}>${esc(progName(p))}${badge}</button>` +
              `${chip}<span class="lv">${esc(p.level)}</span><span class="end"><span class="val">${val}</span>${pick}</span>` +
              `<span id="pd-${idx}" hidden>${esc(desc)}</span></div>`;
      rowsSoFar++;
    }
  }
  // the disclosure for history: how many rows the recency filter is hiding
  // from this view (same lens), or the way back once shown
  const inLevel = levelScope(S.current.programs);
  const hiddenMatch = S.showOld ? []
    : inLevel.filter(p => !base.includes(p) && (!scope || p.category === scope));
  const anyOld = inLevel.some(p => !isRecent(p, S.current.fylke));
  let oldBtn = '';
  if (hiddenMatch.length) oldBtn = `<button class="oldnote">${esc(t('oldHidden', hiddenMatch.length))}</button>`;
  else if (S.showOld && anyOld) oldBtn = `<button class="oldnote">${esc(t('oldShown'))}</button>`;
  // the disclosure for the later years: the Vg2+ rows the level default keeps
  // out of this view (same lens, same recency rule), or the way back to Vg1
  const later = S.current.programs.filter(p => !inLevel.includes(p) && (!scope || p.category === scope)
                                             && (S.showOld || isRecent(p, S.current.fylke)));
  const anyLater = S.current.programs.some(p => !isVg1(p));
  let lvBtn = '';
  // its own class: the history line's handler binds to the first .oldnote, and
  // a shared class made one click flip both toggles
  if (later.length) lvBtn = `<button class="lvnote">${esc(t('levelsHidden', later.length))}</button>`;
  else if (S.allLevels && anyLater) lvBtn = `<button class="lvnote">${esc(t('levelsShown'))}</button>`;
  const el = document.getElementById('s-list');
  // the scope chip alone is not content: an empty row set says "no matches"
  // whether or not a chip sits above it
  if (![...regular, ...orphans].length) html += `<div class="cat-head">${t('noMatch')}</div>`;
  el.innerHTML = html + lvBtn + oldBtn;
  el.querySelector('.lvnote')?.addEventListener('click', () => {
    setLevels(!S.allLevels);
    refocus('#s-list .lvnote', '#s-list .prow button.nm');
  });
  el.querySelector('.oldnote')?.addEventListener('click', () => {
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
  el.querySelector('.scope-all')?.addEventListener('click', () => {
    clearScope();
    refocus('#s-list .cat-head[data-cat="' + scope + '"]', '#s-list .prow button.nm');
  });
  el.querySelectorAll('.cat-head[data-cat]').forEach((b: any) => b.onclick = () => {
    const cat = b.dataset.cat;
    S.chart.prog = null; setLens(cat);
    refocus(`#s-list .cat-head[data-cat="${cat}"]`, '#s-list .scope-all', '#s-list .prow button.nm');
  });
  // the whole row still selects, as it did as one button; its name carries the focus
  el.querySelectorAll('.prow').forEach((r: any) => r.onclick = ev => {
    if (ev.target.closest('.pick')) return;
    S.chart.prog = S.current.programs[+r.dataset.idx]; renderChartCard(); renderList();
    refocus(`#s-list .prow[data-idx="${r.dataset.idx}"] button.nm`);
  });
  el.querySelectorAll('.pick').forEach((k: any) => k.onclick = ev => {
    ev.stopPropagation();
    toggleChoice(S.current, S.current.programs[+k.dataset.idx]);
    refocus(`#s-list .pick[data-idx="${k.dataset.idx}"]`);
  });
  bindTips(el);
  // what a chip or the level says on hover, on keyboard focus too
  el.querySelectorAll('.prow button.nm').forEach((b: any) => {
    const row = b.closest('.prow'), c = row.querySelector('.ch[data-tip], .soft[data-tip]');
    const entry = t('levels')[row.querySelector('.lv')?.textContent.trim()];
    const html = c ? esc(c.dataset.tip) : entry ? `<b>${esc(entry[0])}</b><br>${esc(entry[1])}` : '';
    if (!html) return;
    b.addEventListener('focus', () => { if (b.matches(':focus-visible')) showTip(b, html); });
    b.addEventListener('blur', hideTip);
    b.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && !document.getElementById('tip').hidden) { hideTip(); ev.stopPropagation(); }
    });
  });
}

export function initPrograms() {
}
