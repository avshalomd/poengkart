/* The rådgiver's tools. Two kinds:

   - lookups, which read the dataset and the model and return plain facts;
   - screen actions (add_wish, remove_wish, move_wish, open_school,
     set_karaktersnitt), which check the request against the data and vigo's
     own limits and return an `action` the page carries out when it sees the
     tool's result in the stream. The page is where the wish list lives
     (localStorage), so the server never stores it; it only keeps the copy the
     request brought, updated as the turn goes, so a later step sees an earlier
     step's change.

   Every tool is built per request around that screen snapshot. */
import { tool } from 'ai';
import { z } from 'zod';
import { progKeyMap } from '../../web/src/forecast.ts';
import { schoolNewest, staleBefore, slug } from '../../web/src/helpers.ts';
import {
  CATS, type Cats, countyFacts, currentPrograms, data, findCategory, findFylke, programSummary, resolveProgram,
  resolveSchool, schoolCard, siteLink, wishChance, words, CHANCE_CAP_PCT, SCHOOLS_PER_PROGRAMME,
} from './data.ts';
import type { Program, School } from '../../web/src/types.ts';

/** A county's limit on schools per utdanningsprogram, broken by the list. */
function overLimit(rows: { fylke?: string; school?: string; utdanningsprogram?: string; level?: string }[]): string[] {
  const per = new Map<string, Set<string>>();
  for (const r of rows) if (r.level === 'Vg1' && r.fylke && SCHOOLS_PER_PROGRAMME[r.fylke]) {
    const key = `${r.fylke}|${r.utdanningsprogram}`;
    per.set(key, (per.get(key) || new Set()).add(r.school!));
  }
  return [...per].filter(([k, s]) => s.size > SCHOOLS_PER_PROGRAMME[k.split('|')[0]]).map(([k, s]) => {
    const [f, cat] = k.split('|');
    return `${s.size} schools for utdanningsprogram ${cat} in ${f}, which lets an applicant list at most ${SCHOOLS_PER_PROGRAMME[f]} per utdanningsprogram: vigo would not accept the extra ones. Say this is the county's rule and suggest which to drop (check the year's rules on vilbli.no).`;
  });
}

/** What the page sends with every message: what the reader has on screen. */
export const ScreenSchema = z.object({
  lang: z.enum(['no', 'en']).default('no'),
  view: z.enum(['map', 'list']).optional(),
  fylke_filter: z.string().max(60).optional(),
  utdanningsprogram_filter: z.string().max(60).optional(),
  /** the karakterpoeng the reader submitted (average × 10), or null */
  points: z.number().min(10).max(60).nullable().optional(),
  open_school: z.object({ fylke: z.string().max(60), school: z.string().max(120), programme: z.string().max(120).optional() })
    .nullable().optional(),
  wishes: z.array(z.object({ f: z.string().max(60), s: z.string().max(120), k: z.string().max(160) })).max(12).default([]),
}).strict();
export type Screen = z.infer<typeof ScreenSchema>;

/** tool() with its input type named: TypeScript 7 infers `never` for a schema
    with an optional key and rejects the whole definition. */
function defTool<S extends z.ZodType, O>(d: { description: string; inputSchema: S; execute: (input: z.infer<S>) => Promise<O> }) {
  return tool<z.infer<S>, O, {}>(d as any);
}

type Wish = { f: string; s: string; k: string };
const resolveWish = (w: Wish): { s: School; p: Program } | null => {
  const s = data().schools.find(x => x.fylke === w.f && x.name === w.s);
  const p = s && s.programs.find(q => progKeyMap(s).get(q) === w.k);
  return s && p ? { s, p } : null;
};

const avgToPoints = (a?: number | null) => a == null ? null : Math.round(a * 100) / 10;
const pointsLabel = (p: number | null) => p == null ? null : `${(p / 10).toFixed(2)} grade average (${p.toFixed(1)} points)`;

function schoolOrError(name: string, fylke?: string | null) {
  const m = resolveSchool(name, fylke);
  if ('school' in m) return { school: m.school };
  if ('ambiguous' in m) return { error: `"${name}" matches several schools; ask which one, or pass fylke.`, candidates: m.ambiguous.map(schoolCard) };
  return { error: `No school in Poengkart matches "${name}"${fylke ? ` in ${fylke}` : ''}. Try search_schools.` };
}
function programOrError(s: School, txt: string) {
  const m = resolveProgram(s, txt);
  if ('prog' in m) return { prog: m.prog };
  if ('ambiguous' in m) return { error: `"${txt}" matches several programme rows at ${s.name}; pick one by key.`,
    candidates: m.ambiguous.map(p => ({ key: progKeyMap(s).get(p), programme: p.program, level: p.level })) };
  return { error: `${s.name} has no current programme matching "${txt}".`,
    offered_vg1: currentPrograms(s).map(p => ({ key: progKeyMap(s).get(p), programme: p.program })) };
}

