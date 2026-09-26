/* The sheet as strings. Every function here is data in, HTML out: the client
   (sidebar.ts, programs.ts) assigns the strings and then wires the DOM; the
   build (pages/[fylke]/[skole].astro through prerender.ts) writes the same
   strings into the page, so a school's page carries the school before any
   script runs and nothing moves when the script takes over. This module must
   stay importable without a DOM: state, helpers, i18n, types — and no map engine. */
import { S } from './state';
import { t, CATS } from './i18n';
import { esc, fmt, photoSrc, capFirst, shownPrograms, visibleIn, openMix, zeroLabel, staleBefore, OPEN_RULE, HELD_OUT,
         partitionPrograms, numericLatest, progId, progName, levelScope, isRecent, isVg1, isPoints, meanStep, BUG_ICON, X_ICON } from './helpers';
import { bucketOf, chanceFinal, chanceMode, chanceOf, finalRoundBridge, isChosen, modelEntry, pct, pctS, predFor } from './forecast';
import type { School, County } from './types';

export interface HeroCell { v: string | number; l: string; cls?: string; ti?: string }

// esc() protects the attribute but not the scheme, and every one of these
// comes from a scrape rather than from us
const web = u => (/^https?:\/\//i.test(u || '') ? u : '');

export function photoHtml(s: School): string {
  // the pipeline stores the credit with a Norwegian "Foto:" prefix; the label
  // is UI text and follows the language, the credited name does not
  const creditText = t('photoCredit', (s.photo_credit
    || (s.photo_source === 'commons' ? 'Wikimedia Commons' : 'Wikipedia')).replace(/^\s*(foto|photo)\s*:\s*/i, ''));
  const creditHref = web(s.photo_page) || web(s.wiki_url) || '';
  const credit = s.photo
    ? `<div class="credit">` + (creditHref
        ? `<a href="${esc(creditHref)}" target="_blank" rel="noopener">${esc(creditText)}</a>`
        : esc(creditText)) + '</div>'
    : '';
  const pos = s.photo_position ? ` style="--photo-pos:${esc(s.photo_position)}"` : '';
  return (s.photo ? `<img src="${esc(photoSrc(s.photo))}" data-full="${esc(s.photo)}"`
                 + ` alt="" loading="lazy"${pos}>`
                 : `<div id="s-minimap"></div>`) +
    `<div class="veil"></div>` +
    `<button class="close bug" onclick="openBug(current, this)" aria-label="${esc(t('bugSchoolLabel'))}">${BUG_ICON}</button>` +
    `<button class="close" onclick="closeSide()" aria-label="${esc(t('closeAria'))}">${X_ICON}</button>` +
    `<div class="name"><h2>${esc(s.name)}</h2>${credit}</div>`;
}
// meta links
export function metaHtml(s: School): string {
  const meta: string[] = [];
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
  return meta.join('');
}
// the county's own history of this school, where it is not one school's own
export function notesHtml(s: School): string {
  const notes: string[] = [];
  if (s.merged_from && s.merged_year) {
    notes.push(t('mergedNote', s.merged_from.join(t('listAnd')), s.merged_year, s.merged_from.length));
  }
  if (s.uncertain_years && s.uncertain_years.length) {
    notes.push(t('uncertainNote', s.uncertain_years.join(', ')));
  }
  const cy: Partial<County> = (S.DATA!.counties || []).find(c => c.fylke === s.fylke) || {};
  const odd = Object.entries(cy.round_years || {})
    .filter(([y]) => s.programs.some(p => y in p.values));
  for (const [y, r] of odd) notes.push(t('roundYearNote', y, r));
  // where "ingen venteliste" is the county's own rule, say so beside the rows
  if (OPEN_RULE.has(s.fylke) && s.programs.some(p => Object.values(p.values).includes('open'))) {
    notes.push(t('openRuleNote'));
  }
  // where the county's figures are not comparable and it is outside the
  // model, say so on every school
  if (HELD_OUT.has(s.fylke)) notes.push(t('heldOutNote', s.fylke));
  return notes.map(n => `<p>${esc(n)}</p>`).join('');
}
// the hero figure and the mix warning under it describe one scope: the rows
// the lens leaves, and the step between the last two years of their mean
const heroScope = (s: School, lensCat: string | null) => {
  const base = shownPrograms(s);
  const scopePrograms = lensCat ? base.filter(p => p.category === lensCat) : base;
  const step = meanStep(scopePrograms);
  return { scopePrograms, step };
};
// One statistic everywhere: the dot on the map, this figure and the blue
// line are all the mean of the same cells, and the change is the last step
// of that line — so a reader can check the subtraction and it comes out.
// What a mean cannot say on its own is how much of the school never had a
// waitlist, so that is spelled out underneath instead of hidden in it.
export function heroCells(s: School, lensCat: string | null): HeroCell[] {
  const cells: HeroCell[] = [];
  const { scopePrograms, step } = heroScope(s, lensCat);
  const { latest, prev, mean, meanPrev }: any = step;
  const scopeLabel = lensCat ? CATS[lensCat][S.lang] : t('heroTypicalAll');
  if (mean !== null) {
    cells.push({ v: fmt(mean), l: `${t('heroTypical')} · ${scopeLabel} ${latest}` });
    if (meanPrev !== null) {
      const d = step.d;
      cells.push({ v: (d! > 0 ? '+' : '') + fmt(d), l: t('heroDelta', prev),
                   cls: d! > 0 ? 'up' : d! < 0 ? 'dn' : '', ti: t('heroDeltaBasis') });
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
  return cells;
}
export function heroHtml(s: School, lensCat: string | null): { hero: string; mix: string } {
  const cells = heroCells(s, lensCat);
  const { scopePrograms, step } = heroScope(s, lensCat);
  const { latest, mean }: any = step;
  const hero =
    cells.map(c => `<div class="cell"${c.ti ? ` title="${esc(c.ti)}"` : ''}>` +
                   `<div class="v ${c.cls || ''}">${c.v}</div><div class="l">${capFirst(c.l)}</div></div>`).join('');
  const mix = openMix(scopePrograms, latest);
  const warn = !(mix.mostly && mean !== null) ? ''
    : `<span class="sign" aria-hidden="true">⚠</span><span>` +
      esc(t('mostlyOpenNote', mix.open, mix.total, latest,
             scopePrograms.map(p => p.values[latest]).filter(isPoints).length)) + `</span>`;
  return { hero, mix: warn };
}
export function srcNoteHtml(): string {
  return esc(t('srcNote')) +
    ` <button class="lnk" onclick="contactOpener = this; openContact('tall')">${esc(t('srcNoteLink'))}</button>`;
}
// The pick's face: a fill, a + and a ✓, all present in both states. .on
// spreads the fill from the centre and turns the + into the ✓, as transitions,
// so the button changes where it stands and a second press turns it back
// mid-way (syncPicks updates it in place rather than redrawing the list).
export const PICK_FACE = '<span class="fill" aria-hidden="true"></span>' +
  '<svg class="ip" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>' +
  '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
export function listHtml(s: School, scope: string | null): string {
  const base = shownPrograms(s);
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
    // Compared in Norwegian whatever the language: the English row carries Udir's
    // title and the English heading the app's short form, so they never matched
    // and the English sheet set «Sports 1» over «Sports and Physical Education».
    const solo = list.length === 1 && list[0].program.toLowerCase() === CATS[c].no.toLowerCase();
    if (!solo) html += `<button class="cat-head" data-cat="${c}" aria-pressed="${S.mapCat === c}"><span>${CATS[c][S.lang]}</span><span class="cnt">${list.length}</span></button>`;
    for (const p of list) {
      // headline value: newest non-priority cell (F is a quota fact, not a value)
      let latestYear: string | null = null, lv;
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
      // an unusual newest step (the model's j): the two newest figures, named
      let jump = '', jumpTxt = '';
      const je = typeof lv === 'number' ? modelEntry(s, p) : null;
      if (je && je.j != null) {
        const ny = ys.filter(y => typeof p.values[y] === 'number' && p.values[y] > 0).slice(-2);
        if (ny.length === 2) {
          jumpTxt = t('jumpTitle', fmt(p.values[ny[0]]), ny[0], fmt(p.values[ny[1]]), ny[1], fmt(Math.abs(je.j)));
          jump = `<span class="jump" data-tip="${esc(jumpTxt)}">${t('jumpFlag')} ⓘ</span>`;
        }
      }
      const key = progId(p);
      let badge = '';
      if (!orphan && (prioNames.has(key) || hasF) && !badged.has(key)) {
        badged.add(key);
        badge = `<span class="fbadge" title="${esc(t('fortrinnTitle'))}">${t('prioBadge')}</span>`;
      }
      const sel = S.chart.prog === p ? ' sel' : '';
      let chip = '', chipTxt = '';
      if (chanceMode() && !orphan) {
        const pr = predFor(s, p);
        if (pr) {
          const ch = chanceOf(pr, S.myPoints);
          // a held-out county's fill probability is pinned at 1 by construction
          // (its source has no fill state), so the row never claims a queue
          let tip = t('chTitle', pct(ch), pr.year, fmt(pr.m), fmt(pr.s),
                      HELD_OUT.has(s.fylke) ? null : pct(pr.pi), pr.h);
          const fb = finalRoundBridge(s);
          if (fb) tip += ' ' + t('finalRoundChip', fb.to_round, pct(chanceFinal(pr, S.myPoints, p.category, fb)));
          chip = `<span class="ch b-${bucketOf(ch)}" data-tip="${esc(tip)}">${pctS(ch)}</span>`;
          chipTxt = tip + (pr.h === 1 ? ` (${t('lowHist')})` : '');
          // one observed year is a thin basis: say so next to the figure
          if (pr.h === 1) chip = `<span class="chw">${chip}<span class="hist">${t('lowHist')}</span></span>`;
        } else if ((modelEntry(s, p) || {}).h === 0) {
          chip = `<span class="ch none" data-tip="${esc(t('noHistTitle'))}">${t('noHist')}</span>`;
          chipTxt = t('noHistTitle');
        }
      }
      const on = isChosen(s, p), idx = s.programs.indexOf(p);
      // A button inside a button is invalid, and a screen reader read the whole
      // row as one control: the + had no name of its own and no role, and the
      // chips' help was unreachable. The name is now the row's button, the + a
      // button beside it, and what the chips and the figure say is the name's
      // description.
      const pick = orphan ? '' : `<button type="button" class="pick${on ? ' on' : ''}" data-idx="${idx}"` +
        ` aria-pressed="${on}" aria-label="${esc(t(on ? 'pickRemove' : 'pickAdd'))}" title="${esc(t(on ? 'pickRemove' : 'pickAdd'))}">${PICK_FACE}</button>`;
      // the level's glossary entry: the row's description below, and the chip's
      // own .tipped mark — written here on the very condition bindTips() marks
      // it on, so a prerendered page is already the page the script takes over
      // and no dotted underline appears at boot
      const lvl = t('levels')[p.level];
      const valTxt = orphan ? t('fortrinnTitle')
        : lv === 0 ? `${t('noPoints')} – ${t('noPointsTitle')}`
        : typeof lv === 'number' ? `${fmt(lv)} (${latestYear})`
        : lv === 'open' ? t('allIn')
        : lv === 'D' ? `${t('docAdm')} – ${t('docTitle')}`
        : t('gone');
      const desc = [chipTxt, lvl ? `${p.level}: ${lvl[1]}` : p.level, valTxt, jumpTxt]
        .filter(Boolean).map(x => String(x).trim().replace(/\.$/, '')).join('. ') + '.';
      html += `<div class="prow${sel}${orphan ? ' muted' : ''}${solo && rowsSoFar ? ' solo' : ''}" data-cat="${c}" data-idx="${idx}">` +
              `<button type="button" class="nm" aria-describedby="pd-${idx}"${p.official ? ` title="${esc(t('officialName', p.official))}"` : ''}>${esc(progName(p))}${badge}</button>` +
              `${chip}<span class="lv${lvl ? ' tipped' : ''}">${esc(p.level)}</span><span class="end">${jump}<span class="val">${val}</span>${pick}</span>` +
              `<span id="pd-${idx}" hidden>${esc(desc)}</span></div>`;
      rowsSoFar++;
    }
  }
  // the disclosure for history: how many rows the recency filter is hiding
  // from this view (same lens), or the way back once shown
  const inLevel = levelScope(s.programs);
  const hiddenMatch = S.showOld ? []
    : inLevel.filter(p => !base.includes(p) && (!scope || p.category === scope));
  const anyOld = inLevel.some(p => !isRecent(p, s.fylke));
  let oldBtn = '';
  if (hiddenMatch.length) oldBtn = `<button class="oldnote">${esc(t('oldHidden', hiddenMatch.length))}</button>`;
  else if (S.showOld && anyOld) oldBtn = `<button class="oldnote">${esc(t('oldShown'))}</button>`;
  // the disclosure for the later years: the Vg2+ rows the level default keeps
  // out of this view (same lens, same recency rule), or the way back to Vg1
  const later = s.programs.filter(p => !inLevel.includes(p) && (!scope || p.category === scope)
                                             && (S.showOld || isRecent(p, s.fylke)));
  const anyLater = s.programs.some(p => !isVg1(p));
  let lvBtn = '';
  // its own class: the history line's handler binds to the first .oldnote, and
  // a shared class made one click flip both toggles
  if (later.length) lvBtn = `<button class="lvnote">${esc(t('levelsHidden', later.length))}</button>`;
  else if (S.allLevels && anyLater) lvBtn = `<button class="lvnote">${esc(t('levelsShown'))}</button>`;
  // the scope chip alone is not content: an empty row set says "no matches"
  // whether or not a chip sits above it
  if (![...regular, ...orphans].length) html += `<div class="cat-head">${t('noMatch')}</div>`;
  return html + lvBtn + oldBtn;
}
