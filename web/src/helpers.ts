import { t } from "./i18n";
import { S } from './state';

// A school's address on the site: /<fylke>/<skole>, ASCII only, so it survives
// every messaging app and every keyboard. æ ø å are the three letters people
// would type; everything else with a diacritic loses it, and every run of
// anything that is not a letter or a digit is one hyphen. tools/slug.py is the
// Python twin (make_og.py opens the school page by this address); the fixture
// table in web/test/slug.test.ts and tools/tests/test_slug.py keeps them equal.
export function slug(text: string): string {
  return text.normalize('NFC').toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export const schoolPath = (s: { fylke: string; name: string }) => '/' + slug(s.fylke) + '/' + slug(s.name);

/* ================= state & helpers ================= */
export const BINS = [
  { max: 30, css: '--seq-250' }, { max: 34, css: '--seq-350' }, { max: 38, css: '--seq-450' },
  { max: 42, css: '--seq-550' }, { max: 99, css: '--seq-700' },
];
export const BIN_EDGES = ['<30', '30–34', '34–38', '38–42', '42+'];
export const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const REPO = 'https://github.com/avshalomd/poengkart';
export const REPO_LINK = `<a href="${REPO}" target="_blank" rel="noopener">GitHub ↗</a>`;
// Binary floats make (35,7 + 36,0) / 2 come out as 35.849999999999994, and
// toFixed(1) prints that as 35,8 — a tenth below the figure it is. Every
// published figure has at most two decimals, so round in hundredths with
// integer arithmetic: exact, and it cannot drift the way a toPrecision()
// tolerance does once a value has been through a sum, a divide and a
// subtraction (41,35 arrives as 41.349999999999994, noise at the 14th digit).
export const round1 = v => { const h = Math.round(v * 100), sg = h < 0 ? -1 : 1; return sg * Math.round(Math.abs(h) / 10) / 10; };
// a cell that is a threshold someone could have missed. 'open', F, D and U
// are not, and neither is 0,0 — see the note in schoolPressure().
export const isPoints = v => typeof v === 'number' && v > 0;
export const meanOf = vals => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
// What share of a scope had no waitlist at all in one year. F, U and D are
// not places anyone competed for, so they are outside the question; a 0,0
// filled up, so it counts as filled rather than as everyone getting in.
export function openMix(programs, year) {
  const cells = programs.map(p => p.values[year])
    .filter(v => v !== undefined && v !== 'F' && v !== 'U' && v !== 'D');
  const open = cells.filter(v => v === 'open').length;
  return { open, total: cells.length, filled: cells.length - open,
           mostly: cells.length > 0 && open > cells.length / 2 };
}
export const fmtNum = v => typeof v === 'number' ? round1(v).toFixed(1).replace('.', ',') : v;
export const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));

// One utdanningsprogram lens for the whole app: the map dropdown, the chart
// tabs and the list headers all read and write mapCat. The only panel-local
// state is which programme-area row is selected; the mode is derived.
export const chartMode = () => S.chart.prog ? 'prog' : (S.mapCat !== 'all' ? 'cat' : 'all');

export function numericLatest(values) {
  const ys = Object.keys(values).sort();
  for (let i = ys.length - 1; i >= 0; i--)
    if (isPoints(values[ys[i]])) return [ys[i], values[ys[i]]];
  return null;
}
// a negative figure prints with a true minus (U+2212), as the zoom control's «−»
// does, rather than a hyphen
export const fmt = v => {
  const out = S.lang === 'no' ? fmtNum(v) : String(fmtNum(v)).replace(',', '.');
  return typeof out === 'string' ? out.replace(/^-/, '\u2212') : out;
};
export const X_ICON = '<svg class="xi" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
export const BUG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1"/>'
  + '<path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>';

export function yearSpan(s) {
  const ys = [...new Set(s.programs.flatMap(p => Object.keys(p.values)))].sort();
  return !ys.length ? '' : ys.length === 1 ? ys[0] : `${ys[0]}–${ys[ys.length - 1]}`;
}
// The county publishes the Norwegian name; the English one comes from Udir's
// register at build time. Falling back to the Norwegian is right for anything
// the register has never translated.
export const progName = p => (S.lang === 'en' && p.program_en) || p.program;
export const isPrioOnly = p => { const vs = Object.values(p.values); return vs.length > 0 && vs.every(v => v === 'F'); };
// A source that lists a programme twice, once with figures and once as a
// fortrinnsrett quota, should show one row. But identity here is the programme
// AND its level: a Vg3 that only ever filled on fortrinnsrett is not a
// duplicate of the Vg1 of the same name, and folding it away dropped the row
// from the list and pasted its badge onto a row that has a real threshold —
// a figure and "therefore no threshold exists" on the same line.
export const progId = p => `${p.program.toLowerCase()}|${p.level}`;
export function partitionPrograms(progs) {
  const regular = progs.filter(p => !isPrioOnly(p));
  const regNames = new Set(regular.map(progId));
  const prioNames = new Set(progs.filter(isPrioOnly).map(progId));
  const orphans = progs.filter(p => isPrioOnly(p) && !regNames.has(progId(p)));
  return { regular, orphans, prioNames };
}
// the rows the programme list actually renders: an F-only duplicate of a
// programme that also has a real row is folded away there, so any count that
// includes it contradicts the list printed right underneath
export const visibleIn = progs => { const pp = partitionPrograms(progs); return pp.regular.length + pp.orphans.length; };
export const visibleCount = s => visibleIn(shownPrograms(s));

