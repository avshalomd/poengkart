"""Vestland: the county's «Nedre poenggrense» page, one PDF per school year
and inntak («Nedre poenggrense etter 3.inntak. 2026/2027»), 1. inntak in July
and 3. inntak in August; a corrected reprint replaces the link in place.
"""
import re

from live.core import Doc, Unhealthy

SOURCE = {
    'id': 'vestland', 'county': 'vestland', 'publisher': 'Vestland fylkeskommune',
    'landing': 'https://www.vestlandfylke.no/utdanning-og-karriere/elev/soknad-inntak/test-poenggrenser/',
    'season': [(6, 15, 9, 30)],
}
PARENT = 'https://www.vestlandfylke.no/utdanning-og-karriere/elev/soknad-inntak/'
LABEL = re.compile(r'(\d)\.\s*inntak.*?(20\d\d)\s*/\s*(20\d\d)', re.I)
#: the newest school year and the one before are watched; older links are history
WATCH_YEARS = 2


def discover(ctx):
    landing = ctx.url('landing', SOURCE['landing'])
    r = ctx.get(landing)
    pdfs = [(t, h) for t, h in ctx.links(r) if h.lower().split('?')[0].endswith('.pdf')] if r.ok else []
    if not pdfs:
        for text, href, page in ctx.search([PARENT], r'poenggrense', follow=r'inntak|soknad'):
            if href.lower().endswith('.pdf'):
                continue
            r2 = ctx.get(href)
            got = [(t, h) for t, h in ctx.links(r2) if h.lower().endswith('.pdf')] if r2.ok else []
            if got:
                ctx.heal('landing', href, f'{landing}: HTTP {r.status}, no PDFs; found «{text}» on {page}')
                landing, pdfs = href, got
                break
    if not pdfs:
        raise Unhealthy(f'no poenggrense PDF linked from {landing}')
    docs = []
    for text, href in pdfs:
        m = LABEL.search(text)
        if not m or int(m.group(3)) != int(m.group(2)) + 1:
            continue
        rnd, y = m.group(1), int(m.group(2))
        docs.append(Doc(url=href, name=f'vestland_{y}-{str(y + 1)[2:]}_{rnd}inntak.pdf',
                        county='vestland', label=text, kind='pdf', landing=landing,
                        meta={'school_year': f'{y}/{y + 1}', 'round': f'{rnd}. inntak'}))
    if not docs:
        raise Unhealthy(f'{len(pdfs)} PDFs on {landing}, none labelled «N. inntak YYYY/YYYY»')
    newest = max(int(d.meta['school_year'][:4]) for d in docs)
    return [d for d in docs if int(d.meta['school_year'][:4]) > newest - WATCH_YEARS]
