"""The pieces every live scraper shares: the document it reports, the context
it runs in, and the self-healing link search.

A scraper (tools/live/sources/<id>.py) has a SOURCE dict and a discover(ctx)
that returns the documents the county serves right now, as Doc objects. It
fetches through ctx, so every request is logged and cached for the run, and
it reads its URLs through ctx.url(), so a URL the scraper had to find again
(ctx.heal) is where it looks first next time.
"""
import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

from live import net


class Unhealthy(Exception):
    """The source answered, but not with what the scraper expects: a page
    without its tables, a link list with no poenggrense document, a PDF whose
    header names no school year. The run keeps what it had and says why."""


@dataclass
class Doc:
    url: str                 # where the document is served
    name: str                # its file name under sources/<county>/
    county: str              # the sources/ folder
    label: str = ''          # how the county presents it: link text, h1, heading
    kind: str = ''           # pdf, html, xlsx, json (default: from the name)
    landing: str = ''        # the page that links it
    body: bytes = None       # set when discover() already holds the bytes
    alert: bool = False      # a sentinel find: report it, never capture it
    meta: dict = field(default_factory=dict)   # anything the provenance should name


def _clean(url):
    """`url` without a default port or a fragment (mrfylke.no writes its own
    links as https://mrfylke.no:443/…)."""
    p = urlparse(url)
    host = p.netloc
    if (p.scheme, host.rsplit(':', 1)[-1]) in (('https', '443'), ('http', '80')):
        host = host.rsplit(':', 1)[0]
    return p._replace(netloc=host, fragment='').geturl()


class Ctx:
    def __init__(self, source_id, state):
        self.id = source_id
        self.state = state            # this source's slice of tools/live/state.json
        self.log = []                 # (method, url, status) per request
        self.notes = []
        self._cache = {}

    def get(self, url, **kw):
        key = (url, kw.get('method', 'GET'), kw.get('data'))
        if key not in self._cache:
            r = net.fetch(url, **kw)
            self.log.append((kw.get('method', 'GET'), url, r.status))
            self._cache[key] = r
        return self._cache[key]

    def note(self, msg):
        self.notes.append(msg)

    def url(self, key, default):
        """The URL for `key`: the healed one if the scraper had to find it again."""
        return self.state.get('urls', {}).get(key, default)

    def heal(self, key, new, why):
        old = self.url(key, None)
        if new == old:
            return
        self.state.setdefault('urls', {})[key] = new
        self.state.setdefault('healed', []).append({'key': key, 'from': old, 'to': new, 'why': why})
        self.note(f'healed {key}: {old} -> {new} ({why})')

    def soup(self, resp):
        from bs4 import BeautifulSoup
        return BeautifulSoup(resp.body, 'lxml')

    def links(self, resp):
        """[(text, absolute url)] of every <a href> on a page."""
        base = resp.final_url or resp.url
        return [(re.sub(r'\s+', ' ', a.get_text(' ')).strip(), _clean(urljoin(base, a['href'])))
                for a in self.soup(resp).find_all('a', href=True)]

    def search(self, start, target, follow=None, max_pages=25, every=False):
        """Self-healing link search: from the `start` pages, walk the same
        host's links whose text or URL matches `follow`, most promising first
        (the more of `follow`'s terms a link names, the sooner it is read), and
        return every link on the first page that has any whose text or URL
        matches `target`, as (text, url, page it was on). This is how a scraper
        finds its document again when a county moves a page (Buskerud
        publishes each year at a new slug, Møre og Romsdal moved its link in
        2026). With every=True it reads up to `max_pages` pages and returns
        every match, once per URL (the sentinel's inventory)."""
        host = urlparse(_clean(start[0])).netloc
        order = 0
        queue = [(-99, i, _clean(u)) for i, u in enumerate(start)]
        seen, hits = set(), {}
        while queue and len(seen) < max_pages:
            queue.sort()
            _, _, page = queue.pop(0)
            if page in seen:
                continue
            seen.add(page)
            r = self.get(page, retries=1)
            if not r.ok or 'html' not in r.content_type:
                continue
            found = []
            for text, href in self.links(r):
                hay = f'{text} {href}'
                if re.search(target, hay, re.I):
                    found.append((text, href, page))
                elif follow and urlparse(href).netloc == host and href not in seen \
                        and not re.search(r'\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|zip)$', href, re.I):
                    terms = {t.lower() for t in re.findall(follow, hay, re.I)}
                    if terms:
                        order += 1
                        queue.append((-len(terms), order, href))
            if found and not every:
                return found
            for f in found:
                hits.setdefault(f[1], f)
        return list(hits.values())

    def need(self, resp, what):
        """resp, or Unhealthy saying which fetch failed and how."""
        if not resp.ok:
            raise Unhealthy(f'{what}: HTTP {resp.status} from {resp.url}'
                            + (f' ({resp.error})' if resp.error else ''))
        return resp
