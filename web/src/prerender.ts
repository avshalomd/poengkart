/* What the build knows about a page before any script runs: the head of the
   home page today, verbatim, and the site origin every absolute URL uses. */
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