/** The place a family names («near Drammen»): the middle of the schools in a
    kommune or post town of that name. */
function placeCentre(txt: string) {
  const q = words(txt).join(' ');
  const hits = data().schools.filter(s => words(s.kommune || '').join(' ') === q || words(s.sted || '').join(' ') === q);
  if (!hits.length) return null;
  return { lat: hits.reduce((a, s) => a + s.lat, 0) / hits.length, lon: hits.reduce((a, s) => a + s.lon, 0) / hits.length,
           fylke: hits[0].fylke };
}
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos((a.lat + b.lat) / 2 * r), y = (b.lat - a.lat) * r;
  return Math.round(Math.sqrt(x * x + y * y) * 6371);
};

export function makeTools(screen: Screen, said?: string) {
  const wishes: Wish[] = [...screen.wishes];
  let points: number | null = screen.points ?? null;
  // a grade average handed to a tool must be the one on screen or one the
  // reader wrote (4,5 / 4.5 / 45 poeng): a model's guess is not used, and the
  // result says so. Without the reader's words (unit tests) nothing is checked.
  const written = said == null ? null : [...said.matchAll(/\d+(?:[.,]\d+)?/g)].map(m => Number(m[0].replace(',', '.')));
  const stated = (avg: number) => written == null || (points != null && Math.abs(avg * 10 - points) < 0.05)
    || written.some(v => Math.abs(v - avg) < 0.005 || Math.abs(v / 10 - avg) < 0.005);
  let guessed: number | undefined;
  const pts = (avg?: number | null) => {
    guessed = avg != null && !stated(avg) ? avg : undefined;
    return guessed != null ? points : avgToPoints(avg) ?? points;
  };
  const guessNote = () => guessed == null ? {} :
    { karaktersnitt_ignored: `${guessed} is not a grade average the reader gave, so it was not used; ask for theirs if it matters` };

  return {
    search_schools: defTool({
      description: 'Find upper-secondary schools by name, place (kommune/town) and/or county, optionally only those offering a Vg1 utdanningsprogram. Returns each school\'s page link.',
      inputSchema: z.object({
        query: z.string().max(80).optional().describe('words of the school name'),
        near: z.string().max(60).optional().describe('a kommune or town; results are sorted by distance from it'),
        fylke: z.string().max(40).optional(),
        utdanningsprogram: z.string().max(60).optional().describe('code (ST, HS, EL…) or name'),
        limit: z.number().int().min(1).max(12).default(8),
      }),
      execute: async ({ query, near, fylke, utdanningsprogram, limit }) => {
        const f = findFylke(fylke);
        if (fylke && !f) return countyFacts(fylke);
        const cat = findCategory(utdanningsprogram);
        if (utdanningsprogram && !cat) return { error: `Unknown utdanningsprogram "${utdanningsprogram}".`, known: Object.values(CATS).map(c => c.no) };
        const centre = near ? placeCentre(near) : null;
        if (near && !centre) return { error: `No school stands in a kommune or town called "${near}". Try the nearest larger town, or a county.` };
        const q = query ? words(query) : [];
        let pool = data().schools.filter(s => schoolNewest(s) >= staleBefore())
          .filter(s => !f || s.fylke === f.fylke)
          .filter(s => !cat || currentPrograms(s).some(p => p.category === cat))
          .filter(s => !q.length || q.every(w => [...words(s.name), ...words(s.kommune || ''), ...words(s.sted || '')].some(n => n.startsWith(w))));
        const rows = pool.map(s => ({ s, d: centre ? km(centre, s) : 0 })).sort((a, b) => a.d - b.d || a.s.name.localeCompare(b.s.name, 'nb'));
        return {
          total: rows.length,
          schools: rows.slice(0, limit).map(({ s, d }) => ({
            ...schoolCard(s), distance_km: centre ? d : undefined,
            vg1_utdanningsprogram: [...new Set(currentPrograms(s).map(p => p.category))].map(c => CATS[c as Cats]?.no || c),
          })),
        };
      },
    }),

    school_details: defTool({
      description: 'One school\'s programme rows: the latest poenggrenser, the model\'s forecast for next intake and, when a grade average is known, the chance of a place. Vg1 only unless all_levels.',
      inputSchema: z.object({
        school: z.string().max(120), fylke: z.string().max(40).optional(),
        karaktersnitt: z.number().min(1).max(6).optional().describe('grade average 1–6 the reader gave in this conversation; leave it out when they gave none, never guess one'),
        all_levels: z.boolean().default(false),
      }),
      execute: async ({ school, fylke, karaktersnitt, all_levels }) => {
        const r = schoolOrError(school, fylke);
        if (!r.school) return r;
        const s = r.school, p = pts(karaktersnitt);
        return {
          ...schoolCard(s), address: s.address, url: s.url,
          ...guessNote(), grade_average_used: pointsLabel(p),
          intake_round: s.round ? `${s.round}. inntak` : undefined,
          programmes: currentPrograms(s, all_levels ? 'all' : 'Vg1').slice(0, 30).map(q => programSummary(s, q, p)),
        };
      },
    }),

    compare_schools: defTool({
      description: 'Compare one Vg1 utdanningsprogram (or a named programområde) across schools: latest threshold, forecast and chance at the grade average. Rows run from the most to the least competitive (sort=threshold, the default), so ambitious, realistic and safe options all show; band_counts says how many fall in each band.',
      inputSchema: z.object({
        programme: z.string().max(80).describe('utdanningsprogram code/name (ST, Helse- og oppvekstfag…) or a programområde name'),
        fylke: z.string().max(40).optional(),
        near: z.string().max(60).optional().describe('a kommune or town: keeps the schools within reach of it (about 30 km, wider only when too few), with distance'),
        max_km: z.number().int().min(1).max(500).optional(),
        karaktersnitt: z.number().min(1).max(6).optional().describe('grade average 1–6 the reader gave in this conversation; leave it out when they gave none, never guess one'),
        sort: z.enum(['threshold', 'chance', 'distance']).default('threshold'),
        limit: z.number().int().min(1).max(20).default(8),
      }),
      execute: async ({ programme, fylke, near, max_km, karaktersnitt, sort, limit }) => {
        const f = findFylke(fylke);
        if (fylke && !f) return countyFacts(fylke);
        const centre = near ? placeCentre(near) : null;
        if (near && !centre) return { error: `No school stands in a kommune or town called "${near}".` };
        const cat = findCategory(programme);
        const p = pts(karaktersnitt);
        const rows: any[] = [];
        for (const s of data().schools) {
          if (schoolNewest(s) < staleBefore()) continue;
          if (f && s.fylke !== f.fylke) continue;
          if (!f && centre && s.fylke !== centre.fylke && !max_km) continue;
          const d = centre ? km(centre, s) : undefined;
          if (max_km && d !== undefined && d > max_km) continue;
          const progs = currentPrograms(s, cat ? 'Vg1' : 'all').filter(q => cat ? q.category === cat
            : words(programme).every(w => words(q.program).some(n => n.startsWith(w))));
          for (const q of progs) {
            const c = wishChance(s, q, p);
            rows.push({ school: s.name, fylke: s.fylke, link: siteLink(s), distance_km: d, key: progKeyMap(s).get(q),
              programme: q.program, level: q.level, latest: programSummary(s, q, p, 1).history, ...c });
          }
        }
        if (!rows.length) return { error: `No current school offers "${programme}"${f ? ' in ' + f.fylke : ''}${near ? ' near ' + near : ''}.` };
        // "near Bergen" means a school a pupil can travel to every day: the
        // nearest ring that holds a handful of rows, not the whole county
        let radius: number | undefined;
        if (centre && !max_km) {
          radius = [30, 60, 100].find(r => rows.filter(x => x.distance_km <= r).length >= 5);
          if (radius) rows.splice(0, rows.length, ...rows.filter(x => x.distance_km <= radius!));
        }
        const thr = (r: any) => parseFloat(r.expected_threshold) || 0;
        rows.sort(sort === 'distance' ? (a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0)
          : sort === 'threshold' || p == null ? (a, b) => thr(b) - thr(a)
          : (a, b) => (b.chance ?? -1) - (a.chance ?? -1) || (a.distance_km ?? 0) - (b.distance_km ?? 0));
        const band_counts = p == null ? undefined : rows.reduce((a, r) => { const b = r.band || 'no_forecast'; a[b] = (a[b] || 0) + 1; return a; }, {} as Record<string, number>);
        // a long list keeps its spread: the most competitive rows, then the
        // likely rows nearest the reader's level, not the least competitive
        let pick = rows.slice(0, limit);
        if (p != null && sort === 'threshold' && rows.length > limit) {
          const above = rows.filter(r => r.band !== 'likely'), likely = rows.filter(r => r.band === 'likely');
          const nA = Math.min(above.length, Math.ceil(limit / 2));
          pick = [...above.slice(-nA), ...likely.slice(0, limit - nA)];
        }
        // what every row shares is said once, not on each row
        const shared: Record<string, unknown> = {};
        for (const k of ['fylke', 'level', 'forecast_year'])
          if (pick.length && pick.every(r => r[k] === pick[0][k])) { shared[k] = pick[0][k]; pick = pick.map(({ [k]: _, ...r }) => r); }
        return { ...guessNote(), grade_average_used: pointsLabel(p), ...shared, within_km: radius, total: rows.length, band_counts,
                 note: rows.length > pick.length ? `showing ${pick.length} of ${rows.length}; ask with near/max_km or a higher limit for more` : undefined,
                 rows: pick };
      },
    }),

    check_wishes: defTool({
      description: 'Check the wish list (the one on screen unless wishes are given): chance for each wish, the chance of getting at least one, and rule/strategy flags. Call it before giving advice about the list.',
      inputSchema: z.object({ karaktersnitt: z.number().min(1).max(6).optional().describe('grade average 1–6 the reader gave in this conversation; leave it out when they gave none, never guess one') }),
      execute: async ({ karaktersnitt }) => {
        const p = pts(karaktersnitt);
        const items = wishes.map(resolveWish);
        const rows = items.map((w, i) => w ? { rank: i + 1, school: w.s.name, fylke: w.s.fylke, link: siteLink(w.s),
          programme: w.p.program, level: w.p.level, utdanningsprogram: w.p.category, ...wishChance(w.s, w.p, p) }
          : { rank: i + 1, error: 'this wish no longer matches the dataset' });
        let none = 1, n = 0;
        for (const r of rows as any[]) if (typeof r.chance === 'number') { none *= 1 - r.chance / 100; n++; }
        const flags: string[] = [];
        if (!rows.length) flags.push('The list is empty.');
        if (p == null) flags.push('No grade average is set, so no chances can be computed; ask for the expected karaktersnitt.');
        if (rows.length >= 10) flags.push('The list is full: vigo takes at most 10 wishes.');
        const cats = new Set((rows as any[]).filter(r => r.level === 'Vg1').map(r => r.utdanningsprogram));
        if (cats.size > 3) flags.push('More than 3 different Vg1 utdanningsprogram: vigo does not allow that.');
        if (rows.length && cats.size < 3) flags.push(`Only ${cats.size} different Vg1 utdanningsprogram: the right is to one of three, and with fewer the pupil can be placed in a programme they did not choose.`);
        const counties = new Set((rows as any[]).map(r => r.fylke).filter(Boolean));
        if (counties.size > 1) flags.push('Wishes span several counties; an applicant normally applies in their home county (a different county needs its own application and has its own rules).');
        if (p != null && rows.length && !(rows as any[]).some(r => (r.chance ?? 0) >= 70))
          flags.push('No wish is in the "likely" band (≥ 70 %): consider adding a safer option lower on the list.');
        const schools = new Set((rows as any[]).map(r => r.school));
        if (rows.length >= 3 && schools.size === 1) flags.push('Every wish is at the same school.');
        flags.push(...overLimit(rows as any[]));
        return {
          ...guessNote(), grade_average_used: pointsLabel(p), wishes: rows,
          chance_at_least_one: n ? `${Math.min(Math.round((1 - none) * 100), CHANCE_CAP_PCT)}%${1 - none > CHANCE_CAP_PCT / 100 ? ' or more' : ''}` : undefined,
          chance_note: n < rows.length ? `${rows.length - n} wish(es) have no forecast and are left out of the combined figure.` : undefined,
          flags,
        };
      },
    }),

    county_info: defTool({
      description: 'A county\'s admission facts in Poengkart: which inntak it publishes, whether school choice is free, which years exist.',
      inputSchema: z.object({ fylke: z.string().max(40) }),
      execute: async ({ fylke }) => countyFacts(fylke),
    }),

    /* ---------- screen actions ---------- */

    add_wish: defTool({
      description: 'Add a school + programme to the bottom of the reader\'s wish list on screen (or at a rank). Only when the reader asked or agreed.',
      inputSchema: z.object({
        school: z.string().max(120), fylke: z.string().max(40).optional(),
        programme: z.string().max(160).describe('programme key from a tool result, or its name / utdanningsprogram'),
        rank: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ school, fylke, programme, rank }) => {
        if (wishes.length >= 10) return { ok: false, error: 'The list already has 10 wishes, vigo\'s maximum; nothing was added.' };
        const r = schoolOrError(school, fylke);
        if (!r.school) return { ok: false, ...r };
        const s = r.school, pr = programOrError(s, programme);
        if (!pr.prog) return { ok: false, ...pr };
        const k = progKeyMap(s).get(pr.prog)!;
        if (wishes.some(w => w.f === s.fylke && w.s === s.name && w.k === k)) return { ok: false, error: 'Already on the list.' };
        if (pr.prog.level === 'Vg1') {
          const cats = new Set(wishes.map(resolveWish).filter(w => w && w.p.level === 'Vg1').map(w => w!.p.category));
          if (!cats.has(pr.prog.category) && cats.size >= 3) return { ok: false, error: 'vigo allows at most 3 different Vg1 utdanningsprogram; this would be a 4th.' };
        }
        const at = rank ? Math.min(rank, wishes.length + 1) - 1 : wishes.length;
        wishes.splice(at, 0, { f: s.fylke, s: s.name, k });
        const warning = overLimit(wishes.map(resolveWish).filter(Boolean)
          .map(w => ({ fylke: w!.s.fylke, school: w!.s.name, utdanningsprogram: w!.p.category, level: w!.p.level })))[0];
        return { ok: true, action: { type: 'add', f: s.fylke, s: s.name, k, rank: at + 1 }, warning,
                 added: `${s.name} – ${pr.prog.program} (${pr.prog.level})`, rank: at + 1, link: siteLink(s),
                 ...wishChance(s, pr.prog, points) };
      },
    }),

    remove_wishes: defTool({
      description: 'Remove wishes from the list: one or several by rank (1 = first wish), or the whole list with all=true. Only when the reader asked; the page offers an undo.',
      inputSchema: z.object({
        ranks: z.array(z.number().int().min(1).max(12)).max(12).optional(),
        all: z.boolean().optional().describe('true empties the whole list'),
      }),
      execute: async ({ ranks, all }) => {
        if (!all && !ranks?.length) return { ok: false, error: 'Give the ranks to remove, or all=true.' };
        if (!wishes.length) return { ok: false, error: 'The list is already empty.' };
        const want = all ? wishes.map((_, i) => i + 1) : [...new Set(ranks)];
        const bad = want.filter(r => !wishes[r - 1]);
        if (bad.length) return { ok: false, error: `There is no wish number ${bad.join(', ')}; the list has ${wishes.length}.` };
        const items = want.map(r => wishes[r - 1]);
        const removed = items.map(w => { const rw = resolveWish(w); return rw ? `${rw.s.name} – ${rw.p.program}` : w.s; });
        wishes.splice(0, wishes.length, ...wishes.filter(w => !items.includes(w)));
        return { ok: true, action: { type: 'remove', items, all: !!all && !wishes.length }, removed, left: wishes.length };
      },
    }),

    move_wish: defTool({
      description: 'Move a wish to another rank (1 = first wish). Only when the reader asked.',
      inputSchema: z.object({ from_rank: z.number().int().min(1).max(12), to_rank: z.number().int().min(1).max(12) }),
      execute: async ({ from_rank, to_rank }) => {
        if (!wishes[from_rank - 1]) return { ok: false, error: `There is no wish number ${from_rank}.` };
        const to = Math.min(to_rank, wishes.length);
        const [w] = wishes.splice(from_rank - 1, 1);
        wishes.splice(to - 1, 0, w);
        return { ok: true, action: { type: 'move', ...w, rank: to }, moved: `${w.s} to rank ${to}`,
                 order: wishes.map((x, i) => `${i + 1}. ${x.s}`) };
      },
    }),

    set_filters: defTool({
      description: 'Set what the map and the list show: the county filter, the utdanningsprogram filter ("all" clears either), the view (map or list), and the place the list measures distance from (near; "" clears it). Only when the reader asked.',
      inputSchema: z.object({
        fylke: z.string().max(40).optional(),
        utdanningsprogram: z.string().max(80).optional(),
        view: z.enum(['map', 'list']).optional(),
        near: z.string().max(60).optional(),
      }),
      execute: async ({ fylke, utdanningsprogram, view, near }) => {
        const action: Record<string, string> = { type: 'filter' };
        if (fylke !== undefined) {
          if (/^(all|alle|hele landet|all of norway|)$/i.test(fylke.trim())) action.fylke = 'all';
          else {
            const f = findFylke(fylke);
            if (!f) return { ok: false, ...countyFacts(fylke), error: `Poengkart has no county called "${fylke}" with data.` };
            action.fylke = f.fylke;
          }
        }
        if (utdanningsprogram !== undefined) {
          if (/^(all|alle|alle utdanningsprogram|)$/i.test(utdanningsprogram.trim())) action.cat = 'all';
          else {
            const c = findCategory(utdanningsprogram);
            if (!c) return { ok: false, error: `"${utdanningsprogram}" is not a Vg1 utdanningsprogram; the filter takes one of: ${Object.values(CATS).map(x => x.no).join(', ')}.` };
            action.cat = c;
          }
        }
        if (view) action.view = view;
        if (near !== undefined) {
          if (near.trim() && !placeCentre(near)) return { ok: false, error: `No school stands in a kommune or town called "${near}".` };
          action.near = near.trim();
        }
        if (Object.keys(action).length === 1) return { ok: false, error: 'Nothing to change: give fylke, utdanningsprogram, view or near.' };
        return { ok: true, action };
      },
    }),

    open_school: defTool({
      description: 'Open a school\'s page on screen so the reader can look at it.',
      inputSchema: z.object({ school: z.string().max(120), fylke: z.string().max(40).optional() }),
      execute: async ({ school, fylke }) => {
        const r = schoolOrError(school, fylke);
        if (!r.school) return { ok: false, ...r };
        return { ok: true, action: { type: 'open', f: r.school.fylke, s: r.school.name }, opened: r.school.name, link: siteLink(r.school) };
      },
    }),

    set_karaktersnitt: defTool({
      description: 'Put the reader\'s own grade average (1–6) in the app\'s field, so the map, list and chances use it. Only when the reader asks for it or agrees; an average they merely mention goes into the other tools\' karaktersnitt instead.',
      inputSchema: z.object({ karaktersnitt: z.number().min(1).max(6) }),
      execute: async ({ karaktersnitt }) => {
        if (!stated(karaktersnitt)) return { ok: false, error: `${karaktersnitt} is not a grade average the reader gave; ask them for it.` };
        points = avgToPoints(karaktersnitt);
        return { ok: true, action: { type: 'points', avg: Math.round(karaktersnitt * 100) / 100 }, set: pointsLabel(points) };
      },
    }),
  };
}

