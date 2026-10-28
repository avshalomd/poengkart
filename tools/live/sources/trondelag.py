"""Trøndelag: one PDF per inntaksregion on vilbli («Laveste inntatt 2526
Fosen.pdf»), «Laveste poengsum vg1 skoleåret 20252026», published in early
December.

From 2026/27 (seen 28 Oct 2026) each region comes twice: «Laveste inntatt
2026-2027 Fosen tabell.pdf», the wide table with Grep codes that
tools/extractors/trondelag.py reads, and «Laveste inntatt 2026-2027
Fosen.pdf», a long list of the same figures (Trondheim's list names no codes).
The table is captured; its list twin is left on vilbli.
"""
import datetime
import re
import unicodedata

from live import vilbli
from live.core import Doc, Unhealthy

SOURCE = {
    'id': 'trondelag', 'county': 'trondelag', 'publisher': 'Trøndelag fylkeskommune',
    'landing': vilbli.PAGE.format(county='trondelag'),
    # vilbli.no answers GitHub's runners with an AWS WAF CAPTCHA (www, 405) and a
    # CloudFront block (webservice, 403), tested 28 Sept 2026; it serves the Claude
    # cloud environment's attachments host, so this source runs there
    # (routines/live-vilbli.md) and GitHub processes what it pushes
    'runner': 'cloud',
    'season': [(11, 1, 12, 31), (1, 1, 1, 31), (7, 1, 9, 30)],
}
ARTICLE = '041562'
REGIONS = ['Fosen', 'Innherred-Værnes', 'Namdal', 'Trøndelag Sør', 'Trondheim']
# «2526 Fosen.pdf» up to 2025/26, «2026-2027 Fosen tabell.pdf» from 2026/27
NAME = re.compile(r'(?:20)?(\d\d)-?(?:20)?(\d\d)\s+(.+?)(\s+tabell)?\.pdf$', re.I)
YEAR = re.compile(r'skoleåret\s*(20\d\d)\s*(20\d\d)', re.I)


def slug(region):
    s = region.lower().replace('æ', 'ae').replace('ø', 'o').replace('å', 'a')
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def _doc(ctx, fname, url, landing):
    m = NAME.search(fname)
    if not m:
        return Doc(url=url, name=fname, county='trondelag', label=fname, landing=landing, alert=True)
    r = ctx.need(ctx.get(url), fname)
    text, pages = vilbli.first_page(r.body)
    y = YEAR.search(text)
    if not y or int(y.group(2)) != int(y.group(1)) + 1:
        raise Unhealthy(f'{fname}: page 1 names no «skoleåret YYYYYYYY»')
    year = int(y.group(1))
    if year % 100 != int(m.group(1)):
        raise Unhealthy(f'{fname}: the name says {m.group(1)}{m.group(2)}, page 1 says {y.group(0)}')
    region = next((x for x in REGIONS if x.lower() == m.group(3).lower()), m.group(3))
    return Doc(url=url, name=f'trondelag_{year}-{str(year + 1)[2:]}_{slug(region)}.pdf',
               county='trondelag', label=fname, kind='pdf', landing=landing, body=r.body,
               meta={'school_year': f'{year}/{year + 1}', 'region': region, 'pages': pages})


def _tables(files):
    """files without the list twin of a region's table: «… Fosen.pdf» is
    dropped when «… Fosen tabell.pdf» is there"""
    tables = {(m.group(1), m.group(2), m.group(3).lower())
              for f, _ in files if (m := NAME.search(f)) and m.group(4)}
    return [(f, u) for f, u in files
            if not ((m := NAME.search(f)) and not m.group(4)
                    and (m.group(1), m.group(2), m.group(3).lower()) in tables)]


def discover(ctx):
    try:
        blk = vilbli.block(ctx, 'trondelag')
        why = 'no attachments in the county block'
    except Unhealthy as e:
        blk, why = None, str(e)
    if blk and blk['attachments']:
        return [_doc(ctx, f, u, blk['page']) for f, u in _tables(blk['attachments'])]
    y = datetime.date.today().year
    guesses = [g for n in (y, y - 1) for r in REGIONS
               for g in (f'Laveste inntatt {n}-{n + 1} {r} tabell.pdf',
                         f'Laveste inntatt {n % 100:02d}{(n + 1) % 100:02d} {r}.pdf')]
    hits = vilbli.probe(ctx, ctx.url('article', ARTICLE), guesses)
    if not hits:
        raise Unhealthy(f'vilbli Trøndelag: {why}, and none of the region files is served')
    ctx.note(f'vilbli page unusable ({why}); found {len(hits)} region files by name')
    return [_doc(ctx, f, u, SOURCE['landing']) for f, u in _tables(hits)]
