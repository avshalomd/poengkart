"""Møre og Romsdal: the public Power BI report «Karakterstatistikk for
videregående skoler i Møre og Romsdal», embedded in the county's «Poenggrense»
page. Its table Sheet1 holds one row per (school year, school, programme,
level) with «Nedre karaktergrense» (NedrekarV2, a text column where the
report prints `*` for «alle kom inn, eller laveste karakter var under 25»)
and «Gjennomsnittlig karakterpoeng» (Gjennomkar), Vg1–Vg3, 2012/13 onward.

The capture is the query answer exactly as the API returned it; its
fingerprint is the decoded rows, so the answer's own timestamp never reads as
news. See tools/live/powerbi.py for how the public API is read.
"""
import json
import re

from live import powerbi
from live.core import Doc, Unhealthy

SOURCE = {
    'id': 'mro', 'county': 'mro', 'publisher': 'Møre og Romsdal fylkeskommune',
    # the report is linked («karakterstatistikk og poenggrenser ("snitt")») from
    # «Søk vidaregåande opplæring» since the site moved in 2026; the earlier
    # «Poenggrense» page under opplaring-i-skole answers 404
    'landing': 'https://mrfylke.no/tenester/skole-og-opplaring/innsoking-til-vidaregaande-opplaring/sok-vidaregaande-opplaring/',
    # 2. inntak ends late July; the report has been refreshed in August
    'season': [(7, 1, 10, 31)],
}
EMBED = ('https://app.powerbi.com/view?r=eyJrIjoiNjk4M2E1M2YtYWNmYi00ODU1LTg2ZGQtNjM5YmU1NzJmOTM4'
         'IiwidCI6ImI5MzJlY2U3LTljZGYtNGQ5NC1iNGMxLTE1MjU2ZTQzYzdlYSIsImMiOjl9')
SECTION = 'https://mrfylke.no/tenester/skole-og-opplaring/'
POWERBI = r'https://app\.powerbi\.com/view\?r=[A-Za-z0-9=_%-]+'
ENTITY = 'Sheet1'
COLUMNS = ['Skoleår', 'Skolenr', 'Skolenavn', 'Kurskode', 'Kursnavn', 'Kursnavn V2']
MEASURES = [('NedrekarV2', 3), ('Gjennomkar', 0)]      # min, sum: one row per group
MIN_ROWS = 4000


def _embed(ctx):
    """The report's embed link as the county links it now; the known one if
    the county's pages cannot be read."""
    known = ctx.url('embed', EMBED)
    landing = ctx.url('landing', SOURCE['landing'])
    page = ctx.get(landing)
    m = re.search(POWERBI, page.text()) if page.ok else None
    if not m:
        # the page moved or dropped the link: search the county's school section
        hits = ctx.search([SECTION], POWERBI, follow=r'innsoking|vidaregaande|opplaring|inntak|poeng')
        if hits:
            ctx.heal('landing', hits[0][2], f'{landing}: HTTP {page.status}, no report link; '
                     f'«{hits[0][0][:80]}» found by searching {SECTION}')
            m = re.search(POWERBI, hits[0][1])
    if not m:
        ctx.note(f'no page of the county links the report now ({landing}: HTTP {page.status}); '
                 f'using the known link')
        return known
    if m.group(0) != known:
        ctx.heal('embed', m.group(0), 'the county links a different report')
    return m.group(0)


def discover(ctx):
    embed = _embed(ctx)
    key = powerbi.resource_key(embed)
    hdr = {'X-PowerBI-ResourceKey': key}
    clusters = [ctx.url('cluster', powerbi.CLUSTERS[0])] + powerbi.CLUSTERS
    for cluster in dict.fromkeys(clusters):
        r = ctx.get(f'{cluster}/public/reports/{key}/modelsAndExploration?preferReadOnlySession=true',
                    headers=hdr, retries=1)
        if r.ok:
            break
    else:
        raise Unhealthy(f'no Power BI cluster knows the report key (last: HTTP {r.status})')
    if cluster != ctx.url('cluster', powerbi.CLUSTERS[0]):
        ctx.heal('cluster', cluster, 'the report key answered on this cluster')
    info = json.loads(r.body)
    model = dict(info['models'][0], report=info['exploration']['report']['objectId'])
    body = json.dumps(powerbi.query_body(model, ENTITY, COLUMNS, MEASURES), ensure_ascii=False)
    q = ctx.need(ctx.get(f'{cluster}/public/reports/querydata?synchronous=true', method='POST',
                         data=body, headers=dict(hdr, **{'Content-Type': 'application/json'})),
                 'the report query')
    try:
        names, rows = powerbi.rows(json.loads(q.body))
    except (powerbi.Incomplete, ValueError) as e:
        # a renamed column makes the query an error: the answer says which
        raise Unhealthy(f'the report query: {e}')
    if len(names) != len(COLUMNS) + len(MEASURES):
        raise Unhealthy(f'the report query answered {names}')
    if len(rows) < MIN_ROWS:
        raise Unhealthy(f'the report query gave {len(rows)} rows, expected {MIN_ROWS} or more')
    years = sorted({r[0] for r in rows})
    last = years[-1]
    return [Doc(url=f'{cluster}/public/reports/querydata', name=f'mro-powerbi-{last.replace("/", "-")}.json',
                county='mro', label=info['exploration']['report'].get('displayName', 'Karakterer'),
                kind='json', landing=ctx.url('landing', SOURCE['landing']), body=q.body,
                meta={'embed': embed, 'rows': len(rows), 'years': f'{years[0]}–{last}',
                      'model_last_refresh': info['models'][0].get('LastRefreshTime', ''),
                      'query': f'{ENTITY}: {", ".join(COLUMNS)}; min NedrekarV2, sum Gjennomkar'})]
