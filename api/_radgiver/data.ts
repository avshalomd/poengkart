/* The rådgiver's view of the dataset: the same schools.json and model.json the
   page loads, read through the app's own forecast arithmetic (forecast.ts) so
   that every chance the chat quotes is the chance the wish list prints beside
   it. Nothing here touches the DOM; the page's state object only carries the
   two files, which is all forecast.ts reads from it. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { S } from '../../web/src/state.ts';
import {
  bucketOf, CHANCE_CAP, chanceOf, OPEN_CHANCE, openOnly, predFor, progKeyMap,
} from '../../web/src/forecast.ts';
import {
  HELD_OUT, HISTORY_ONLY, isPrioOnly, isRecent, MISSING_COUNTIES, schoolNewest, schoolPath, slug, staleBefore,
} from '../../web/src/helpers.ts';
import { CATS } from '../../web/src/i18n.ts';
import type { CellValue, County, Dataset, Model, Program, School } from '../../web/src/types.ts';

export { CATS };
export type Cats = keyof typeof CATS;

let loaded = false;
/** Read the two generated files once; `dir` is web/public/data unless a test
    points it at the fixture. */
export function loadData(dir = join(process.cwd(), 'web/public/data')) {
  if (loaded) return;
  S.DATA = JSON.parse(readFileSync(join(dir, 'schools.json'), 'utf8')) as Dataset;
  S.MODEL = JSON.parse(readFileSync(join(dir, 'model.json'), 'utf8')) as Model;
  loaded = true;
}
export const data = () => { loadData(); return S.DATA!; };

/* ---------- words to things ---------- */

// what a family types around a school's name and means nothing by
const NOISE = new Set(['videregaende', 'vidaregaande', 'skole', 'skule', 'vgs', 'vg', 'vgs.', 'school', 'upper',
  'secondary', 'high', 'the', 'i', 'pa', 'avd', 'avdeling']);
export const words = (s: string) => slug(s).split('-').filter(w => w && !NOISE.has(w));

/** How well a query names a school: 0 is no match. Every word of the query
    must begin a word of the school's name, kommune or post town. */
function schoolScore(s: School, q: string[]): number {
  if (!q.length) return 0;
  const name = words(s.name), place = [...words(s.kommune || ''), ...words(s.sted || '')];
  let score = 0;
  for (const w of q) {
    if (name.includes(w)) score += 3;
    else if (name.some(n => n.startsWith(w))) score += 2;
    else if (place.includes(w)) score += 1;
    else return 0;
  }
  if (name.join(' ') === q.join(' ')) score += 5;
  return score;
}

export function findFylke(txt?: string | null): County | null {
  if (!txt) return null;
  const w = slug(txt);
  return data().counties.find(c => slug(c.fylke) === w || slug(c.fylke).startsWith(w)) || null;
}

