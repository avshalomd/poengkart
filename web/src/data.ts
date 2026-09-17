import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Dataset } from './types';

// The dataset as the BUILD sees it: node reads the file the pipeline writes,
// rather than the page importing the JSON — tsc would otherwise parse two
// megabytes of literal on every typecheck, and the client already fetches it.
// The path is anchored on the npm script's working directory (the repository
// root) and not on import.meta.url: Astro bundles this module into
// web/dist/.prerender, where a path relative to the module resolves nowhere.
export function loadDataset(): Dataset {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'web/public/data/schools.json'), 'utf8'));
}
