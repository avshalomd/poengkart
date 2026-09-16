/* Load-bearing, not a debug aid: three separate callers reach the app through
   `window` and would break silently without this file.

   1. `web/index.html` has twenty-one inline `on*=` attributes — setView,
      onPoints, unfoldPanel, openSettings, openSearchOv, openIntro, openCalc,
      openBug, onMapFylke, onMapCat and the close* pair for every sheet. An
      inline handler is compiled in global scope, so it can only see globals;
      a module's exports are not.
   2. The HTML the app writes itself carries the same kind of attribute —
      `onclick="closeSide()"`, `onclick="sortList('snitt')"`,
      `ontoggle="chanceMoreOpen = this.open"`, `onclick="openBug(current, this)"` —
      and some of those assign a *state field*, which is why the accessors
      below write through to S rather than shadowing it.
   3. The QA harnesses `.claude/skills/qa/figure-invariants.js` and
      `perf-harness.js` call the app's helpers and assign `mapCat`, `myPoints`
      and `allLevels` as page globals. That was the contract when the app was
      one script; the split keeps it.

   Every export of every module, and an accessor per state field that reads and
   writes S. */
import { S } from './state';
import * as i18n from './i18n'; import * as helpers from './helpers'; import * as chance from './chance';
import * as map from './map'; import * as chrome from './chrome'; import * as sidebar from './sidebar';
import * as chart from './chart'; import * as programs from './programs'; import * as feedback from './feedback';
import * as tips from './tips'; import * as intro from './intro'; import * as prefs from './prefs';
import * as search from './search'; import * as searchov from './searchov'; import * as locate from './locate';
import * as listview from './listview'; import * as calc from './calc'; import * as lang from './lang'; import * as boot from './boot';

/* `k in window` is true for every element the document NAMES as well: the HTML
   standard exposes each id as a window property, so `map` is <div id="map">
   and `choices` is <div id="choices"> before this file runs. The one-file app's
   top-level `let map` and `let choices` shadowed those, so the accessors have
   to as well — without this the QA harness read a <div> where it expected the
   wishes array. A real Window member (window.name and its kind) is an own
   property of the window and is left alone. */
const documentNamed = (w: any, k: string) => {
  const v = w[k];
  return (v instanceof Element || v instanceof HTMLCollection)
    && !Object.prototype.hasOwnProperty.call(w, k);
};

export function exposeGlobals(): void {
  const w = window as any;
  const mods = [i18n, helpers, chance, map, chrome, sidebar, chart, programs, feedback, tips, intro, prefs, search, searchov, locate, listview, calc, lang, boot];
  // The app's own names win over whatever the platform happens to call the
  // same thing: an inline handler that says openSide() means this openSide.
  for (const m of mods) for (const [k, v] of Object.entries(m)) if (!k.startsWith('init')) w[k] = v;
  for (const k of Object.keys(S)) {
    if (k in w && !documentNamed(w, k)) continue;   // never shadow a built-in like window.name
    Object.defineProperty(w, k, { get: () => (S as any)[k], set: v => { (S as any)[k] = v; }, configurable: true });
  }
  w.S = S;
}
