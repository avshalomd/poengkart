// Built once per build from the dataset: the home, the report, a URL per
// county and a URL per school. No <lastmod>: it would change with every build and only make
// crawlers refetch pages whose figures change once a year.
import type { APIRoute } from 'astro';
import { loadDataset } from '../data';
import { countyPath, schoolPath } from '../helpers';
import { SITE, countiesByName } from '../prerender';

const url = (loc: string, priority: string) =>
  `  <url>\n    <loc>${loc}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;

export const GET: APIRoute = () => {
  const data = loadDataset(), schools = data.schools;
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + url(SITE + '/', '1.0') + url(SITE + '/report', '0.6')
    + countiesByName(data).map(c => url(SITE + countyPath(c.fylke), '0.8')).join('')
    + schools.map(s => url(SITE + schoolPath(s), '0.7')).join('')
    + '</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
