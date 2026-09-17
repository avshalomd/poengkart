// MapLibre's worker is served from our origin next to the module it imports
// (tools/vendor-maplibre.mjs); the version is the one the build vendored.
// The engine's stylesheet, and the app's own, are imported by
// layouts/Base.astro so the page ships them in the <head> rather than waiting
// for this script.
import { setWorkerUrl } from 'maplibre-gl';
setWorkerUrl(`/maplibre/${__MAPLIBRE_VER__}/maplibre-gl-worker.mjs`);
import { initI18n } from './i18n'; import { initHelpers } from './helpers'; import { initChance } from './chance';
import { initMap } from './map'; import { initChrome } from './chrome'; import { initSidebar } from './sidebar';
import { initChart } from './chart'; import { initPrograms } from './programs'; import { initFeedback } from './feedback';
import { initTips } from './tips'; import { initIntro } from './intro'; import { initPrefs } from './prefs';
import { initSearch } from './search'; import { initSearchov } from './searchov'; import { initLocate } from './locate';
import { initListview } from './listview'; import { initCalc } from './calc'; import { initLang } from './lang';
import { initBoot, boot } from './boot';
import { exposeGlobals } from './globals';

// the former top-level statements, in the order the one-file app ran them
for (const init of [initI18n, initHelpers, initChance, initMap, initChrome, initSidebar, initChart, initPrograms,
  initFeedback, initTips, initIntro, initPrefs, initSearch, initSearchov, initLocate, initListview, initCalc, initLang, initBoot]) init();
exposeGlobals();
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot); else boot();
