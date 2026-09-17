/* What the build knows about a page before any script runs: the head of the
   home page today, verbatim, the site origin every absolute URL uses, and the
   school's own sheet, written into the shell from the same templates the
   client renders with. */
import { schoolPath } from './helpers';
import { S } from './state';
import { heroHtml, listHtml, metaHtml, notesHtml, photoHtml, srcNoteHtml } from './templates';
import type { Dataset, School } from './types';

export const SITE = 'https://poengkart-no.vercel.app';

export interface HeadProps {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  twitterDescription: string;
  ogImage: string;
  ogImageAlt: string;
}

export const HOME_HEAD: HeadProps = {
  title: 'Poengkart – poenggrenser for videregående skole',
  description: 'Se poenggrensene for 217 videregående skoler i åtte fylker, 2012–2026. Hva krevdes for å komme inn i fjor, og hvordan har grensene endret seg? Kart, trender og tall per programområde.',
  canonical: SITE + '/',
  ogTitle: 'Poengkart – hva krevdes for å komme inn?',
  ogDescription: 'Poenggrensene for 217 videregående skoler i åtte fylker, 2012–2026, på kart. Se hva som krevdes for å få plass, og hvordan grensene har endret seg.',
  twitterDescription: 'Poenggrensene for 217 videregående skoler i åtte fylker, 2012–2026, på kart.',
  ogImage: SITE + '/og.png',
  ogImageAlt: 'Kart over Norge med 217 videregående skoler som prikker, fargelagt etter poenggrense, og skolesiden for Elvebakken videregående skole med bilde, snittgrense og utvikling år for år.',
};

// The head of a school's page: the school's name in the title and the share
// title, the county and the span of years in the description, the canonical
// address, and its own card — /og/<fylke>/<skole>.png, drawn at build time by
// web/src/pages/og/[fylke]/[skole].png.ts from the same statistic the sheet
// shows.
export function schoolHead(s: School): HeadProps {
  const years = [...new Set(s.programs.flatMap(p => Object.keys(p.values)))].sort();
  const span = years.length ? ` (${years[0]}–${years[years.length - 1]})` : '';
  const latest = years[years.length - 1] || '';
  const path = schoolPath(s);
  const description = `Poenggrenser for ${s.name} i ${s.fylke}: hva som krevdes for å komme inn på hvert programområde, år for år${span}.`;
  return {
    title: `${s.name} – poenggrenser | Poengkart`,
    description,
    canonical: SITE + path,
    ogTitle: `${s.name} – hva krevdes for å komme inn?`,
    ogDescription: description,
    twitterDescription: description,
    ogImage: SITE + '/og' + path + '.png',
    ogImageAlt: `Poengkart-kort for ${s.name}: snittgrense ${latest} og utvikling år for år.`,
  };
}

// The six containers of the sheet, as they stand in shell.html, and the
// aside itself. A replacement that finds no anchor throws: an edit to the
// markup must not turn the prerender off silently.
const ANCHORS: [string, (s: School) => string][] = [
  ['<div class="photo" id="s-photo"></div>', s => `<div class="photo" id="s-photo">${photoHtml(s)}</div>`],
  ['<div class="meta" id="s-meta"></div>', s => `<div class="meta" id="s-meta">${metaHtml(s)}</div>`],
  ['<div class="notes" id="s-notes" hidden></div>', s => { const n = notesHtml(s); return n ? `<div class="notes" id="s-notes">${n}</div>` : '<div class="notes" id="s-notes" hidden></div>'; }],
  ['<div class="hero" id="s-hero"></div>', s => `<div class="hero" id="s-hero">${heroHtml(s, null).hero}</div>`],
  ['<div class="mixwarn" id="s-mix" hidden></div>', s => { const m = heroHtml(s, null).mix; return m ? `<div class="mixwarn" id="s-mix">${m}</div>` : '<div class="mixwarn" id="s-mix" hidden></div>'; }],
  ['<div id="s-list"></div>', s => `<div id="s-list">${listHtml(s, null)}</div>`],
  ['<div id="src-note"></div>', () => `<div id="src-note">${srcNoteHtml()}</div>`],
  ['<aside id="side">', () => '<aside id="side" class="open">'],
];

// The shell with one school's sheet open in it, rendered the way the client
// renders it on a fresh load: Norwegian, no lens, Vg1 scope, no history.
export function fillShell(shell: string, school: School, data: Dataset): string {
  S.DATA = data; S.lang = 'no'; S.current = school;
  S.mapCat = 'all'; S.mapFylke = 'all'; S.allLevels = false; S.showOld = false;
  // no reader yet: no chips, no picks, no selected row. S.chart is the whole
  // object because initHelpers() — the client's only writer of it — never runs
  // in the build, and `S.chart.prog = null` would be a set on undefined.
  S.myPoints = null; S.choices = []; S.chart = { prog: null };
  let out = shell;
  for (const [anchor, render] of ANCHORS) {
    if (!out.includes(anchor)) throw new Error(`prerender: anchor not found in shell.html: ${anchor}`);
    out = out.replace(anchor, render(school));
  }
  return out;
}
