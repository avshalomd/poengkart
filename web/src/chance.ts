import { renderLegend } from "./chrome";
import { cssVar, esc, fmt, partitionPrograms, progName, shownPrograms, X_ICON } from "./helpers";
import { t } from "./i18n";
import { toast } from "./locate";
import { drawMarkers } from "./map";
import { renderList } from "./programs";
import { openSide, renderSide } from "./sidebar";
import { S } from './state';
import { bindTitleTips } from "./tips";

/* ================= chance of a place =================
   tools/model.py forecasts, per programme, for the county's next publication
   year: m = the expected threshold, s = how far that forecast was typically
   off in the walk-forward backtest (wider where the history is short), and
   pi = the probability a queue forms at all. For a reader with x points
       P(place) = (1 - pi) + pi * F((x - m) / s)
   where F is the empirical distribution of the backtest's own forecast errors
   rather than a bell curve — thresholds collapse more often than they jump,
   and a Gaussian understated the chance at the low end by half. */
export const BANDS = { likely: 0.70, possible: 0.35 };
export const ZQ_GRID = Array.from({ length: 41 }, (_, i) => i / 40);
export function errCdf(z) {
  const q = S.MODEL && S.MODEL.meta && S.MODEL.meta.error_quantiles;
  if (!q) {                                   // Gaussian fallback (A&S 7.1.26)
    const a = Math.abs(z) / Math.SQRT2, tt = 1 / (1 + 0.3275911 * a);
    const erf = 1 - (((((1.061405429 * tt - 1.453152027) * tt) + 1.421413741) * tt - 0.284496736) * tt + 0.254829592) * tt * Math.exp(-a * a);
    return 0.5 * (1 + Math.sign(z) * erf);
  }
  if (z <= q[0]) return 0.005;
  if (z >= q[q.length - 1]) return 0.995;
  let i = 1;
  while (q[i] < z) i++;
  const f = (z - q[i - 1]) / ((q[i] - q[i - 1]) || 1);
  return Math.min(0.995, Math.max(0.005, ZQ_GRID[i - 1] + f * (ZQ_GRID[i] - ZQ_GRID[i - 1])));
}
export const chanceOf = (pr, x) => (1 - pr.pi) + pr.pi * errCdf((x - pr.m) / pr.s);
export const bucketOf = c => c >= BANDS.likely ? 'likely' : c >= BANDS.possible ? 'possible' : 'unlikely';
export const bucketColor = b => cssVar(b === 'likely' ? '--good' : b === 'possible' ? '--dot-possible' : '--dot-unlikely');
export const pct = c => Math.round(c * 100);
// Norwegian puts a space before the unit sign, English does not. Every T
// string already splits on this; the chips printed "99 %" in both languages,
// beside a legend that said "≥ 70%".
export const pctS = c => S.lang === 'no' ? `${pct(c)} %` : `${pct(c)}%`;
export const chanceMode = () => S.myPoints !== null && !!S.MODEL;
// the model's raw entry for one programme row, or null; keys match tools/model.py
export function modelEntry(s, p) {
  const e = S.MODEL && S.MODEL.schools && S.MODEL.schools[`${s.fylke}|${s.name}`];
  if (!e || !e.programs) return null;
  const pr = e.programs[progKeyMap(s).get(p)];
  return pr ? { ...pr, year: e.year, round: e.round } : null;
}
// the forecast the app is willing to show for that row, or null. Two entries
// the model may carry are refused here, so that every consumer (dot, chance
// block, choices, list view) agrees without each having to know why:
//   a programme whose newest cell is discontinued has no next intake to
//   forecast (tools/model.py drops these too; belt and braces), and
//   a programme that never had a published poenggrense here (h = 0) gets the
//   county prior, which is not this programme's history. The row says so
//   instead of printing a percentage.
export function predFor(s, p) {
  const ys = Object.keys(p.values); const newest = ys[ys.length - 1];
  if (p.values[newest] === 'U') return null;
  const pr = modelEntry(s, p);
  return pr && pr.h > 0 ? pr : null;
}
// one school's prospects for x points over the programmes in scope
export function schoolChance(s, cat, x) {
  // Scope is the programme areas the panel LISTS for this lens — the recency
  // filter and the fortrinnsrett fold, counted exactly as the hero counts its
  // rows — so `total` is that same figure and `total - n` is the number with
  // no forecast. Reading s.programs here instead let the head quote a
  // denominator that contradicted the hero directly above it.
  const base = shownPrograms(s);
  const pp = partitionPrograms(cat === 'all' ? base : base.filter(p => p.category === cat));
  const scope = [...pp.regular, ...pp.orphans];
  const out = { n: 0, total: scope.length, likely: 0, possible: 0, unlikely: 0, best: -1, bestProg: null, year: null, progs: [] };
  for (const p of scope) {
    const pr = predFor(s, p);
    if (!pr) continue;
    const c = chanceOf(pr, x);
    out.n++; out[bucketOf(c)]++; out.year = pr.year; out.progs.push(p);
    if (c > out.best) { out.best = c; out.bestProg = p; }
  }
  return out.n ? out : null;
}
// The county's own later round, where it publishes an earlier one and has
// measured the gap on its own cells (Vestland: 1. and 3. inntak). A later round
// is a lower cutoff if the queue survives, and often no queue at all; both
// come from meta.round_bridge, per category where there are enough pairs.
export function finalRoundBridge(s) {
  const rb = S.MODEL && S.MODEL.meta && S.MODEL.meta.round_bridge;
  if (!rb || !s.round) return null;
  const b: any = (Object.values(rb) as any[]).find(b => b.fylke === s.fylke && b.from_round === s.round);
  return b && +b.to_round > +s.round ? b : null;
}
export function chanceFinal(pr, x, cat, b) {
  const bc = (b.by_category || {})[cat];
  const off = bc && bc.n >= 10 ? bc.mean : b.mean;
  const gone = bc && bc.n_had_queue >= 20 ? bc.share_vanished : b.share_vanished;
  return (1 - pr.pi) + pr.pi * (gone + (1 - gone) * errCdf((x - pr.m - off) / pr.s));
}
// The reader's own list of choices, kept across schools and visits. Anything
// that is not a list of {fylke, school, programme-key} strings is discarded on
// the spot: JSON.parse happily returns {} or [null], and either of those used
// to throw inside renderChoices() during boot and take the whole map down with
// it — a dead end the reader could not get out of, since the retry button
// reloads into the same stored value.
export const okChoice = c => c && typeof c === 'object' &&
  typeof c.f === 'string' && typeof c.s === 'string' && typeof c.k === 'string';
