"""Akershus: the county's «Poenggrenser» page, overwritten in place each year.

The page prints 1. and 2. inntak side by side for one school year («skoleåret
2025–26, etter henholdsvis 1. og 2. inntak») as some 58 tables. When the next
year replaces it, the old year exists nowhere else, so the capture has to
happen while it is live.

Later layouts drop that sentence and print only per-school tables, each
captioned with the inntak year («<skole> vgs. [YYYY]»); inntak YYYY is
skoleåret YYYY–YY+1.
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
CAPTION_YEAR = re.compile(r'\[(20\d\d)\]\s*$')


def _caption_year(soup):
    """The inntak year every table caption ends with, or None if they disagree."""
    years = {m.group(1) for c in soup.find_all('caption')
             if (m := CAPTION_YEAR.search(c.get_text(' ', strip=True)))}
    return int(years.pop()) if len(years) == 1 else None


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
    soup = ctx.soup(r)
    m = YEAR.search(soup.get_text(' '))
    if m:
        y, label = int(m.group(1)), re.sub(r'\s+', ' ', m.group(0))
    elif (y := _caption_year(soup)):
        label = f'Poenggrenser [{y}]'
    else:
        raise Unhealthy('the page names no «skoleåret YYYY–YY» and its tables no one «[YYYY]»')
    return [Doc(url=landing, name=f'akershus-{y}-{y + 1}.html', county='akershus',
                label=label, kind='html', landing=landing, body=r.body,
                meta={'school_year': f'{y}/{y + 1}'})]
