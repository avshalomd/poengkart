"""Rogaland: the rolling three-year matrix on vilbli («Poenggrense ved inntak
til videregående skoler 2026-2027», attachment «Poenggrenser Rogaland 2026.pdf»),
2. inntak, Vg1–Vg3; reissued in place when the county corrects a cell (three
prints of the 2024–2026 edition in September 2026).
"""
import datetime
import re

from live import vilbli
from live.core import Doc, Unhealthy

SOURCE = {
    'id': 'rogaland', 'county': 'rogaland', 'publisher': 'Rogaland fylkeskommune',
    'landing': vilbli.PAGE.format(county='rogaland'),
    # vilbli.no answers GitHub's runners with an AWS WAF CAPTCHA (www, 405) and a
    # CloudFront block (webservice, 403), tested 28 Sept 2026; it serves the Claude
    # cloud environment's attachments host, so this source runs there
    # (routines/live-vilbli.md) and GitHub processes what it pushes
    'runner': 'cloud',
    # the edition has come in the first half of September, corrections after
    'season': [(8, 1, 10, 31)],
}
ARTICLE = '041510'
HEADER = re.compile(r'Programområde\s+navn\s+(20\d\d)\s+(20\d\d)\s+(20\d\d)')


def _name(ctx, fname, url, landing, label):
    r = ctx.need(ctx.get(url), fname)
    text, pages = vilbli.first_page(r.body)
    m = HEADER.search(text)
    if not m:
        raise Unhealthy(f'{fname}: page 1 has no «Programområde navn YYYY YYYY YYYY» header')
    a, b = int(m.group(1)), int(m.group(3))
    return Doc(url=url, name=f'poenggrenser-rogaland-{a}-{b}-official.pdf', county='rogaland',
               label=label or fname, kind='pdf', landing=landing, body=r.body,
               meta={'years': f'{a}–{b}', 'pages': pages, 'round': '2. inntak (stated on vilbli)'})


def discover(ctx):
    try:
        blk = vilbli.block(ctx, 'rogaland')
    except Unhealthy as e:
        blk, why = None, str(e)
    else:
        why = 'no county block on the page'
    if blk and blk['attachments']:
        if blk['article'] != ctx.url('article', ARTICLE):
            ctx.heal('article', blk['article'], 'the county block now carries this article number')
        return [_name(ctx, f, u, blk['page'], f'{blk["heading"]} — {f}') for f, u in blk['attachments']]
    # self-heal without the page: the names the county has used
    y = datetime.date.today().year
    guesses = [f'Poenggrenser Rogaland {n}.pdf' for n in (y + 1, y, y - 1)] + \
              [f'Poenggrenser {n - 2}-{n}.pdf' for n in (y + 1, y)] + \
              [f'Poenggrense {n - 2}-{n}.pdf' for n in (y + 1, y)]
    hits = vilbli.probe(ctx, ctx.url('article', ARTICLE), guesses)
    if not hits:
        raise Unhealthy(f'vilbli Rogaland: {why}, and none of {len(guesses)} known file names '
                        f'is served under article {ctx.url("article", ARTICLE)}')
    ctx.note(f'vilbli page unusable ({why}); found {", ".join(f for f, _ in hits)} by name')
    return [_name(ctx, f, u, SOURCE['landing'], f) for f, u in hits[:1]]
