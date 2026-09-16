import { S } from './state';

/* ================= school search ================= */
// both sides of the match are folded, so "as" finds Ås and "sorumsand" Sørumsand
export const foldName = s => s.toLowerCase()
  .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/é/g, 'e')
  .replace(/[.,-]/g, ' ')
  .replace(/\s+/g, ' ').trim();
export function runSearch(q) {
  if (!S.DATA) return null;                      // a keystroke can beat the fetch
  if (!S.searchIx) S.searchIx = S.DATA.schools.map(s => ({ s, f: foldName(s.name) }));
  const f = foldName(q);
  if (!f) return null;
  // the exact tier exists because Norwegian collation puts Å after Z: without
  // it, typing "Ås" ranked Asker first and Enter opened the wrong school
  const score = e => e.f === f ? 0
    : e.f.startsWith(f) ? 1
    : e.f.split(' ').some(w => w.startsWith(f)) ? 2
    : e.f.includes(f) ? 3 : -1;
  const hits = S.searchIx.map(e => [score(e), e.s]).filter(x => x[0] >= 0)
    .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name, 'no'))
    .slice(0, 8).map(x => x[1]);
  // "Møre" answered "Ingen treff": one county row above the names, never more
  const county = S.DATA.counties.map(c => c.fylke)
    .find(c => { const cf = foldName(c); return cf.startsWith(f) || cf.split(' ').some(w => w.startsWith(f)); });
  return county ? [{ county }, ...hits] : hits;
}

export function initSearch() {
}
