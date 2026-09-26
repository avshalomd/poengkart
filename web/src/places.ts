import { shownSchools } from './helpers';
import { foldName } from './search';
import { S } from './state';
import type { Place, School } from './types';

/* ================= places: kommune, post town, distance ================= */
// tools/places.py gives every school its kommune and the post town of its
// address. A reader asks by either: «Sandnes» is a kommune, «Os» and «Fana»
// are post towns inside Bjørnafjorden and Bergen.

/** What the list and the search print for a school's whereabouts: the kommune,
    with the post town beside it where they differ («Bærum (Hosle)»). */
export function placeLabel(s: School): string {
  const k = s.kommune || s.sted || '';
  return s.sted && s.sted !== k ? `${k} (${s.sted})` : k;
}

// Every kommune and post town that has a school, at the middle of its schools.
// A reader in a place with no school finds the nearest by position instead.
export function places(): Place[] {
  if (S.placeIx) return S.placeIx;
  const acc = new Map<string, { name: string; kind: 'kommune' | 'sted'; lat: number; lon: number; n: number; fylke: Set<string> }>();
  const add = (name: string | undefined, kind: 'kommune' | 'sted', s: School) => {
    if (!name || !s.lat) return;
    // a post town named as its kommune is that kommune («Asker», «Oslo»)
    const key = foldName(name);
    const e = acc.get(key) || { name, kind, lat: 0, lon: 0, n: 0, fylke: new Set<string>() };
    if (e.kind === 'sted' && kind === 'kommune') { e.kind = 'kommune'; e.name = name; }
    e.lat += s.lat; e.lon += s.lon; e.n++; e.fylke.add(s.fylke);
    acc.set(key, e);
  };
  for (const s of shownSchools()) { add(s.kommune, 'kommune', s); if (s.sted !== s.kommune) add(s.sted, 'sted', s); }
  S.placeIx = [...acc.values()].map(e => ({
    name: e.name, kind: e.kind, lat: e.lat / e.n, lon: e.lon / e.n, n: e.n,
    fylke: e.fylke.size === 1 ? [...e.fylke][0] : null, f: foldName(e.name),
  }));
  return S.placeIx;
}
/** Places whose name begins with the query (or a word of it), best first. */
export function findPlaces(q: string, max = 2): Place[] {
  const f = foldName(q);
  if (!f) return [];
  const score = (p: Place) => { const pf = p.f || ''; return pf === f ? 0 : pf.startsWith(f) ? 1 : pf.split(' ').some(w => w.startsWith(f)) ? 2 : -1; };
  return places().map(p => [score(p), p] as [number, Place]).filter(x => x[0] >= 0)
    .sort((a, b) => a[0] - b[0] || (b[1].n || 0) - (a[1].n || 0) || a[1].name.localeCompare(b[1].name, 'no'))
    .slice(0, max).map(x => x[1]);
}

/** Great-circle distance in km. */
export function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** How far a school is from the place the reader picked, or null. */
export const distOf = (s: School): number | null =>
  S.near && s.lat ? distKm(S.near.lat, S.near.lon, s.lat, s.lon) : null;
/** «3 km», «850 m» under a kilometre; straight-line distance, not travel. */
export const fmtKm = (d: number) => d < 1 ? `${Math.max(100, Math.round(d * 10) * 100)} m` : `${Math.round(d)} km`;

export function saveNear() {
  try {
    if (S.near && S.near.kind !== 'me') localStorage.setItem('pk-near', JSON.stringify(S.near));
    else localStorage.removeItem('pk-near');
  } catch (e) {}
}
export function initPlaces() {
  try {
    const n = JSON.parse(localStorage.getItem('pk-near') || 'null');
    if (n && typeof n.name === 'string' && isFinite(n.lat) && isFinite(n.lon)) {
      S.near = { name: n.name, lat: +n.lat, lon: +n.lon, kind: n.kind === 'sted' ? 'sted' : 'kommune' };
      // the place was picked to «sorter etter avstand», as setNear() does; a
      // reload kept the place and its chip but went back to the threshold order
      S.listSort = { key: 'dist', dir: 1 };
    }
  } catch (e) {}
}
