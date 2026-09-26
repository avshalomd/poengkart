export { BANDS, ZQ_GRID, errCdf, chanceOf, bucketOf, pct, pctS, chanceMode, modelEntry, predFor, schoolChance, finalRoundBridge, chanceFinal, okChoice, progKeyMap, isChosen } from './forecast';
import { renderLegend } from "./chrome";
import { bucketOf, chanceMode, chanceOf, okChoice, pct, pctS, predFor, progKeyMap } from "./forecast";
import { cssVar, esc, fmt, progName, round1, slug, X_ICON } from "./helpers";
import { t } from "./i18n";
import { toast } from "./locate";
import { mapZoom, recolourMap, viewSchool } from "./map";
import { EASE, easeOut, play, still } from "./motion";
import { syncPicks } from "./programs";
import { openSide, renderSide } from "./sidebar";
import { S } from './state';
import { bindTitleTips, say } from "./tips";
import type { Program, School } from './types';

export const bucketColor = b => cssVar(b === 'likely' ? '--good' : b === 'possible' ? '--dot-possible' : '--dot-unlikely');
export function pickNote(msg) {
  // the .vnote in the choices box says the same thing, but on a phone that
  // box is hidden behind the open school sheet — the refusal must appear
  // where the tap happened, or the tap looks like it did nothing
  let el = document.getElementById('pick-note');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pick-note';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = '\u26a0 ' + msg;
  // Centred on the window it lay across the edge of a school sheet beside the
  // map, and over the legend's corner. Centre it on the free part instead, and
  // clear the legend beside it, or above it where the strip is too narrow.
  const sd = document.getElementById('side')!.getBoundingClientRect();
  const right = document.body.classList.contains('side-open') && sd.width > 0 && sd.left > 0 ? innerWidth - sd.left + 16 : 16;
  const lg = document.getElementById('legend')?.getBoundingClientRect();
  const nearLegend = lg && lg.height && lg.top < innerHeight - 70;
  el.style.right = right + 'px';
  el.style.left = el.style.bottom = '';
  if (nearLegend && innerWidth - right - (lg.right + 12) >= 280) el.style.left = Math.round(lg.right + 12) + 'px';
  else if (nearLegend) el.style.bottom = Math.round(innerHeight - lg.top + 12) + 'px';
  el.classList.add('show');
  clearTimeout(S.pickNoteTimer as ReturnType<typeof setTimeout>);
  S.pickNoteTimer = setTimeout(() => el.classList.remove('show'), 4500);
}
export function toggleChoice(s, p) {
  const k = progKeyMap(s).get(p);
  const i = S.choices.findIndex(c => c.f === s.fylke && c.s === s.name && c.k === k);
  S.choicesNote = null;
  if (i >= 0) { S.choices.splice(i, 1); choiceMove = { added: false }; }
  else {
    // vigo's own limits, so the list can only hold an application that could
    // actually be submitted: ten ranked wishes, and a Vg1 application names
    // at most three different utdanningsprogram
    const items = S.choices.map(resolveChoice).filter(Boolean) as Wish[];
    const refuse = key => {
      S.choicesNote = key;
      renderChoices();
      // the note is rendered inside #choices; on a desktop that card scrolls,
      // and the note landed 200px below its fold with nothing else happening
      const note: any = document.querySelector('#choices .vnote'), card = document.getElementById('panel');
      const onScreen = note && note.offsetParent && card && (() => {
        const n = note.getBoundingClientRect(), c = card.getBoundingClientRect();
        return n.top >= c.top && n.bottom <= c.bottom + 1;
      })();
      if (!onScreen) pickNote(t(key)); else say(t(key));
    };
    if (items.length >= 10) { refuse('vigoMaxWishes'); return; }
    if (p.level === 'Vg1') {
      const cats = new Set(items.filter(x => x.p.level === 'Vg1').map(x => x.p.category));
      if (!cats.has(p.category) && cats.size >= 3) { refuse('vigoMaxProgs'); return; }
    }
    S.choices.push({ f: s.fylke, s: s.name, k });
    choiceMove = { added: true };
  }
  try { localStorage.setItem('pk-choices', JSON.stringify(S.choices)); } catch (e) {}
  renderChoices();
  syncPicks();
}
// A redraw that replaces the focused control drops focus to <body>, and a
// keyboard or screen-reader user loses their place. Put it on the first of the
// given successors that is on screen, as renderSettings does; a focus the redraw
// did not touch is left alone. A control hidden with its container (Tøm, once
// the wishes are gone) still holds focus until the browser tidies up, so it
// counts as lost too. getClientRects, not offsetParent, which is null for a
// fixed element as well as a hidden one.
export function refocus(...cands) {
  const shown = el => el && el.isConnected && el.getClientRects().length > 0;
  const a = document.activeElement;
  if (a && a !== document.body && shown(a)) return;
  for (const c of cands) {
    const el = typeof c === 'string' ? document.querySelector(c) : c;
    if (shown(el)) { el.focus({ preventScroll: true }); return; }
  }
}
/** A wish that still resolves against the dataset: the school and the row. */
export type Wish = { s: School; p: Program };
export function resolveChoice(c) {
  if (!okChoice(c) || !S.DATA) return null;
  // A school respelled without moving its address («St.Olav» became «St. Olav»,
  // 22 Sept 2026) is the same school: find it by its slug and re-key the wish.
  let s = S.DATA.schools.find(x => x.fylke === c.f && x.name === c.s);
  if (!s) {
    s = S.DATA.schools.find(x => x.fylke === c.f && slug(x.name) === slug(c.s));
    if (s) c.s = s.name;
  }
  if (!s) return null;
  const km = progKeyMap(s);
  let p = s.programs.find(q => km.get(q) === c.k);
  // A refresh that tidies a label («SK 3år» to «SK 3 år») or joins two spellings
  // of one series changes the key, and the wish was pruned for good. Find the
  // series by its name at another position, or by a former label the pipeline
  // keeps in aliases, and re-key the wish to it.
  if (!p) {
    // a joined series can also settle on one level of a «Vg2/Vg3» row
    const [name, level = ''] = c.k.split('|'), lv = q => q.level === level || level.split('/').includes(q.level);
    p = s.programs.find(q => lv(q) && q.program.toLowerCase() === name)
      || s.programs.find(q => lv(q) && (q.aliases || []).includes(name));
    if (p) c.k = km.get(p);
  }
  return p ? { s, p } : null;
}
// What the last toggle did, for the redraw it causes to show: a wish added
// opens its row at the foot of the list, and on any toggle the band bar
// re-divides from where it stood and the totals crossfade.
let choiceMove: { added: boolean } | null = null;
type ChoicesWas = { segs: Record<string, { x: number; w: number }>; head: Element | null; sum: Element | null };
function choicesWas(box: HTMLElement): ChoicesWas {
  const bar = box.querySelector('.bar'), segs = {};
  if (bar) {
    const b = bar.getBoundingClientRect();
    bar.querySelectorAll('span').forEach(sp => { const r = sp.getBoundingClientRect(); segs[sp.className] = { x: r.left - b.left, w: r.width }; });
  }
  return { segs, head: box.querySelector('.h > span')?.cloneNode(true) as Element || null,
           sum: box.querySelector('.sum')?.cloneNode(true) as Element || null };
}
function showChoiceMove(box: HTMLElement, added: boolean, was: ChoicesWas | null) {
  const calm = still(), fade = (el, ms = 200) => play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease' });
  if (!was) {                              // the list itself has just appeared
    if (calm) fade(box);
    else play(box, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: EASE.out });
    return;
  }
  const row = added ? box.querySelector('.list .row:last-child') as HTMLElement : null;
  if (row && calm) fade(row);
  else if (row) {
    const cs = getComputedStyle(row);
    row.style.overflow = 'hidden';
    const open = play(row, [{ height: '0px', paddingTop: '0px', paddingBottom: '0px' },
      { height: row.offsetHeight + 'px', paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom }], { duration: 240, easing: EASE.out });
    if (open) open.finished.catch(() => {}).then(() => { row.style.overflow = ''; }); else row.style.overflow = '';
    play(row, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }],
      { duration: 220, delay: 60, easing: EASE.out, fill: 'backwards' });
  }
  const lag = added ? 120 : 0, bar = box.querySelector('.bar');
  if (bar && !Object.keys(was.segs).length) fade(bar);
  else if (bar && !calm) {
    const b = bar.getBoundingClientRect();
    bar.querySelectorAll('span').forEach(sp => {
      const o = was.segs[sp.className], r = sp.getBoundingClientRect(), x = r.left - b.left;
      if (!o || !r.width || (o.x === x && o.w === r.width)) return;
      play(sp, [{ transform: `translateX(${o.x - x}px) scaleX(${o.w / r.width})` }, { transform: 'none' }],
        { duration: 320, delay: lag, easing: EASE.io, fill: 'backwards' });
    });
  }
  // The old line stays over the new one, blurring out as the new one
  // sharpens. The copy is a sibling in a class of its own (.h-was, .sum-was),
  // placed just before the line so it stands where the line stands and moves
  // with it as the new row opens: nothing that reads .h or .sum can find it.
  const cross = (now: Element | null, old: Element | null, at: Element | null, kind: string) => {
    if (!now || !old || !at || now.textContent === old.textContent) return;
    if (calm) { play(now, [{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease' }); return; }
    const ghost = document.createElement('div');
    ghost.className = `${kind}-was xf-old`;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.append(...(kind === 'sum' ? [...old.childNodes] : [old]));
    at.before(ghost);
    // a margin collapses into the one above it for the line, not for the copy
    const dy = now.getBoundingClientRect().top - ghost.getBoundingClientRect().top;
    if (dy) ghost.style.marginTop = `${parseFloat(getComputedStyle(ghost).marginTop) + dy}px`;
    const out = play(ghost, [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(2px)' }],
      { duration: 180, delay: lag, easing: EASE.out, fill: 'both' });
    if (out) out.finished.catch(() => {}).then(() => ghost.remove()); else ghost.remove();
    play(now, [{ opacity: 0, filter: 'blur(2px)' }, { opacity: 1, filter: 'blur(0px)' }],
      { duration: 220, delay: lag + 40, easing: EASE.out, fill: 'backwards' });
  };
  cross(box.querySelector('.h > span'), was.head, box.querySelector('.h'), 'h');
  cross(box.querySelector('.sum'), was.sum, box.querySelector('.sum'), 'sum');
}
export function renderChoices() {
  const box = document.getElementById('choices');
  if (!S.DATA) return;
  // a toggle's motion, measured from the list as it stands; none when the
  // list is not on screen (a phone's sheet covers it)
  const move = choiceMove;
  choiceMove = null;
  const was = move && !box!.hidden && box!.getClientRects().length ? choicesWas(box!) : null;
  // a school or programme the dataset has since dropped or renamed leaves an
  // entry that can never render again; prune it rather than carry it forever.
  // A re-keyed wish is saved under its new key, and two spellings joined into
  // one series keep one wish.
  const before = JSON.stringify(S.choices), seen = new Set();
  const kept = S.choices.filter(c => resolveChoice(c))
    .filter(c => { const id = `${c.f}|${c.s}|${c.k}`; return !seen.has(id) && seen.add(id); });
  if (JSON.stringify(kept) !== before) {
    S.choices = kept;
    try { localStorage.setItem('pk-choices', JSON.stringify(S.choices)); } catch (e) {}
  }
  const items = S.choices.map(resolveChoice).filter(Boolean) as Wish[];
  box!.hidden = !items.length;
  if (!items.length) return;
  let rows = '', L = 0, R = 0, U = 0, n = 0, pNone = 1;
  items.forEach(({ s, p }, i) => {
    let chip = '';
    if (chanceMode()) {
      const pr = predFor(s, p);
      if (pr) {
        const c = chanceOf(pr, S.myPoints), b = bucketOf(c);
        n++; if (b === 'likely') L++; else if (b === 'possible') R++; else U++;
        pNone *= 1 - c;
        chip = `<span class="ch b-${b}">${pctS(c)}</span>`;
      } else chip = `<span class="ch" style="--b:var(--ink-3)">${esc(t('choicesNoPred'))}</span>`;
    }
    // each row names its own school and programme: "Remove from my choices",
    // repeated identically down a list, tells a screen reader nothing
    const what = `${progName(p)} · ${p.level}`;
    rows += `<div class="row">` +
      `<button class="who" data-i="${i}" title="${esc(t('choicesOpen'))}"` +
        ` aria-label="${esc(t('choicesOpenOne', s.name, what))}">` +
        `<span class="sc">${esc(s.name)}</span><span class="pr">${esc(what)}</span></button>` +
      chip + `<button class="rm" data-i="${i}"` +
        ` aria-label="${esc(t('choicesRemoveOne', s.name, what))}">${X_ICON}</button></div>`;
  });
  let sum = '';
  if (chanceMode() && n) {
    const bar = [['likely', L], ['possible', R], ['unlikely', U]]
      .map(([b, k]: any) => `<span class="b-${b}" style="width:${100 * k / n}%"></span>`).join('');
    sum = `<div class="bar">${bar}</div><div class="sum"><b>${esc(t('choicesSum', L, R, U))}</b>` +
      ` · <span class="tipped" title="${esc(t('choicesAnyTitle'))}">${esc(t('choicesAny', pct(1 - pNone)))}</span>` +
      (n < items.length ? `<span class="part">${esc(t('choicesPartial', n, items.length))}</span>` : '') +
      (L ? '' : `<span class="nudge">⚠ ${esc(t('choicesNudge'))}</span>`) + `</div>`;
  } else if (!chanceMode()) {
    sum = `<div class="sum">${esc(t('choicesNoPts'))}</div>`;
  }
  box!.innerHTML = `<div class="h"><span>${esc(t('choicesHead', items.length))}</span>` +
    `<button id="choices-clear">${esc(t('choicesClear'))}</button></div>` +
    `<div class="list">${rows}</div>` +
    (S.choicesNote ? `<div class="vnote">⚠ ${esc(t(S.choicesNote))}</div>` : '') + sum;
  if (move && box!.getClientRects().length) showChoiceMove(box!, move.added, was);
  box!.querySelectorAll('.who').forEach((b: any) => b.onclick = () => {
    const { s } = items[+b.dataset.i]; openSide(s);
    if (s.lat && S.map && S.view === 'map') viewSchool(s, Math.max(mapZoom(), 10));
  });
  box!.querySelectorAll('.rm').forEach((b: any) => b.onclick = () => {
    const i = +b.dataset.i, { s, p } = items[i];
    toggleChoice(s, p);
    // the redraw removed the pressed ✕: the next one takes its place, then the
    // points field once the list is gone
    const rms = document.querySelectorAll('#choices .rm');
    refocus(rms[Math.min(i, rms.length - 1)], '#my-points', '#map-cat', '#panel-sum', '#panel');
  });
  bindTitleTips(box);
  // Up to ten deliberate picks behind one small underlined word: ask once
  // rather than pop a system dialog, and forget the question after a few
  // seconds so a stray tap cannot arm it and a later one confirm it.
  const clr = document.getElementById('choices-clear');
  clr!.onclick = () => {
    if (!clr!.dataset.armed) {
      clr!.dataset.armed = '1';
      clr!.textContent = t('choicesClearSure');
      clr!.classList.add('arm');
      clearTimeout((renderChoices as any).armTimer);
      (renderChoices as any).armTimer = setTimeout(() => {
        delete clr!.dataset.armed;
        clr!.textContent = t('choicesClear');
        clr!.classList.remove('arm');
      }, 4000);
      return;
    }
    clearTimeout((renderChoices as any).armTimer);
    S.choices = [];
    try { localStorage.removeItem('pk-choices'); } catch (e) {}
    renderChoices();
    syncPicks();
    refocus('#my-points', '#map-cat', '#panel-sum', '#panel');
    toast(t('choicesCleared'));
  };
}
// Both a comma and a point are typed by real readers, so both are accepted
// whatever the interface language. A trailing separator ("42,") is someone
// mid-keystroke, not a mistake, so it clears the figure without being flagged.
export const PTS_OK = /^\d{1,2}([.,]\d{1,2})?$/;
export const PTS_TYPING = /^\d{0,2}([.,]\d{0,2})?$/;
export function parsePoints(v) {
  const txt = String(v == null ? '' : v).trim();
  if (!PTS_OK.test(txt)) return { pts: null, bad: !PTS_TYPING.test(txt) };
  const n = Math.round(parseFloat(txt.replace(',', '.')) * 10) / 10;
  // Nobody has fewer than 10 points (a straight-1 average), so a figure from
  // 1 to 6 is a grade average typed where points go: taken as points it
  // painted every school red. It is held back and offered ×10 instead.
  if (n >= 1 && n <= 6) return { pts: null, bad: false, avg: n };
  return n >= 0 && n <= 70 ? { pts: n, bad: false } : { pts: null, bad: true };
}
// A figure set in one go (the ✕, the calculator) is drawn at once.
export function onPoints(v) {
  setPoints(v);
  commitPoints();
}
// Typed, the field answers each keystroke and the map, the list and the sheet
// follow once the typing pauses for 250ms: «45» typed is then one recolour of
// the map, not two, and «42,» on the way to «42,5» leaves the map as it is
// until the next keystroke or until the field is left (flushPoints, on change).
let ptsTimer: ReturnType<typeof setTimeout> | undefined, ptsPending = false;
export function onPointsInput(v) {
  ptsPending = true;                   // before the render: no average hint mid-keystroke
  const r: any = setPoints(v);
  if (r.pts === null && !r.bad && !r.avg && String(v).trim() !== '') return;
  ptsTimer = setTimeout(commitPoints, 250);
}
export function flushPoints() { if (ptsPending) commitPoints(); }
function setPoints(v) {
  clearTimeout(ptsTimer);
  const r = parsePoints(v);
  S.myPoints = r.pts;
  S.ptsBad = r.bad;
  S.ptsAvg = (r as any).avg ?? null;
  // either field may have been typed in; a cleared figure clears both
  if (v === '') for (const id of ['my-points', 's-points']) {
    const inp: any = document.getElementById(id);
    if (inp) inp.value = '';
  }
  try {
    if (S.myPoints === null) localStorage.removeItem('pk-points');
    else localStorage.setItem('pk-points', String(S.myPoints));
  } catch (e) {}
  renderPointsField();
  return r;
}
function commitPoints() {
  clearTimeout(ptsTimer);
  ptsPending = false;
  const chipsWere = !!document.querySelector('#s-list .ch:not(.none)');
  renderPointsField();                 // the average hint waits for the pause
  renderChoices(); recolourMap(); renderLegend();
  if (S.current) { renderSide(); if (!chipsWere) countUpChips(); }
}
// The first chips an open sheet shows count up from 0 to their figure, 50ms
// apart, taking the colour of each band as they pass 35 and 70 %: the scale
// taught once, on the rows the reader is looking at. A later edit changes
// them without counting. The chip ends on exactly the text it was drawn with.
function countUpChips() {
  const bottom = document.querySelector('#side > .scroll')!.getBoundingClientRect().bottom;
  const chips = [...document.querySelectorAll('#s-list .ch:not(.none)')]
    .filter(c => c.getClientRects().length && c.getBoundingClientRect().top < bottom).slice(0, 10) as HTMLElement[];
  chips.forEach((c, i) => {
    if (still()) { play(c, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' }); return; }
    play(c, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }],
      { duration: 200, delay: i * 50, easing: EASE.out, fill: 'backwards' });
    const text = c.textContent || '', m = text.match(/^(\d+)(\s?%)$/), band = c.className;
    if (!m) return;
    const to = +m[1], t0 = performance.now() + i * 50;
    c.style.minWidth = c.offsetWidth + 'px';            // the row does not twitch as a digit is added
    const show = (n: number) => { c.textContent = n + m[2]; c.className = band.replace(/\bb-\w+/, 'b-' + bucketOf(n / 100)); };
    show(0);
    const tick = (now: number) => {
      if (!c.isConnected) return;
      const p = Math.min(1, Math.max(0, (now - t0) / 560));
      if (p < 1) { show(Math.round(to * easeOut(p))); requestAnimationFrame(tick); return; }
      c.textContent = text; c.className = band; c.style.minWidth = '';
    };
    requestAnimationFrame(tick);
  });
}
export function renderPointsField() {
  const f = document.getElementById('pts-field');
  f!.hidden = !S.MODEL;
  if (!S.MODEL) return;
  document.getElementById('pts-label')!.textContent = t('ptsLabel');
  const inp: any = document.getElementById('my-points');
  inp.placeholder = t('ptsPh');
  // a language toggle changes the decimal separator the field shows, so a
  // stored value is reprinted in the new convention (never while typing)
  const mi: any = document.getElementById('s-points');
  if (mi && document.activeElement === mi) inp.value = mi.value;     // typed in the sheet's copy
  else if (S.myPoints !== null && document.activeElement !== inp) inp.value = fmt(S.myPoints);
  const bad = S.ptsBad && inp.value.trim() !== '';
  inp.classList.toggle('on', S.myPoints !== null);
  inp.classList.toggle('bad', bad);
  inp.setAttribute('aria-invalid', bad ? 'true' : 'false');
  inp.setAttribute('aria-describedby', 'pts-note');
  // an unusable value must stay removable: hiding the clear button whenever
  // there is no figure left the reader typing over their own mistake
  const x = document.getElementById('pts-clear');
  x!.hidden = inp.value === '';
  x!.setAttribute('aria-label', t('ptsClear'));
  const note = document.getElementById('pts-note');
  note!.classList.toggle('bad', bad);
  // an average is offered as points once the typing pauses, never mid-keystroke
  // («4» on the way to «45»)
  const avg = S.ptsAvg !== null && !ptsPending && inp.value.trim() !== '' ? S.ptsAvg : null;
  const avgNote = (el: HTMLElement, fixId: string, field: string) => {
    const p = fmt(round1(avg! * 10));
    el.hidden = false;
    el.innerHTML = `${esc(t('ptsAvg', fmt(avg!), p))} <button type="button" class="lnk" id="${fixId}">${esc(t('ptsAvgFix', p))}</button>`;
    (document.getElementById(fixId) as HTMLElement).onclick = () => { onPoints(String(round1(avg! * 10))); refocus(field); };
  };
  // Only a typing error has a note. A colour key used to follow a valid figure:
  // on the map the legend already is that key, and in the list each Chance
  // cell names its own band in words («0 av 3 sannsynlig»).
  if (avg !== null) avgNote(note!, 'pts-avg-fix', '#my-points');
  else {
    note!.hidden = !bad;
    note!.textContent = bad ? t('ptsBad') : '';
  }
  // the sheet's copy of the field: shown only where the sheet covers the
  // panel (body.sheet-full, sideTrap), and it follows the panel's field
  const mf = document.getElementById('s-pts');
  if (!mf || !mi) return;
  mf.hidden = false;
  document.getElementById('s-pts-label')!.textContent = t('ptsLabel');
  mi.placeholder = t('ptsPh');
  if (document.activeElement !== mi) mi.value = inp.value;
  mi.classList.toggle('on', S.myPoints !== null);
  mi.classList.toggle('bad', bad);
  mi.setAttribute('aria-invalid', bad ? 'true' : 'false');
  mi.setAttribute('aria-describedby', 's-pts-note');
  const mn = document.getElementById('s-pts-note')!;
  mn.classList.toggle('bad', bad);
  if (avg !== null) avgNote(mn, 's-pts-avg-fix', '#s-points');
  else {
    mn.hidden = !bad;
    mn.textContent = bad ? t('ptsBad') : '';
  }
}

export function initChance() {
  try {
    const raw = JSON.parse(localStorage.getItem('pk-choices') || '[]');
    S.choices = Array.isArray(raw) ? raw.filter(okChoice) : [];
  } catch (e) { S.choices = []; }
}
