/* The address. A school is a path (/akershus/asker), the filters are the
   query string (?f=Oslo&c=ST&l=all, omitted when "all"), and the view is a
   preference, not an address. Until stage 3 all of it was the fragment
   (#s=Fylke/Skole&f=…), which a static host never sees; those links are still
   in the wild, so adoptLegacyUrl() turns one into the path form at boot.
   The history-state flags (pkSide: the one entry of an open-sheet episode;
   pkSheet: an overlay sheet's entry) are unchanged — the sheets' close paths
   still history.back() onto them. */
import { S } from './state';
import { slug, schoolPath, schoolTitle } from './helpers';
import { t } from './i18n';
import type { School } from './types';

// the county's own short name wins outright; the register's full name and a
// merged-away name are fallbacks, never able to shadow another school's name
function pick(inFylke: School[], match: (x: string) => boolean): School | null {
  return inFylke.find(x => match(x.name))
      // nsr_name also holds the geocoder's provenance sentinels "(manual)" and
      // "(stedsnavn)"; those are not names and must not open a school
      || inFylke.find(x => { const a = x.nsr_name || ''; return !!a && a[0] !== '(' && match(a); })
      || inFylke.find(x => (x.merged_from || []).some(match))
      || null;
}
export function schoolByName(fylke: string, name: string): School | null {
  // a pasted link may carry stray spaces or decomposed å/ø from another app
  const key = name.trim().normalize('NFC').toLowerCase();
  const inFylke = (S.DATA?.schools || []).filter(x => x.fylke === fylke);
  return pick(inFylke, x => x.toLowerCase() === key);
}
export function schoolBySlug(fylkeSlug: string, nameSlug: string): School | null {
  const inFylke = (S.DATA?.schools || []).filter(x => slug(x.fylke) === fylkeSlug);
  return pick(inFylke, x => slug(x) === nameSlug);
}
export function pathSegments(pathname = location.pathname): [string, string] | null {
  const m = /^\/([^/]+)\/([^/]+)$/.exec(pathname);
  return m ? [m[1], m[2]] : null;
}
export function queryParts(search = location.search): Record<string, string> {
  const out: Record<string, string> = {};
  new URLSearchParams(search).forEach((v, k) => { out[k] = v; });
  return out;
}
export function schoolFromUrl(): School | null {
  const seg = pathSegments();
  return seg ? schoolBySlug(seg[0], seg[1]) : null;
}
export function buildUrl(s: School | null): string {
  const q = new URLSearchParams();
  if (S.mapFylke !== 'all') q.set('f', S.mapFylke);
  if (S.mapCat !== 'all') q.set('c', S.mapCat);
  if (S.allLevels) q.set('l', 'all');
  const qs = q.toString();
  return (s ? schoolPath(s) : '/') + (qs ? '?' + qs : '');
}
export const schoolUrl = (s: School) => buildUrl(s);
// The tab says what the sheet says: a school's own title while its sheet is
// open — the very string the build prerendered into that page's <title> — and
// the app's own title, in the reader's language, once nothing is open.
// openSide's first push writes it too: that branch pushes the address itself
// and never reaches setUrlSchool.
export const docTitle = (s: School | null) => s ? schoolTitle(s) : t('pageTitle');
export function setUrlSchool(s: School | null) {
  document.title = docTitle(s);
  try { history.replaceState(history.state, '', buildUrl(s)); } catch (e) {}
}
// A filter change is a place you can come back to, so it gets its own history
// entry rather than editing the current one — except while a sheet is open:
// an open sheet is ONE entry (see openSide), and a filter changed inside it
// rewrites that entry, or the ✕'s back() would land on the sheet's own entry.
export function syncUrl(push?: boolean) {
  try {
    const h = buildUrl(S.current);
    if (h === location.pathname + location.search) return;
    const st = history.state || {};
    if (push && !st.pkSide && !st.pkSheet) history.pushState(history.state, '', h);
    else history.replaceState(history.state, '', h);
  } catch (e) {}
}
const safe = (v: string) => { try { return decodeURIComponent(v); } catch (e) { return v; } };
// The fragment form (#s=Fylke/Skole&f=&c=&l=) and the query form (?s=…, what
// the mailed county links carry because Gmail's redirect drops a fragment)
// both become path + query, in place, before the filters are read. Returns
// the school name a link asked for when no school answers to it, else ''.
export function adoptLegacyUrl(): string {
  const hash = (location.hash || '').replace(/^#/, '');
  const fromHash: Record<string, string> = {};
  if (hash) hash.split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) fromHash[kv.slice(0, i)] = kv.slice(i + 1); });
  const q = new URLSearchParams(location.search);
  const legacy = ['s', 'f', 'c', 'l'].some(k => k in fromHash) || q.has('s');
  if (!legacy) return '';
  const sRaw = 's' in fromHash ? safe(fromHash.s) : (q.get('s') || '');
  const m = /^([^/]+)\/(.+)$/.exec(sRaw);
  const fy = m ? m[1] : '', name = m ? m[2] : '';
  const pickKey = (k: string) => (k in fromHash ? safe(fromHash[k]) : q.get(k)) || '';
  const nq = new URLSearchParams();
  for (const k of ['f', 'c', 'l']) { const v = pickKey(k); if (v) nq.set(k, v); }
  const school = fy ? schoolByName(fy, name) : null;
  const qs = nq.toString();
  const keepPath = !sRaw && pathSegments() ? location.pathname : '/';
  const target = (school ? schoolPath(school) : keepPath) + (qs ? '?' + qs : '');
  try { history.replaceState(history.state, '', target); } catch (e) {}
  return sRaw && !school ? name.trim() : '';
}
// The 404 page keeps the address it was asked for; the toast names it in words.
export function unresolvedFromPath(): string {
  const seg = pathSegments();
  return seg ? seg[1].replace(/-+/g, ' ') : location.pathname;
}
