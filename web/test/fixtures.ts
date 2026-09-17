import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S } from '../src/state';

// see setup.ts: happy-dom's global URL does not resolve a relative URL
// against import.meta.url the way Node's does, so read fixture files via
// node:path/node:url instead of `new URL(p, import.meta.url)`.
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => JSON.parse(readFileSync(path.join(here, p), 'utf8'));
export const DATA = read('../public/data/schools.json');
export const MODEL = read('../public/data/model.json');

export function loadFixtures(): void {
  S.DATA = DATA; S.MODEL = MODEL; S.lang = 'no'; S.myPoints = null; S.mapCat = 'all'; S.mapFylke = 'all'; S.allLevels = false; S.showOld = false;
  S._newestByFylke = null;
}
export const school = (name: string) => DATA.schools.find((s: any) => s.name === name)!;
export const asker = () => school('Asker');
export const forde = () => DATA.schools.find((s: any) => /^Førde/.test(s.name))!;
