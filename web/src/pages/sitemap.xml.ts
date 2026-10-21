// Built once per build from the dataset: the home, the report, a URL per
// county and a URL per school. <lastmod> is the day the figures last changed (updated.date,
// which build_dataset.py keeps until the figures' hash changes), never the build date, so a
// rebuild does not make crawlers refetch pages whose figures are the same.
import type { APIRoute } from 'astro';
import { loadDataset } from '../data';
import { countyPath, schoolPath } from '../helpers';
import { SITE, countiesByName } from '../prerender';

const url = (loc: string, priority: string, lastmod?: string) =>
  `  <url>\n    <loc>${loc}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;

export const GET: APIRoute = () => {
  const data = loadDataset(), schools = data.schools, d = data.updated?.date;
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + url(SITE + '/', '1.0', d) + url(SITE + '/report', '0.6', d)
    + countiesByName(data).map(c => url(SITE + countyPath(c.fylke), '0.8', d)).join('')
    + schools.map(s => url(SITE + schoolPath(s), '0.7', d)).join('')
    + '</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
