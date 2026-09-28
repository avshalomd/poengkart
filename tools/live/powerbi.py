"""Read a Power BI «Publish to web» report the way its own viewer does.

Møre og Romsdal publishes its poenggrenser only as a public Power BI report
(«Karakterstatistikk for videregående skoler i Møre og Romsdal»), embedded in
the county's «Poenggrense» page. Publish-to-web has no download, but the
viewer itself reads the data over a public, keyless API: the embed link's `r`
parameter is base64 JSON whose `k` is the report's resource key, and

  GET  {cluster}/public/reports/{k}/modelsAndExploration   the model and the pages
  POST {cluster}/public/reports/querydata?synchronous=true  a semantic query

answer anyone who sends the key in `X-PowerBI-ResourceKey`. The answer is in
Power BI's compressed «DSR» shape: each row lists only the values that differ
from the row before (bitmask `R`), nulls are a second bitmask (`Ø`), and text
columns are indexes into `ValueDicts`. rows() undoes that.
"""
import base64
import json

#: The clusters a public report can live on; the key is looked up on each in
#: turn and the first that knows it answers (a wrong one says 401).
CLUSTERS = ['https://wabi-west-europe-api.analysis.windows.net',
            'https://wabi-north-europe-api.analysis.windows.net',
            'https://wabi-west-europe-d-primary-api.analysis.windows.net',
            'https://wabi-north-europe-k-primary-api.analysis.windows.net']


def resource_key(embed_url):
    """The `k` of a https://app.powerbi.com/view?r=... link."""
    r = embed_url.split('r=', 1)[1].split('&', 1)[0]
    r += '=' * (-len(r) % 4)
    return json.loads(base64.b64decode(r))['k']


def query_body(model, entity, columns, measures=(), count=30000):
    """A querydata body selecting `columns` and aggregated `measures`
    [(column, function)] of `entity`, grouped by every column. Function codes
    are Power BI's: 0 sum, 3 min, 4 max."""
    src = {'SourceRef': {'Source': 's'}}
    sel = [{'Column': {'Expression': src, 'Property': c}, 'Name': f'{entity}.{c}'} for c in columns]
    sel += [{'Aggregation': {'Expression': {'Column': {'Expression': src, 'Property': c}},
                             'Function': f}, 'Name': c} for c, f in measures]
    return {'version': '1.0.0', 'cancelQueries': [], 'modelId': model['id'], 'queries': [{
        'QueryId': '',
        'ApplicationContext': {'DatasetId': model['dbName'],
                               'Sources': [{'ReportId': model['report'], 'VisualId': 'poengkart'}]},
        'Query': {'Commands': [{'SemanticQueryDataShapeCommand': {
            'Query': {'Version': 2, 'From': [{'Name': 's', 'Entity': entity, 'Type': 0}],
                      'Select': sel},
            'Binding': {'Primary': {'Groupings': [{'Projections': list(range(len(sel)))}]},
                        'DataReduction': {'DataVolume': 4, 'Primary': {'Window': {'Count': count}}},
                        'Version': 1}}}]}}]}


class Incomplete(Exception):
    """The answer is an error, or it was cut short (more rows than the window)."""


def rows(answer):
    """(column names, [row]) of a querydata answer; raises Incomplete."""
    try:
        data = answer['results'][0]['result']['data']
    except (KeyError, IndexError, TypeError):
        raise Incomplete(f'not a query result: {json.dumps(answer)[:300]}')
    names = [s['Name'] for s in data['descriptor']['Select']]
    ds = data['dsr']['DS'][0]
    if ds.get('IC') is False or ds.get('RT'):
        raise Incomplete('the result was cut short (a restart token is set)')
    dicts = ds.get('ValueDicts', {})
    out, prev, schema = [], None, None
    for ph in ds['PH']:
        for key, recs in ph.items():
            if not key.startswith('DM'):
                continue
            for rec in recs:
                if 'S' in rec:
                    schema = rec['S']
                vals, it = [], iter(rec.get('C', []))
                rep, nul = rec.get('R', 0), rec.get('Ø', 0)
                for i, col in enumerate(schema):
                    if rep >> i & 1:
                        vals.append(prev[i])
                    elif nul >> i & 1:
                        vals.append(None)
                    else:
                        v = next(it)
                        if 'DN' in col and isinstance(v, int):
                            v = dicts[col['DN']][v]
                        vals.append(v)
                prev = vals
                out.append(vals)
    return names, out