export type SchoolMatch = { school: School } | { ambiguous: School[] } | { none: true };
export function resolveSchool(name: string, fylke?: string | null): SchoolMatch {
  const f = findFylke(fylke);
  const pool = data().schools.filter(s => !f || s.fylke === f.fylke);
  const exact = pool.filter(s => slug(s.name) === slug(name));
  if (exact.length === 1) return { school: exact[0] };
  const q = words(name);
  const scored = pool.map(s => ({ s, v: schoolScore(s, q) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  if (!scored.length) return { none: true };
  const top = scored.filter(x => x.v === scored[0].v);
  // a current school beats one that stopped publishing under the same words
  const cur = top.filter(x => schoolNewest(x.s) >= staleBefore());
  const best = cur.length ? cur : top;
  return best.length === 1 ? { school: best[0].s } : { ambiguous: best.slice(0, 6).map(x => x.s) };
}

/** A category code from a code, a Norwegian or English programme name. */
export function findCategory(txt?: string | null): Cats | null {
  if (!txt) return null;
  const up = txt.trim().toUpperCase();
  if (up in CATS) return up as Cats;
  const w = slug(txt);
  for (const [k, v] of Object.entries(CATS)) if (slug(v.no) === w || slug(v.en) === w) return k as Cats;
  for (const [k, v] of Object.entries(CATS)) if (slug(v.no).startsWith(w) || slug(v.en).startsWith(w)) return k as Cats;
  // informal names families use
  const alias: Record<string, Cats> = {
    studiespes: 'ST', studie: 'ST', 'general-studies': 'ST', idrett: 'ID', sport: 'ID', helse: 'HS',
    elektro: 'EL', bygg: 'BA', tip: 'TP', teknikk: 'TP', mus: 'MD', musikk: 'MD', dans: 'MD', drama: 'MD',
    medier: 'MK', media: 'MK', it: 'IM', restaurant: 'RM', kokk: 'RM', frisor: 'FD', naturbruk: 'NA', salg: 'SR',
    kunst: 'KD', design: 'KD', handverk: 'DT', pabygg: 'PB',
  };
  return alias[w] || null;
}

/** The programme rows a family can still apply to at a school: recent, and
    not a fortrinnsrett-only duplicate of a row that has a threshold. */
export function currentPrograms(s: School, level: 'Vg1' | 'all' = 'Vg1'): Program[] {
  const pool = level === 'Vg1' ? s.programs.filter(p => p.level === 'Vg1') : s.programs;
  const recent = pool.filter(p => isRecent(p, s.fylke));
  const use = recent.length ? recent : pool;
  const withFigure = new Set(use.filter(p => !isPrioOnly(p)).map(p => `${p.program.toLowerCase()}|${p.level}`));
  return use.filter(p => !isPrioOnly(p) || !withFigure.has(`${p.program.toLowerCase()}|${p.level}`));
}

export type ProgMatch = { prog: Program } | { ambiguous: Program[] } | { none: true };
export function resolveProgram(s: School, txt: string): ProgMatch {
  const km = progKeyMap(s);
  const byKey = s.programs.find(p => km.get(p) === txt);
  if (byKey) return { prog: byKey };
  // the tools print a row as «Studiespesialisering (Vg1)», and a model hands it back so
  const lv = /^(.*?)[\s,–-]*\(?\b(Vg[1-3])\)?\s*$/i.exec(txt.trim());
  if (lv && lv[1]) {
    const level = 'Vg' + lv[2].slice(2), m = resolveProgram(s, lv[1]);
    if ('prog' in m && m.prog.level === level) return m;
    const rows = 'ambiguous' in m ? m.ambiguous.filter(p => p.level === level)
      : currentPrograms(s, 'all').filter(p => p.level === level && slug(p.program) === slug(lv[1]));
    if (rows.length === 1) return { prog: rows[0] };
    if (rows.length) return { ambiguous: rows };
  }
  const cur = currentPrograms(s, 'all');
  const w = slug(txt);
  const exact = cur.filter(p => slug(p.program) === w || slug(p.program_en || '') === w);
  const vg1Exact = exact.filter(p => p.level === 'Vg1');
  if (vg1Exact.length === 1) return { prog: vg1Exact[0] };
  if (exact.length === 1) return { prog: exact[0] };
  const cat = findCategory(txt);
  if (cat) {
    const inCat = cur.filter(p => p.category === cat && p.level === 'Vg1');
    if (inCat.length === 1) return { prog: inCat[0] };
    if (inCat.length > 1) return { ambiguous: inCat };
  }
  const q = w.split('-').filter(Boolean);
  const loose = cur.filter(p => {
    const n = [...slug(p.program).split('-'), ...slug(p.program_en || '').split('-')];
    return q.every(x => n.some(y => y.startsWith(x)));
  });
  const vg1 = loose.filter(p => p.level === 'Vg1');
  if (vg1.length === 1) return { prog: vg1[0] };
  if (loose.length === 1) return { prog: loose[0] };
  if (loose.length) return { ambiguous: loose.slice(0, 8) };
  return { none: true };
}

/* ---------- things to words ---------- */

/** One published cell, as the family-facing wording (CONTEXT.md). */
export function cellText(v: CellValue | undefined, s: School, year: string): string {
  if (v === undefined) return 'no data';
  if (typeof v === 'number') {
    if (v === 0) return s.fylke === 'Nordland' && +year >= 2019 && +year <= 2021
      ? '0.0 (lowest points among the admitted)'
      : 'filled, last admitted had no points (everyone with points got in)';
    return `${v.toFixed(1)} points (grade average ${(v / 10).toFixed(2)})`;
  }
  return { open: 'ingen venteliste (every qualified applicant got in)', F: 'filled by fortrinnsrett (no poenggrense)',
           D: 'admission by documentation/interview (no poenggrense)', U: 'not offered that year' }[v] || String(v);
}

export const siteLink = (s: School) => schoolPath(s);

/** A wish's chance at `points` karakterpoeng, the way the wish list prints it. */
export function wishChance(s: School, p: Program, points: number | null) {
  const pr = predFor(s, p);
  const out: Record<string, unknown> = {};
  if (pr) {
    out.forecast_year = pr.year;
    out.expected_threshold = `${pr.m.toFixed(1)} points (grade average ${(pr.m / 10).toFixed(2)})`;
    out.chance_of_queue = Math.round(pr.pi * 100) + '%';
    if (points != null) {
      const c = chanceOf(pr, points), band = bucketOf(c);
      out.chance = Math.round(c * 100);
      out.band = band;
      // where the row sits against the reader's own level: a safe wish is a
      // likely one they would still want, not the least competitive school
      // likely but under 85 % is still a target: a 72 % last wish is no safety net
      out.fit = band === 'unlikely' ? 'reach' : band === 'possible' || c < 0.85 ? 'target'
        : pr.m >= points - 5 ? 'safe' : 'well below your level';
    }
  } else if (openOnly(p)) {
    out.note = 'never had a waiting list: every qualified applicant has got in';
    if (points != null) { out.chance = Math.round(OPEN_CHANCE * 100); out.band = 'likely'; out.fit = 'well below your level'; }
  } else {
    out.note = 'no forecast for this row (too little history, discontinued, or no poenggrense published)';
  }
  if (HELD_OUT.has(s.fylke)) out.caveat = `${s.fylke}'s forecasts come from its own figures only and are less certain`;
  return out;
}

export function programSummary(s: School, p: Program, points: number | null, years = 4) {
  const ys = Object.keys(p.values).sort().slice(-years);
  return {
    key: progKeyMap(s).get(p),
    programme: p.program,
    programme_en: p.program_en,
    level: p.level,
    utdanningsprogram: CATS[p.category as Cats]?.no || p.category,
    history: Object.fromEntries(ys.map(y => [y, cellText(p.values[y], s, y)])),
    ...wishChance(s, p, points),
  };
}

export function schoolCard(s: School) {
  return {
    school: s.name, fylke: s.fylke, kommune: s.kommune, sted: s.sted,
    link: siteLink(s),
    stopped_publishing: schoolNewest(s) < staleBefore() || undefined,
  };
}

/* Each county's own admission model, from docs/radgiver-research.md §3a
   (county pages 2024–26). They change year to year, hence the caveat the
   tool carries with them. */
/** How many schools a county lets one applicant list per utdanningsprogram,
    where a counsellor source states it (docs/radgiver-research.md, 3a; the
    counties change it, so a flag says "check", it does not refuse). */
export const SCHOOLS_PER_PROGRAMME: Record<string, number> = { Rogaland: 3, Oslo: 6, Buskerud: 10 };

const COUNTY_MODEL: Record<string, string> = {
  Oslo: 'Fritt skolevalg: ønsker are evaluated in order, by points; ties by lottery (loddtrekning). Up to 6 schools per programme.',
  Akershus: 'Fritt skolevalg within three regions (Asker/Bærum, Follo, Romerike); applicants are prioritised to their own region.',
  Buskerud: 'Fritt skolevalg; three utdanningsprogram and up to ten schools.',
  Rogaland: 'Open application across the county; up to three schools per utdanningsprogram; applicants from other counties come after the county\'s own.',
  Vestland: 'Eight inntaksområder: you may apply anywhere in the county, but schools in your own area give you priority (area points); some programmes, such as Idrettsfag and Musikk, dans og drama, have none. Three intake rounds before August.',
  Trøndelag: 'Nærskoleprinsipp outside Trondheim (you are placed close to home); fritt skolevalg on grades for Trondheim residents; Idrettsfag is county-wide. The rules are being changed from 2025–26.',
};

export function countyFacts(fylkeTxt: string) {
  const c = findFylke(fylkeTxt);
  if (!c) {
    const miss = MISSING_COUNTIES.find(m => slug(m).startsWith(slug(fylkeTxt)));
    return miss ? { fylke: miss, in_poengkart: false, note: `Poengkart has no poenggrenser for ${miss} yet; check the county's own site and vilbli.no.` }
                : { error: `Unknown county "${fylkeTxt}". Counties with data: ${data().counties.map(x => x.fylke).join(', ')}.` };
  }
  const ys = data().schools.filter(s => s.fylke === c.fylke).flatMap(s => s.programs.flatMap(p => Object.keys(p.values))).map(Number);
  return {
    fylke: c.fylke, in_poengkart: true, schools: c.schools,
    years: `${Math.min(...ys)}–${Math.max(...ys)}`,
    inntak_published: c.round ? `${c.round}. inntak` : 'the county does not number its intake round',
    admission_model: COUNTY_MODEL[c.fylke] || (c.free_choice
      ? 'Fritt skolevalg: admission to a school is by points across the county.'
      : 'Not fully free choice: the county also weighs where the applicant lives (nærskole or inntaksområde rules).'),
    admission_model_caveat: 'County rules change from year to year: check vilbli.no and the county\'s own site for this year.',
    history_only: HISTORY_ONLY.has(c.fylke) || undefined,
    forecasts_less_certain: HELD_OUT.has(c.fylke) || undefined,
    levels: c.levels, source: c.source,
  };
}

export const CHANCE_CAP_PCT = Math.round(CHANCE_CAP * 100);
