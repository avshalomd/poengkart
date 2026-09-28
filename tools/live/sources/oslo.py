"""Oslo: «Poengtabeller for videregående skoler i Oslo», an HTML page since
2026 (wide PDFs before), one table per municipal school, Vg1 after 1. inntak,
overwritten each summer. The year is the page's own «inntaksrunde i YYYY».
"""
import re

from live.core import Doc, Unhealthy

SOURCE = {
    'id': 'oslo', 'county': 'oslo', 'publisher': 'Oslo kommune, Utdanningsetaten',
    'landing': 'https://www.oslo.kommune.no/skole-og-utdanning/videregaende-skole/soke-videregaende-skole/poengtabeller-for-videregaende-skoler-i-oslo/',
    # 1. inntak results come in mid-July
    'season': [(6, 15, 9, 30)],
}
PARENT = 'https://www.oslo.kommune.no/skole-og-utdanning/videregaende-skole/soke-videregaende-skole/'
YEAR = re.compile(r'inntaksrunde(?:n)?\s+i\s+(20\d\d)|(?:skoleåret|våren|sommeren)\s+(20\d\d)', re.I)


def discover(ctx):
    landing = ctx.url('landing', SOURCE['landing'])
    r = ctx.get(landing)
    if not r.ok or r.text().count('<table') < 5:
        hits = ctx.search([PARENT], r'poengtabell|poenggrense', follow=r'videregaende|soke')
        for text, href, page in hits:
            r2 = ctx.get(href)
            if r2.ok and r2.text().count('<table') >= 5:
                ctx.heal('landing', href, f'{landing}: HTTP {r.status}; found «{text}» on {page}')
                landing, r = href, r2
                break
    ctx.need(r, 'the poengtabeller page')
    tables = r.text().count('<table')
    if tables < 5:
        raise Unhealthy(f'{tables} tables on {landing}, expected one per school')
    m = YEAR.search(ctx.soup(r).get_text(' '))
    if not m:
        raise Unhealthy('the page names no «inntaksrunde i YYYY»')
    y = int(m.group(1) or m.group(2))
    return [Doc(url=landing, name=f'oslo-{y}.html', county='oslo', label=m.group(0),
                kind='html', landing=landing, body=r.body, meta={'school_year': f'{y}/{y + 1}'})]
