"""Buskerud: «Nedre poenggrense for inntak Buskerud YYYY-YYYY», a new page
(a new slug) each year, linked from the county's «Søke skoleplass» page.

The scraper never guesses the slug: it reads the parent's links and takes the
newest school year named there, and if the parent stops linking one it
searches the section for any page whose link names a poenggrense.
"""
import re

from live.core import Doc, Unhealthy

SOURCE = {
    'id': 'buskerud', 'county': 'buskerud', 'publisher': 'Buskerud fylkeskommune',
    'landing': 'https://bfk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/',
    'season': [(7, 1, 12, 31)],
}
LINK = r'poenggrense'
YEARS = re.compile(r'(20\d\d)\s*[-–/]\s*(20\d\d)')


def discover(ctx):
    parent = ctx.url('landing', SOURCE['landing'])
    r = ctx.get(parent)
    found = []
    if r.ok:
        found = [(t, h, parent) for t, h in ctx.links(r) if re.search(LINK, f'{t} {h}', re.I)]
    if not found:
        found = ctx.search([parent, 'https://bfk.no/tjenester/skole-og-opplaring/'], LINK,
                           follow=r'skoleplass|inntak|opplaring-i-skole')
        if found:
            ctx.heal('landing', found[0][2], f'{parent} lists no poenggrense page '
                     f'(HTTP {r.status}); found «{found[0][0]}» by searching the section')
    dated = []
    for text, href, page in found:
        m = YEARS.search(f'{text} {href}')
        if m and int(m.group(2)) == int(m.group(1)) + 1:
            dated.append((int(m.group(1)), text, href, page))
    if not dated:
        raise Unhealthy(f'no link naming a poenggrense and a school year on {parent}')
    year, text, href, page = max(dated)
    p = ctx.need(ctx.get(href), f'«{text}»')
    if p.text().count('<table') < 1:
        raise Unhealthy(f'{href} has no table')
    return [Doc(url=href, name=f'buskerud-{year}-{year + 1}.html', county='buskerud',
                label=text, kind='html', landing=page, body=p.body,
                meta={'school_year': f'{year}/{year + 1}'})]
