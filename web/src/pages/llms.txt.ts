// llms.txt (llmstxt.org) for AI agents and assistants: what Poengkart is, its numbers and
// where its pages are, built from the dataset like the sitemap. English, since agents answer
// in every language; the site itself is Norwegian with an English switch.
import type { APIRoute } from 'astro';
import { loadDataset } from '../data';
import { countyPath } from '../helpers';
import { SITE, countiesByName } from '../prerender';

export const GET: APIRoute = () => {
  const data = loadDataset(), ys = data.years, first = ys[0], last = ys[ys.length - 1];
  const counties = countiesByName(data).filter(c => data.schools.some(s => s.fylke === c.fylke));
  const body = `# Poengkart

> Poengkart shows the admission thresholds (poenggrenser) for Norwegian upper secondary schools (videregående skole) on a map and as a ranked list: ${data.schools.length} schools in the ${counties.length} counties (fylker) that publish the figures, released them on request or once printed them, ${first}–${last}, per programme and year, collected from the counties' own publications.

- A threshold is the points of the last applicant who got a place (grade average × 10): what it took to get in, not what the school requires.
- Counties publish different intake rounds (inntak: 1., 2. or 3.) and thresholds fall between them, so every figure carries its round.
- Type in a grade average (karaktersnitt, 1–6) and every school and programme is coloured by the estimated chance of a place at the next intake, from a model fitted on the whole history and backtested year by year.
- Unofficial project: check the county's own pages before making decisions.${data.updated?.date ? `\n- Figures last changed: ${data.updated.date}.` : ''}

## Pages

- [Map and list of every school](${SITE}/)
- County: ${counties.map(c => `[${c.fylke}](${SITE}${countyPath(c.fylke)})`).join(', ')}
- School: ${SITE}/<county>/<school>, for example [Asker videregående skole](${SITE}/akershus/asker) (every programme with its threshold by year)
- [Technical report: the dataset and the forecast model](${SITE}/report)
- [The dataset as JSON](${SITE}/data/schools.json)
- [Sitemap](${SITE}/sitemap.xml)
- [Code and data on GitHub](https://github.com/avshalomd/poengkart)
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
