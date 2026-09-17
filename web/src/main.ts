// Leaflet's module body ends with `window.L = exports`, and
// leaflet.markercluster is a plain script that reads that global rather than
// importing anything. So Leaflet has to have run first: this import is here
// for that order alone, and every module that uses L imports it for itself.
import 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import './styles/app.css';
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