export function progKeyMap(s) {
  if (!s._pk) {
    s._pk = new Map();
    const occ = {};
    for (const q of s.programs) {
      const k = q.program.toLowerCase(), o = occ[k] || 0;
      occ[k] = o + 1;
      s._pk.set(q, `${k}|${q.level}|${o}`);
    }
  }
  return s._pk;
}
export const isChosen = (s, p) => S.choices.some(c => c.f === s.fylke && c.s === s.name && c.k === progKeyMap(s).get(p));
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
  const sd = document.getElementById('side').getBoundingClientRect();
  const right = document.body.classList.contains('side-open') && sd.width > 0 && sd.left > 0 ? innerWidth - sd.left + 16 : 16;
  const lg = document.getElementById('legend')?.getBoundingClientRect();
  const nearLegend = lg && lg.height && lg.top < innerHeight - 70;
  el.style.right = right + 'px';
  el.style.left = el.style.bottom = '';
  if (nearLegend && innerWidth - right - (lg.right + 12) >= 280) el.style.left = Math.round(lg.right + 12) + 'px';
  else if (nearLegend) el.style.bottom = Math.round(innerHeight - lg.top + 12) + 'px';
  el.classList.add('show');
  clearTimeout(S.pickNoteTimer);
  S.pickNoteTimer = setTimeout(() => el.classList.remove('show'), 4500);
}
export function toggleChoice(s, p) {
  const k = progKeyMap(s).get(p);
  const i = S.choices.findIndex(c => c.f === s.fylke && c.s === s.name && c.k === k);
  S.choicesNote = null;
  if (i >= 0) S.choices.splice(i, 1);
  else {
    // vigo's own limits, so the list can only hold an application that could
    // actually be submitted: ten ranked wishes, and a Vg1 application names
    // at most three different utdanningsprogram
    const items = S.choices.map(resolveChoice).filter(Boolean);
    const refuse = key => {
      S.choicesNote = t(key);
      renderChoices();
      // the note is rendered inside #choices; on a desktop that card scrolls,
      // and the note landed 200px below its fold with nothing else happening
      const note: any = document.querySelector('#choices .vnote'), card = document.getElementById('panel');
      const onScreen = note && note.offsetParent && card && (() => {
        const n = note.getBoundingClientRect(), c = card.getBoundingClientRect();
        return n.top >= c.top && n.bottom <= c.bottom + 1;
      })();
      if (!onScreen) pickNote(S.choicesNote);
    };
    if (items.length >= 10) { refuse('vigoMaxWishes'); return; }
    if (p.level === 'Vg1') {
      const cats = new Set(items.filter(x => x.p.level === 'Vg1').map(x => x.p.category));
      if (!cats.has(p.category) && cats.size >= 3) { refuse('vigoMaxProgs'); return; }
    }
    S.choices.push({ f: s.fylke, s: s.name, k });
  }
  try { localStorage.setItem('pk-choices', JSON.stringify(S.choices)); } catch (e) {}
  renderChoices();
  if (S.current) renderList();
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
export function resolveChoice(c) {
  if (!okChoice(c) || !S.DATA) return null;
  const s = S.DATA.schools.find(x => x.fylke === c.f && x.name === c.s);
  if (!s) return null;
  const km = progKeyMap(s);
  let p = s.programs.find(q => km.get(q) === c.k);
  // A refresh that tidies a label («SK 3år» to «SK 3 år») or joins two spellings
  // of one series changes the key, and the wish was pruned for good. Find the
  // series by its name at another position, or by a former label the pipeline
  // keeps in aliases, and re-key the wish to it.
  if (!p) {
    // a joined series can also settle on one level of a «Vg2/Vg3» row
    const [name, level] = c.k.split('|'), lv = q => q.level === level || level.split('/').includes(q.level);
    p = s.programs.find(q => lv(q) && q.program.toLowerCase() === name)
      || s.programs.find(q => lv(q) && (q.aliases || []).includes(name));
    if (p) c.k = km.get(p);
  }
  return p ? { s, p } : null;
}
export function renderChoices() {
  const box = document.getElementById('choices');
  if (!S.DATA) return;
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
  const items = S.choices.map(resolveChoice).filter(Boolean);
  box.hidden = !items.length;
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
  box.innerHTML = `<div class="h"><span>${esc(t('choicesHead', items.length))}</span>` +
    `<button id="choices-clear">${esc(t('choicesClear'))}</button></div>` +
    `<div class="list">${rows}</div>` +
    (S.choicesNote ? `<div class="vnote">⚠ ${esc(S.choicesNote)}</div>` : '') + sum;
  box.querySelectorAll('.who').forEach((b: any) => b.onclick = () => {
    const { s } = items[+b.dataset.i]; openSide(s);
    if (s.lat && S.map && S.view === 'map') S.map.setView([s.lat, s.lon], Math.max(S.map.getZoom(), 11));
  });
  box.querySelectorAll('.rm').forEach((b: any) => b.onclick = () => {
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
  clr.onclick = () => {
    if (!clr.dataset.armed) {
      clr.dataset.armed = '1';
      clr.textContent = t('choicesClearSure');
      clr.classList.add('arm');
      clearTimeout((renderChoices as any).armTimer);
      (renderChoices as any).armTimer = setTimeout(() => {
        delete clr.dataset.armed;
        clr.textContent = t('choicesClear');
        clr.classList.remove('arm');
      }, 4000);
      return;
    }
    clearTimeout((renderChoices as any).armTimer);
    S.choices = [];
    try { localStorage.removeItem('pk-choices'); } catch (e) {}
    renderChoices();
    if (S.current) renderList();
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
  return n >= 0 && n <= 70 ? { pts: n, bad: false } : { pts: null, bad: true };
}
export function onPoints(v) {
  const inp: any = document.getElementById('my-points');
  const r = parsePoints(v);
  S.myPoints = r.pts;
  S.ptsBad = r.bad;
  if (v === '') inp.value = '';
  try {
    if (S.myPoints === null) localStorage.removeItem('pk-points');
    else localStorage.setItem('pk-points', String(S.myPoints));
  } catch (e) {}
  renderPointsField(); renderChoices(); drawMarkers(); renderLegend();
  if (S.current) renderSide();
}
export function renderPointsField() {
  const f = document.getElementById('pts-field');
  f.hidden = !S.MODEL;
  if (!S.MODEL) return;
  document.getElementById('pts-label').textContent = t('ptsLabel');
  const inp: any = document.getElementById('my-points');
  inp.placeholder = t('ptsPh');
  // a language toggle changes the decimal separator the field shows, so a
  // stored value is reprinted in the new convention (never while typing)
  if (S.myPoints !== null && document.activeElement !== inp) inp.value = fmt(S.myPoints);
  const bad = S.ptsBad && inp.value.trim() !== '';
  inp.classList.toggle('on', S.myPoints !== null);
  inp.classList.toggle('bad', bad);
  inp.setAttribute('aria-invalid', bad ? 'true' : 'false');
  inp.setAttribute('aria-describedby', 'pts-note');
  // an unusable value must stay removable: hiding the clear button whenever
  // there is no figure left the reader typing over their own mistake
  const x = document.getElementById('pts-clear');
  x.hidden = inp.value === '';
  x.setAttribute('aria-label', t('ptsClear'));
  const note = document.getElementById('pts-note');
  note.classList.toggle('bad', bad);
  // Only a typing error has a note. A colour key used to follow a valid figure:
  // on the map the legend already is that key, and in the list each Chance
  // cell names its own band in words («0 av 3 sannsynlig»).
  note.hidden = !bad;
  note.textContent = bad ? t('ptsBad') : '';
}

export function initChance() {
  try {
    const raw = JSON.parse(localStorage.getItem('pk-choices') || '[]');
    S.choices = Array.isArray(raw) ? raw.filter(okChoice) : [];
  } catch (e) { S.choices = []; }
}
