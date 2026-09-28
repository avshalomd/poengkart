"""Akershus: the county's «Poenggrenser» page, overwritten in place each year.

The page prints 1. and 2. inntak side by side for one school year («skoleåret
2025–26, etter henholdsvis 1. og 2. inntak») as some 58 tables. When the next
year replaces it, the old year exists nowhere else, so the capture has to
happen while it is live.
"""
import re

from live.core import Doc, Unhealthy

SOURCE = {
    'id': 'akershus', 'county': 'akershus', 'publisher': 'Akershus fylkeskommune',
    'landing': 'https://afk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/poenggrenser.222835.aspx',
    # the county page has come in November; the e-mailed extracts earlier
    'season': [(7, 1, 12, 31)],
}
PARENT = 'https://afk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/'
YEAR = re.compile(r'skoleåret\s+(20\d\d)\s*[–—-]\s*(\d{2,4})', re.I)


def _page(ctx, url):
    r = ctx.get(url)
    if not r.ok:
        return None, f'HTTP {r.status}'
    html = r.text()
    if html.count('<table') < 10:
        return None, f'{html.count("<table")} tables, expected 10 or more'
    return r, ''


def discover(ctx):
    landing = ctx.url('landing', SOURCE['landing'])
    r, why = _page(ctx, landing)
    if r is None:
        # the page moved: look for it from the «Søke skoleplass» section
        for text, href, page in ctx.search([PARENT], r'poenggrense', follow=r'skoleplass|inntak'):
            r2, _ = _page(ctx, href)
            if r2 is not None:
                ctx.heal('landing', href, f'{landing}: {why}; found «{text}» on {page}')
                landing, r = href, r2
                break
    if r is None:
        raise Unhealthy(f'the poenggrense page is gone ({landing}: {why}) and no page '
                        f'linked from {PARENT} has the tables')
    m = YEAR.search(ctx.soup(r).get_text(' '))
    if not m:
        raise Unhealthy('the page names no «skoleåret YYYY–YY»')
    y = int(m.group(1))
    return [Doc(url=landing, name=f'akershus-{y}-{y + 1}.html', county='akershus',
                label=re.sub(r'\s+', ' ', m.group(0)), kind='html', landing=landing, body=r.body,
                meta={'school_year': f'{y}/{y + 1}'})]
