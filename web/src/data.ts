import raw from '../public/data/schools.json?raw';
import type { Dataset } from './types';

// The dataset as the BUILD sees it: the file the pipeline writes, read once
// at build time through Vite's raw import. Not a JSON import (tsc would parse
// two megabytes of literal on every typecheck) and not a filesystem read
// (Astro bundles this module into web/dist/.prerender, and a path anchored on
// the module or on the working directory resolves somewhere else there).
// Parsed once: the two page routes and the sitemap each ask for it, and every
// school's page asks again inside getStaticPaths — two megabytes of JSON per
// call otherwise.
let dataset: Dataset | null = null;
export function loadDataset(): Dataset {
  return dataset ??= JSON.parse(raw);
}
