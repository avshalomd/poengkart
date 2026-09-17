/* What the build knows about a page before any script runs: the head of the
   home page today, verbatim, and the site origin every absolute URL uses. */
import { schoolPath } from './helpers';
import type { School } from './types';

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
// address, and (Task 5) its own card.
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
    ogImage: SITE + '/og.png',
    ogImageAlt: `Poengkart-kort for ${s.name}: snittgrense ${latest} og utvikling år for år.`,
  };
}