/** The snapshot as the prompt shows it: resolved names, not keys. */
export function describeScreen(screen: Screen): string {
  const lines: string[] = [];
  lines.push(`View: ${screen.view || 'map'}; app language: ${screen.lang === 'en' ? 'English' : 'Norwegian'}.`);
  // the snapshot comes from the client: only names the dataset knows reach the
  // prompt, never a string someone typed into a hand-made request
  const fy = screen.fylke_filter && screen.fylke_filter !== 'all' ? findFylke(screen.fylke_filter) : null;
  if (fy && fy.fylke === screen.fylke_filter) lines.push(`County filter: ${fy.fylke}.`);
  const cat = CATS[screen.utdanningsprogram_filter as Cats];
  if (cat) lines.push(`Utdanningsprogram filter: ${cat.no}.`);
  lines.push(screen.points != null ? `Grade average entered: ${pointsLabel(screen.points)}.` : 'No grade average entered.');
  if (screen.open_school) {
    const r = resolveSchool(screen.open_school.school, screen.open_school.fylke);
    lines.push('school' in r ? `Open school page: ${r.school.name} (${r.school.fylke}), link ${siteLink(r.school)}`
      + (screen.open_school.programme && r.school.programs.some(p => p.program === screen.open_school!.programme)
        ? `, chart showing ${screen.open_school.programme}` : '') + '.' : 'Open school page: (unrecognised).');
  } else lines.push('No school page is open.');
  if (screen.wishes.length) {
    lines.push('Wish list on screen (rank. school – programme):');
    screen.wishes.forEach((w, i) => {
      const r = resolveWish(w);
      lines.push(r ? `  ${i + 1}. ${r.s.name} (${r.s.fylke}) – ${r.p.program} (${r.p.level})` : `  ${i + 1}. (unrecognised wish)`);
    });
  } else lines.push('Wish list: empty.');
  return lines.join('\n');
}

export { slug };
