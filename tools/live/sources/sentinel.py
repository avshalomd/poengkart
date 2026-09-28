"""The seven counties that publish no poenggrenser (Agder, Finnmark, Nordland,
Telemark, Troms, Vestfold, Østfold): would we notice if one started?

Once a week the sentinel walks each county's own site from its front page,
through the links about school, intake and upper-secondary education, and
lists every link that names a poenggrense, a karaktergrense, the lowest
admitted points or intake points. The first run records that list as the
county's baseline (pages that explain the concept, news about intake); a later
run reports every link not in the baseline as an ALERT, which opens a GitHub
issue for a person. Nothing it finds is captured: no extractor reads these
counties yet.

(vilbli.no, where three counties do publish, cannot be read from any runner
the watch has: its page answers with a CAPTCHA. The county sites can.)
"""
from live.core import Doc, Unhealthy

SOURCE = {
    'id': 'sentinel', 'county': None, 'publisher': 'the counties without poenggrenser',
    'landing': 'the seven county sites',
    'season': [],          # weekly all year (schedule.py)
    'min_docs': 0,
}
SITES = {
    'agder': 'https://agderfk.no/',
    'finnmark': 'https://www.ffk.no/',
    'nordland': 'https://www.nfk.no/',
    'telemark': 'https://www.telemarkfylke.no/',
    'troms': 'https://www.tromsfylke.no/',
    'vestfold': 'https://www.vestfoldfylke.no/',
    'ostfold': 'https://ofk.no/',
}
TARGET = r'poenggrens|karaktergrens|laveste\s+(?:inntatt|poeng)|inntakspoeng|poengsum\s+ved\s+inntak'
FOLLOW = (r'skole|opplaring|opplæring|utdanning|inntak|videregaende|vidaregaande|'
          r'videregående|søke|soke|elev|skoleplass')
PAGES = 30


def discover(ctx):
    docs, dead = [], []
    base = ctx.state.setdefault('baseline', {})
    for county, home in SITES.items():
        r = ctx.get(home, retries=1)
        if not r.ok:
            dead.append(f'{county}: HTTP {r.status}')
            continue
        found = ctx.search([home], TARGET, follow=FOLLOW, max_pages=PAGES, every=True)
        urls = sorted({h for _, h, _ in found})
        if county not in base:
            base[county] = urls
            ctx.note(f'{county}: baseline of {len(urls)} links recorded')
            continue
        for text, href, page in found:
            if href not in base[county]:
                docs.append(Doc(url=href, name=href.rsplit('/', 1)[-1] or 'page', county=county,
                                alert=True, landing=page, label=f'{county}: «{text[:120]}» on {page}'))
    if len(dead) > len(SITES) // 2:
        raise Unhealthy(f'{len(dead)} of {len(SITES)} county sites unreachable: {"; ".join(dead)}')
    for d in dead:
        ctx.note(d)
    return docs
