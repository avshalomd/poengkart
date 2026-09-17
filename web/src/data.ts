import raw from '../public/data/schools.json?raw';
import type { Dataset } from './types';

// The dataset as the BUILD sees it: the file the pipeline writes, read once
// at build time through Vite's raw import. Not a JSON import (tsc would parse
// two megabytes of literal on every typecheck) and not a filesystem read
// (Astro bundles this module into web/dist/.prerender, and a path anchored on
// the module or on the working directory resolves somewhere else there).
export function loadDataset(): Dataset {
  return JSON.parse(raw);
}
