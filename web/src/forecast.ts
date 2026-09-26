/* The forecast as arithmetic: the error model, a programme's predicted
   threshold, the chance of a place at a given score, and what the reader has
   picked. Nothing here touches the DOM, so the build can import it to
   prerender the programme list (templates.ts); chance.ts owns the rendering
   and re-exports these so its callers never notice the split. */
import { partitionPrograms, shownPrograms } from './helpers';
import { S } from './state';
import type { Band, Program } from './types';

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
export const pct = c => Math.round(c * 100);
// The band is the band of the figure printed, not of the decimals behind it:
// 0,348 printed «35 %» on an «unlikely» chip, beside a legend whose «possible»
// band starts at 35 % and a headline that counted it as unlikely (14 rows
// nationwide at 25,0 points). What the reader can check wins.
export const bucketOf = (c): Band => {
  const r = pct(c) / 100;
  return r >= BANDS.likely ? 'likely' : r >= BANDS.possible ? 'possible' : 'unlikely';
};
// Norwegian puts a space before the unit sign, English does not. Every T
// string already splits on this; the chips printed "99 %" in both languages,
// beside a legend that said "≥ 70%".
export const pctS = c => S.lang === 'no' ? `${pct(c)} %` : `${pct(c)}%`;
export const chanceMode = () => S.myPoints !== null && !!S.MODEL;
// The intake most schools are forecast for. Buskerud and Trøndelag have not
// published 2026 yet, so theirs is forecast for 2026 — an intake already held
// — and the row says so rather than let it pass for next year's.
let newestFor: unknown = null, newestYear = 0;
export function newestForecastYear() {
  if (newestFor !== S.MODEL) {
    newestFor = S.MODEL;
    newestYear = Math.max(0, ...Object.values<any>(S.MODEL?.schools || {}).map(e => +e.year || 0));
  }
  return newestYear;
}
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
  const out = { n: 0, total: scope.length, likely: 0, possible: 0, unlikely: 0, best: -1,
                bestProg: null as Program | null, year: null as number | null, progs: [] as Program[] };
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
