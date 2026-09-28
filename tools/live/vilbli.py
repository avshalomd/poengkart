"""vilbli.no's «Poengsum og karakterer» page, which carries each county's own
information block and its attachments.

The page is a Next.js app; the county block («Informasjon fra Rogaland», its
article number in `data-nr`) and its «Vedlegg» list are in the server-rendered
HTML of /nb/<county>/a/poengsum-og-karakterer-6. Attachments are served only
from https://webservice.vilbli.no/Data/Artikkelvedlegg/<article>/<file>
(www.vilbli.no/Data/... answers 404, and a missing file answers 504).

When the page cannot be read (www.vilbli.no sits behind a WAF that sometimes
challenges data-centre addresses) the scrapers fall back to asking
webservice.vilbli.no directly for the file names the county has used, for
this year and the next: the self-healing path that needs no page at all.
"""
import re
from urllib.parse import unquote_plus

from live.core import Unhealthy

PAGE = 'https://www.vilbli.no/nb/{county}/a/poengsum-og-karakterer-6'
FILES = 'https://webservice.vilbli.no/Data/Artikkelvedlegg/{article}/{name}'

#: vilbli's county slugs and the sources/ folder for each
COUNTIES = {
    'agder': 'agder', 'akershus': 'akershus', 'buskerud': 'buskerud', 'finnmark': 'finnmark',
    'innlandet': 'innlandet', 'more-og-romsdal': 'mro', 'nordland': 'nordland', 'oslo': 'oslo',
    'rogaland': 'rogaland', 'telemark': 'telemark', 'troms': 'troms', 'trondelag': 'trondelag',
    'vestfold': 'vestfold', 'vestland': 'vestland', 'ostfold': 'ostfold',
}

BLOCK = re.compile(r'data-nr="(\d+)">Informasjon fra(?:<!-- -->|\s)*([^<]+)</h2>(.*?)</main>', re.S)
ATTACH = re.compile(r'href="(https://webservice\.vilbli\.no/Data/Artikkelvedlegg/(\d+)/([^"]+))"')


def block(ctx, county):
    """{'article', 'county', 'heading', 'attachments': [(file name, url)], 'page'}
    for the county's own block, or None when the page has none; Unhealthy when
    the page itself cannot be read."""
    page = PAGE.format(county=county)
    r = ctx.get(page)
    if not r.ok:
        raise Unhealthy(f'vilbli {county}: HTTP {r.status}')
    html = r.text()
    if 'Poengsum og karakterer' not in html:
        raise Unhealthy(f'vilbli {county}: the page is not «Poengsum og karakterer» '
                        f'(a WAF challenge?) — {len(html)} bytes')
    m = BLOCK.search(html)
    if not m:
        return None
    article, name, body = m.groups()
    heads = [re.sub(r'<[^>]+>', '', h).strip() for h in re.findall(r'<h3>(.*?)</h3>', body, re.S)]
    atts = [(unquote_plus(f), u) for u, a, f in ATTACH.findall(body) if a == article]
    return {'article': article, 'county': name.strip(), 'heading': heads[0] if heads else '',
            'attachments': atts, 'page': page}


def probe(ctx, article, names):
    """[(file name, url)] of the guessed names webservice.vilbli.no serves as PDFs."""
    out = []
    for n in names:
        url = FILES.format(article=article, name=n.replace(' ', '+'))
        r = ctx.get(url, retries=0)
        if r.ok and r.body[:4] == b'%PDF':
            out.append((n, url))
    return out


def first_page(body):
    import io
    import pdfplumber
    with pdfplumber.open(io.BytesIO(body)) as pdf:
        return pdf.pages[0].extract_text() or '', len(pdf.pages)
