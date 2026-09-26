import { findPlaces } from './places';
import { S } from './state';
import type { School, SearchHit } from './types';

/* ================= school search ================= */
// both sides of the match are folded, so "as" finds Ås and "sorumsand" Sørumsand
export const foldName = s => s.toLowerCase()
  .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/é/g, 'e')
  .replace(/[.,-]/g, ' ')
  .replace(/\s+/g, ' ').trim();
// «videregående skole», «vidaregåande skule» and «vgs» are one word to a reader,
// and say nothing about which school is meant
const tokens = (f: string) => f.split(' ')
  .map(w => /^v[ie]d[ae]regaa?ende$/.test(w) ? 'vgs' : w === 'skule' ? 'skole' : w);
const GENERIC = new Set(['vgs', 'skole']);
// mode 'places' is the «Nær …» picker: places only, and the reader's own
// position first, before anything is typed
export function runSearch(q, mode: 'all' | 'places' = 'all'): SearchHit[] | null {
  if (!S.DATA) return null;                      // a keystroke can beat the fetch
  if (mode === 'places') {
    const me: SearchHit[] = 'geolocation' in navigator && !foldName(q) ? [{ place: { name: '', kind: 'me', lat: 0, lon: 0 } }] : [];
    return [...me, ...findPlaces(q, 8).map(place => ({ place }))];
  }
  // nsr_name is the register's full name: Akershus and Buskerud publish «Asker»,
  // and «Asker videregående skole» answered «Ingen treff»
  if (!S.searchIx) S.searchIx = S.DATA.schools.map(s => {
    const f = foldName(s.name), n = foldName(s.nsr_name || '');
    return { s, f, n, w: [...new Set([...tokens(f), ...tokens(n)])],
             p: [foldName(s.kommune || ''), foldName(s.sted || '')].filter(Boolean) };
  });
  const f = foldName(q);
  if (!f) return null;
  // what the query names once the generic words are set aside; a query of
  // nothing else («videregående») keeps them
  const all = tokens(f), named = all.filter(w => !GENERIC.has(w)), want = named.length ? named : all;
  // the exact tier exists because Norwegian collation puts Å after Z: without
  // it, typing "Ås" ranked Asker first and Enter opened the wrong school. A
  // whole first word is the same case one step down: "Bø" opened Borgund.
  const score = e => e.f === f || e.n === f ? 0
    : e.f.split(' ')[0] === f ? 0.5
    : e.f.startsWith(f) ? 1
    : e.f.split(' ').some(w => w.startsWith(f)) ? 2
    // where the school stands: «Sandnes» finds Gand and Vågen, «Bærum» the
    // schools whose post town is Hosle or Gjettum
    : e.p.includes(f) ? 2.5
    : e.f.includes(f) ? 3
    : e.p.some(w => w.startsWith(f)) ? 3.5
    // every word typed begins a word of the name, in any order and in either
    // written form: «Førde videregående skole» finds Førde vidaregåande skule
    : want.every(t => e.w.some(w => w.startsWith(t))) ? 4 : -1;
  const scored = S.searchIx.map(e => [score(e), e.s] as [number, School]).filter(x => x[0] >= 0)
    .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name, 'no'))
    .slice(0, 8);
  const hits = scored.map(x => x[1]);
  // "Møre" answered "Ingen treff": one county row above the names, never more.
  // A county that begins with the query comes before one that only contains a
  // word beginning with it: "ro" offered Møre og Romsdal, not Rogaland.
  const folded = S.DATA.counties.map(c => [c.fylke, foldName(c.fylke)]);
  const county = (folded.find(([, cf]) => cf.startsWith(f))
    || folded.find(([, cf]) => cf.split(' ').some(w => w.startsWith(f))) || [])[0];
  // A row that sorts by distance from the place named. It goes below the
  // schools whose own name begins with the query, so Enter on «Ås» or «Voss»
  // still opens the school, and above the rest. One letter names no place.
  const near: SearchHit[] = f.length < 2 ? [] : findPlaces(q, 2).map(place => ({ place }));
  const k = scored.filter(x => x[0] <= 1).length;
  return [...(county ? [{ county }] : []), ...hits.slice(0, k), ...near, ...hits.slice(k)];
}

export function initSearch() {
}