/* A programme area with nothing in the county's last two published years is
   history, not an option a family can pick: hidden by default, one click away
   for anyone studying the past. A school that stopped publishing entirely
   keeps all its rows — hiding everything would hide the school. */
export function countyNewest(f) {
  if (!S._newestByFylke) {
    S._newestByFylke = {};
    S.DATA!.schools.forEach(s => s.programs.forEach(p => Object.keys(p.values).forEach(y => {
      S._newestByFylke![s.fylke] = Math.max(S._newestByFylke![s.fylke] || 0, +y);
    })));
  }
  return S._newestByFylke[f] || 0;
}
export const isRecent = (p, f) => Object.keys(p.values).some(y => +y >= countyNewest(f) - 1);
/* Vg1 is the year a 10. trinn family applies for; Vg2 and up are reached from
   inside a school. Five counties publish Vg1 only, but in Innlandet, Rogaland
   and Vestland the later years outnumber it, so a dot, a List value and a
   «beste sjanse» computed over every level were mostly years a first
   application cannot name. Vg1 is therefore the scope everywhere by default,
   and the later years are one control away (the panel's checkbox, the sheet's
   disclosure line) for a Vg1 pupil choosing a Vg2 programområde. A school with
   no Vg1 row keeps every row: hiding all of them would hide the school. */
export const isVg1 = p => p.level === 'Vg1';
export function levelScope(progs) {
  if (S.allLevels) return progs;
  const vg1 = progs.filter(isVg1);
  return vg1.length ? vg1 : progs;
}
export function shownPrograms(s) {
  const pool = levelScope(s.programs);
  if (S.showOld) return pool;
  const cur = pool.filter(p => isRecent(p, s.fylke));
  return cur.length ? cur : pool;
}
// the newest year in the dataset, or the one before it: anything older is a
// school the counties have stopped publishing
export const staleBefore = () => +S.DATA!.years[S.DATA!.years.length - 1] - 1;
// counties whose "ingen venteliste" is the county's own rule rather than an
// observed queue state (openRuleNote; tools/extractors/mro.py)
export const OPEN_RULE = new Set(['Møre og Romsdal']);
// counties that do not publish poenggrenser (docs/data-notes.md)
export const MISSING_COUNTIES = ['Agder', 'Finnmark', 'Nordland', 'Telemark', 'Troms', 'Vestfold', 'Østfold'];
export function schoolPressure(s, cat) {
  // Demand, judged in the newest dataset year only. Two honest signals:
  //   mean threshold of the programmes that filled up    -> how hard, typically
  //   share of programmes that filled up at all          -> how much is in demand
  // (The earlier "highest threshold" let one niche programme speak for a whole
  // school. Note this measures demand vs capacity, not school quality.)
  // counties publish different years (Oslo and Vestland already have 2026,
  // most stop at 2025), so judge each school on the newest year IT has
  const inLevel = levelScope(s.programs);
  const scope = cat === 'all' ? inLevel : inLevel.filter(p => p.category === cat);
  const years = [...new Set(scope.flatMap(p => Object.keys(p.values)))].sort();
  const yr: any = years[years.length - 1];
  if (!yr) return { kind: 'none' };
  // A dot the colour of a 2022 figure, under a legend that says "siste år",
  // is a school that looks current and is not. Show those as no data and let
  // the panel keep the history.
  if (+yr < staleBefore()) return { kind: 'stale', year: yr };
  const pool = scope.filter(p => yr in p.values && p.values[yr] !== 'F' && p.values[yr] !== 'U');
  const cells = pool.map(p => p.values[yr]);
  // Several counties publish 0,0 and legend it: the programme filled up and
  // applicants with 0,0 points were still left on the waiting list. So it is a
  // real threshold, and the most extreme one there is. It counts as filled,
  // but it stays out of the mean: as a value it dragged five schools into
  // the lowest colour band on the strength of one programme's queue.
  const zeroN = cells.filter(v => v === 0).length;
  const nums = cells.filter(isPoints).sort((a, b) => a - b);
  const openN = cells.filter(v => v === 'open').length;
  const total = nums.length + openN + zeroN;
  if (!nums.length) {
    if (!total) return { kind: 'none' };
    // A 0 is a real threshold: that programme filled. It outranks "ingen
    // venteliste", so a school is open only when every cell says so; a mix
    // carries both counts for the label (ruling of 2 Sept 2026).
    return zeroN ? { kind: 'zero', year: yr, total, zeroN, openN }
                 : { kind: 'open', year: yr, total };
  }
  let top = -1, topProg = null;
  for (const p of pool) {
    const v = p.values[yr];
    if (typeof v === 'number' && v > top) { top = v; topProg = p; }
  }
  return { kind: 'points', v: meanOf(nums), top, topProg, year: yr,
           filled: nums.length + zeroN, total, openN,
           mostlyOpen: openN > total / 2,
           share: (nums.length + zeroN) / total };
}
export const colorFor = v => v == null ? cssVar('--context') : cssVar(BINS.find(b => v < b.max)!.css);
// what a filled-without-points state says: the mix when some programmes had
// no waiting list, the plain state otherwise
export const zeroLabel = (zeroN, openN) => openN ? t('zeroMix', zeroN, openN) : t('noPoints');

export function initHelpers() {
  S.chart = { prog: null };
}
