"""Innlandet: the rolling three-year matrix on vilbli («Poenggrense 2024-2026.pdf»),
«Poenggrense for sist inntatte søker med ungdomsrett pr. 2.inntak», Vg1–Vg3.
"""
import datetime
import re

from live import vilbli
from live.core import Doc, Unhealthy

SOURCE = {
    'id': 'innlandet', 'county': 'innlandet', 'publisher': 'Innlandet fylkeskommune',
    'landing': vilbli.PAGE.format(county='innlandet'),
    'season': [(8, 1, 10, 31)],
}
ARTICLE = '041513'
SPAN = re.compile(r'(20\d\d)\s*-\s*(20\d\d)')
ROUND = re.compile(r'pr\.?\s*(\d)\.\s*inntak', re.I)


def _doc(ctx, fname, url, landing, label):
    m = SPAN.search(fname)
    if not m:
        raise Unhealthy(f'{fname}: no «YYYY-YYYY» span in the attachment name')
    r = ctx.need(ctx.get(url), fname)
    text, pages = vilbli.first_page(r.body)
    rnd = ROUND.search(text)
    if not rnd:
        raise Unhealthy(f'{fname}: page 1 states no «pr. N.inntak»')
    a, b = m.groups()
    return Doc(url=url, name=f'innlandet-{a}-{b}-{rnd.group(1)}inntak.pdf', county='innlandet',
               label=label, kind='pdf', landing=landing, body=r.body,
               meta={'years': f'{a}–{b}', 'pages': pages, 'round': f'{rnd.group(1)}. inntak (stated)'})


def discover(ctx):
    try:
        blk = vilbli.block(ctx, 'innlandet')
        why = 'no attachments in the county block'
    except Unhealthy as e:
        blk, why = None, str(e)
    if blk and blk['attachments']:
        docs = []
        for f, u in blk['attachments']:
            if SPAN.search(f):
                docs.append(_doc(ctx, f, u, blk['page'], f))
            else:   # another kind of attachment: say so, capture nothing
                docs.append(Doc(url=u, name=f, county='innlandet', label=f, landing=blk['page'], alert=True))
        return docs
    y = datetime.date.today().year
    guesses = [f'Poenggrense {n - 2}-{n}.pdf' for n in (y + 1, y)]
    hits = vilbli.probe(ctx, ctx.url('article', ARTICLE), guesses)
    if not hits:
        raise Unhealthy(f'vilbli Innlandet: {why}, and neither {guesses} is served')
    ctx.note(f'vilbli page unusable ({why}); found {hits[0][0]} by name')
    return [_doc(ctx, f, u, SOURCE['landing'], f) for f, u in hits[:1]]
