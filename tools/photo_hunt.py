#!/usr/bin/env python3
"""Hunt a building photo for every school that has none, nationally.

Why this exists: enrich.py's photo matching was written for Rogaland, QA found
it returns the wrong school on a name collision and the *nearest* Commons photo
rather than the school's, and it was then left out of refresh.py — so the 171
schools added in the national expansion were never photographed at all.

This module only *proposes*. Every candidate is downloaded and measured, and a
human looks at the pixels (tools/photo_sheets.py) before anything is accepted.
Two things it must never do on its own: publish a photo of the wrong school,
or publish identifiable pupils.

Tiers, best first:
  1. wikipedia — free licence with real attribution, accepted only when the
     article's own coordinates are within 3 km of the school. That coordinate
     check is what kills the same-name-other-county defect. NOTE: the summary
     API appends ?utm_source=... to image URLs and upload.wikimedia.org 403s
     the whole request when it is present — strip it, then ask the Commons API
     for a served thumbnail width plus Artist/licence.
  2. site — the school's own website. og:image is usually the newest *news
     article* (stock photos, class trips, an invitation card), so images are
     scored on filename and alt text and the "om skolen" pages are crawled too.
  3. commons — geosearch inside 250 m AND a filename token from the school
     name; nearby is not the same as of-the-school.
"""

import concurrent.futures as cf
import json
import math
import os
import re
import sys
import threading
import time
import urllib.parse
import urllib.request

from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'web', 'data', 'schools.json')
STAGE = os.environ.get('PHOTO_STAGE', '/private/tmp/claude-501/'
                       '-Users-avshalom-projects/b6cc5fd7-b026-44c5-803f-f7c99fea7cf5/'
                       'scratchpad/photohunt')
UA = {'User-Agent': 'poengkart/0.1 (school photo lookup)', 'Accept-Encoding': 'identity'}

# filename/alt tokens that suggest a building, and ones that suggest anything but
GOOD = ('fasade', 'fasaden', 'bygg', 'bygget', 'bygning', 'hovedinngang',
        'inngang', 'campus', 'anlegg', 'flyfoto', 'luftfoto', 'drone', 'dji',
        'skolegard', 'skolegård', 'skulegard', 'uteomrade', 'uteområde',
        'oversikt', 'front', 'forside', 'framside', 'skolen', 'skulen',
        'skole', 'skule', 'vgs', 'utsiden', 'ute', 'hovedbygg', 'nybygg',
        'sett-fra', 'exterior', 'eksterior')
BAD = ('logo', 'ikon', 'icon', 'favicon', 'sprite', 'placeholder', 'avatar',
       'illustrasjonsfoto', 'illustrasjon', 'unsplash', 'shutterstock',
       'istock', 'pexels', 'designer-', 'elev', 'elevar', 'klasse', 'russ',
       'avslutning', 'portrett', 'ansatt', 'rektor', 'larer', 'lærer',
       'undervisning', 'praksis', 'arrangement', 'besok', 'besøk', 'tur',
       'konsert', 'messe', 'workshop', 'jente', 'gutt', 'barn', 'person',
       'gruppe', 'apple-touch', 'facebook', 'instagram', 'vipps')
ABOUT = re.compile(r'om[-_ ]?(skolen|skulen|oss)|skolen[-_ ]v[åa]r|skulen[-_ ]v[åa]r'
                   r'|om[-_ ]skolen|kontakt|finn[-_ ]fram|besok|besøk|historie'
                   r'|byggetrinn|nybygg|lokal|avdeling|vare[-_ ]bygg', re.I)
GUESS = ('/om-skolen/', '/om-skulen/', '/om-oss/', '/kontakt-oss/',
         '/skolen-var/', '/skulen-var/', '/om-skolen/skolens-historie/')
STOP = ('videregående', 'vidaregåande', 'videregaande', 'skole', 'skule',
        'skolen', 'skulen', 'vgs', 'avd', 'avdeling', 'og', 'gymnas')


# Wikimedia rate-limits bursts hard, and six workers querying three endpoints
# per school is a burst. A 429 used to surface as a silent empty tier — the
# hunt reported "no candidates" for entire counties that have Wikipedia
# articles with photos, and nothing distinguished that from photos genuinely
# not existing. Wikimedia requests are therefore serialised (photo_stage
# already does the same, for the same reason) and retried on 429.
_WIKI_LOCK = threading.Lock()
_WIKI_HOSTS = ('wikipedia.org', 'wikimedia.org')


def fetch(url, timeout=25, limit=None):
    wiki = any(h in url for h in _WIKI_HOSTS)
    for attempt in range(4):
        try:
            if wiki:
                with _WIKI_LOCK:
                    req = urllib.request.Request(url, headers=UA)
                    with urllib.request.urlopen(req, timeout=timeout) as r:
                        return (r.read(limit) if limit else r.read()), r.geturl()
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return (r.read(limit) if limit else r.read()), r.geturl()
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 3:
                raise
            time.sleep(2.0 + attempt * 3.0)


def norm_site(u):
    u = (u or '').strip()
    if not u or '@' in u:
        return None
    return u if u.startswith('http') else 'https://' + u.lstrip('/')


def tokens(name):
    n = re.sub(r'[^\wæøå ]', ' ', name.lower().replace('.', ' '))
    return [w for w in n.split() if len(w) > 3 and w not in STOP]


def haversine(a, b, c, d):
    p1, p2 = math.radians(a), math.radians(c)
    dp, dl = p2 - p1, math.radians(d - b)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def upsize(url):
    """County CMSes render the homepage copy at 600 px; the same asset is
    usually available larger through the same query. Purely cosmetic — the
    original is kept if the bigger one does not serve."""
    for pat, rep in ((r'([?&]width=)\d+', r'\g<1>1600'),
                     (r'/w600/h(\d+)/', '/w1200/h675/'),
                     (r'__w=\d+_h=\d+', '__w=1200_h=675')):
        new = re.sub(pat, rep, url)
        if new != url:
            return new
    return url


# ---------------------------------------------------------------- tier: site
def score_img(src, alt, name_toks):
    hay = (urllib.parse.unquote(src).lower() + ' ' + (alt or '').lower())
    tail = hay.rsplit('/', 1)[-1]
    if any(b in tail for b in BAD):
        return -10
    s = sum(3 for g in GOOD if g in tail)
    s += sum(4 for t in name_toks if t in tail)
    if any(b in hay for b in ('logo', 'ikon', 'favicon')):
        return -10
    return s


def images_on(html, base, name_toks, bonus=0):
    soup = BeautifulSoup(html, 'lxml')
    out, seen = [], set()

    def add(src, alt, why, bump):
        if not src or src.strip().startswith('data:'):
            return
        full = urllib.parse.urljoin(base, src.strip())
        if full.lower().split('?')[0].endswith('.svg') or full in seen:
            return
        sc = score_img(full, alt, name_toks)
        if sc <= -10:
            return
        seen.add(full)
        out.append({'tier': 'site', 'url': full, 'why': f'{why} score={sc + bump}',
                    'score': sc + bump, 'page': base, 'alt': (alt or '')[:80]})

    for prop in ('og:image', 'og:image:url', 'twitter:image'):
        for m in soup.find_all('meta', attrs={'property': prop}) + \
                 soup.find_all('meta', attrs={'name': prop}):
            add(m.get('content'), '', prop, bonus + 1)
    for img in soup.find_all('img')[:40]:
        add(img.get('src') or img.get('data-src'), img.get('alt'), 'img', bonus)
    return out


def site_candidates(school):
    url = norm_site(school.get('url'))
    if not url:
        return []
    toks = tokens(school['name'])
    try:
        body, final = fetch(url)
    except Exception:
        try:
            body, final = fetch(url.replace('https://', 'http://', 1))
        except Exception as e:
            return [{'tier': 'site', 'error': f'{type(e).__name__}: {str(e)[:60]}'}]
    out = images_on(body, final, toks)
    # the building photo usually lives on "om skolen", not the news feed
    host = urllib.parse.urlparse(final).netloc
    links, soup = [], BeautifulSoup(body, 'lxml')
    for a in soup.find_all('a', href=True):
        if not ABOUT.search(a['href'] + ' ' + a.get_text(' ', strip=True)[:60]):
            continue
        u = urllib.parse.urljoin(final, a['href'])
        if urllib.parse.urlparse(u).netloc == host and u not in links:
            links.append(u)
    for g in GUESS:
        u = urllib.parse.urljoin(final, g)
        if u not in links:
            links.append(u)
    for u in links[:8]:
        try:
            b2, f2 = fetch(u, timeout=20)
            out += images_on(b2, f2, toks, bonus=2)
        except Exception:
            pass
    out.sort(key=lambda c: -c['score'])
    return out[:6]


# ----------------------------------------------------------- tier: wikipedia
def commons_meta(img_url):
    """Turn an upload.wikimedia.org URL into (served thumb, page, credit)."""
    u = img_url.split('?')[0]
    m = re.search(r'/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/]+)', u)
    if not m:
        return {'url': u}
    fname = urllib.parse.unquote(m.group(1))
    try:
        q = urllib.parse.urlencode({
            'action': 'query', 'format': 'json', 'titles': f'File:{fname}',
            'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 1280})
        body, _ = fetch(f'https://commons.wikimedia.org/w/api.php?{q}')
        pages = list((json.loads(body).get('query') or {}).get('pages', {}).values())
        info = (pages[0].get('imageinfo') or [{}])[0]
    except Exception:
        return {'url': u}
    ex = info.get('extmetadata') or {}
    artist = re.sub(r'<[^>]+>', '', (ex.get('Artist') or {}).get('value', '')).strip()
    lic = (ex.get('LicenseShortName') or {}).get('value', '')
    return {'url': info.get('thumburl') or u,
            'page': info.get('descriptionurl'),
            'credit': f"Foto: {artist}{' (' + lic + ')' if lic else ''}" if artist else None,
            'license': lic or None}


def wiki_candidates(school):
    for lang in ('no', 'nn'):
        try:
            q = urllib.parse.urlencode({'q': school['name'], 'limit': 3})
            body, _ = fetch(f'https://{lang}.wikipedia.org/w/rest.php/v1/search/title?{q}')
            hits = json.loads(body).get('pages', [])
        except Exception:
            continue
        for h in hits:
            title = (h.get('title') or '').lower()
            if not any(w in title for w in ('skole', 'skule', 'gymnas', 'katedral', 'vgs')):
                continue
            try:
                body, _ = fetch(f'https://{lang}.wikipedia.org/api/rest_v1/page/'
                                f'summary/{urllib.parse.quote(h["key"])}')
                s = json.loads(body)
            except Exception:
                continue
            co = s.get('coordinates') or {}
            km = haversine(school['lat'], school['lon'], co['lat'], co['lon']) \
                if co and school.get('lat') else None
            if km is None or km > 3:
                continue          # cannot prove it is our school -> not our school
            img = ((s.get('originalimage') or {}).get('source')
                   or (s.get('thumbnail') or {}).get('source'))
            if not img:
                continue
            meta = commons_meta(img)
            return [{'tier': 'wikipedia', 'score': 100,
                     'why': f'{lang}.wiki {km:.1f} km',
                     'wiki_url': s.get('content_urls', {}).get('desktop', {}).get('page'),
                     'wiki_extract': (s.get('extract') or '')[:400],
                     **meta}]
        time.sleep(0.3)
    return []


# ------------------------------------------------------------- tier: commons
def commons_candidates(school):
    if not school.get('lat'):
        return []
    toks = tokens(school['name'])
    try:
        q = urllib.parse.urlencode({
            'action': 'query', 'format': 'json', 'generator': 'geosearch',
            'ggscoord': f"{school['lat']}|{school['lon']}", 'ggsradius': 250,
            'ggslimit': 20, 'ggsnamespace': 6, 'prop': 'imageinfo',
            'iiprop': 'url|extmetadata', 'iiurlwidth': 1280})
        body, _ = fetch(f'https://commons.wikimedia.org/w/api.php?{q}')
        pages = list((json.loads(body).get('query') or {}).get('pages', {}).values())
    except Exception:
        return []
    out = []
    for p in pages:
        t = (p.get('title') or '').lower()
        if t.endswith(('.svg', '.pdf', '.ogg', '.webm', '.tif')):
            continue
        if not any(tok in t for tok in toks):
            continue
        info = (p.get('imageinfo') or [{}])[0]
        ex = info.get('extmetadata') or {}
        artist = re.sub(r'<[^>]+>', '', (ex.get('Artist') or {}).get('value', '')).strip()
        lic = (ex.get('LicenseShortName') or {}).get('value', '')
        if info.get('thumburl'):
            out.append({'tier': 'commons', 'score': 50, 'url': info['thumburl'],
                        'why': f'geo+name: {p["title"]}',
                        'page': info.get('descriptionurl'),
                        'credit': f"Foto: {artist}{' (' + lic + ')' if lic else ''}" if artist else None,
                        'license': lic or None})
    return out[:2]


def commons_by_title(school):
    """Commons file-name search. Geosearch only finds geotagged files, and most
    school photos are not geotagged — but they are named after the school. Two
    matching name tokens is the bar, and if the file does carry coordinates
    they still have to land near the school."""
    toks = tokens(school['name'])
    if not toks:
        return []
    try:
        q = urllib.parse.urlencode({
            'action': 'query', 'format': 'json', 'generator': 'search',
            'gsrsearch': f'intitle:{" intitle:".join(toks[:3])}',
            'gsrnamespace': 6, 'gsrlimit': 20, 'prop': 'imageinfo',
            'iiprop': 'url|extmetadata|metadata', 'iiurlwidth': 1280})
        body, _ = fetch(f'https://commons.wikimedia.org/w/api.php?{q}')
        pages = list((json.loads(body).get('query') or {}).get('pages', {}).values())
    except Exception:
        return []
    out = []
    for p in pages:
        t = (p.get('title') or '').lower()
        if t.endswith(('.svg', '.pdf', '.ogg', '.webm', '.tif')):
            continue
        if sum(1 for tok in toks if tok in t) < min(2, len(toks)):
            continue
        info = (p.get('imageinfo') or [{}])[0]
        ex = info.get('extmetadata') or {}
        artist = re.sub(r'<[^>]+>', '', (ex.get('Artist') or {}).get('value', '')).strip()
        lic = (ex.get('LicenseShortName') or {}).get('value', '')
        if not info.get('thumburl'):
            continue
        out.append({'tier': 'commons', 'score': 60, 'url': info['thumburl'],
                    'why': f'title match: {p["title"]}',
                    'page': info.get('descriptionurl'),
                    'credit': f"Foto: {artist}{' (' + lic + ')' if lic else ''}" if artist else None,
                    'license': lic or None})
    return out[:2]


def wiki_no_coords(school):
    """Some school articles carry no coordinates at all, so the 3 km check
    cannot run. Fall back to a strict identity test instead: every significant
    token of the school name must be in the article title, AND the article must
    name the school's own municipality or county — otherwise a same-name school
    in another county walks straight in (there is a St. Olav in Stavanger and
    another in Sarpsborg)."""
    toks = tokens(school['name'])
    place = [w for w in re.split(r'[\s,]+', (school.get('address') or '')) if len(w) > 3]
    place = [w.lower() for w in place if not w.isdigit()]
    for lang in ('no', 'nn'):
        try:
            q = urllib.parse.urlencode({'q': school['name'], 'limit': 3})
            body, _ = fetch(f'https://{lang}.wikipedia.org/w/rest.php/v1/search/title?{q}')
            hits = json.loads(body).get('pages', [])
        except Exception:
            continue
        for h in hits:
            title = (h.get('title') or '').lower()
            if not all(t in title for t in toks):
                continue
            try:
                body, _ = fetch(f'https://{lang}.wikipedia.org/api/rest_v1/page/'
                                f'summary/{urllib.parse.quote(h["key"])}')
                s_ = json.loads(body)
            except Exception:
                continue
            if s_.get('coordinates'):
                continue                      # the coordinate tier already judged it
            hay = (title + ' ' + (s_.get('extract') or '')).lower()
            if school['fylke'].lower() not in hay and not any(w in hay for w in place):
                continue
            img = ((s_.get('originalimage') or {}).get('source')
                   or (s_.get('thumbnail') or {}).get('source'))
            if not img:
                continue
            return [{'tier': 'wikipedia', 'score': 90, 'why': f'{lang}.wiki strict title',
                     'wiki_url': s_.get('content_urls', {}).get('desktop', {}).get('page'),
                     'wiki_extract': (s_.get('extract') or '')[:400],
                     **commons_meta(img)}]
    return []


def commons_category(school):
    """Photos filed under the school's Commons category but named something
    else entirely (IMG_0107.JPG and friends), which the filename search cannot
    see."""
    base = re.sub(r'\s+', ' ', school['name']).strip()
    variants = [base, base.replace('videregående', 'vidaregåande'),
                base.replace('vidaregåande', 'videregående')]
    for v in dict.fromkeys(variants):
        try:
            q = urllib.parse.urlencode({
                'action': 'query', 'format': 'json', 'generator': 'categorymembers',
                'gcmtitle': f'Category:{v}', 'gcmtype': 'file', 'gcmlimit': 10,
                'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 1280})
            body, _ = fetch(f'https://commons.wikimedia.org/w/api.php?{q}')
            pages = list((json.loads(body).get('query') or {}).get('pages', {}).values())
        except Exception:
            continue
        out = []
        for p_ in pages:
            t = (p_.get('title') or '').lower()
            if t.endswith(('.svg', '.pdf', '.ogg', '.webm', '.tif')):
                continue
            info = (p_.get('imageinfo') or [{}])[0]
            ex = info.get('extmetadata') or {}
            artist = re.sub(r'<[^>]+>', '', (ex.get('Artist') or {}).get('value', '')).strip()
            lic = (ex.get('LicenseShortName') or {}).get('value', '')
            if info.get('thumburl'):
                out.append({'tier': 'commons', 'score': 70, 'url': info['thumburl'],
                            'why': f'category: {v}', 'page': info.get('descriptionurl'),
                            'credit': f"Foto: {artist}{' (' + lic + ')' if lic else ''}" if artist else None,
                            'license': lic or None})
        if out:
            return out[:3]
    return []


def hunt(school):
    cands = []
    for fn in (wiki_candidates, wiki_no_coords, commons_category,
               commons_by_title, site_candidates, commons_candidates):
        if fn is commons_candidates and [c for c in cands if c.get('url')]:
            break
        try:
            cands += fn(school)
        except Exception as e:
            print(f'  {fn.__name__} fail {school["name"]}: {e}', file=sys.stderr)
    for c in cands:
        if c.get('url') and c['tier'] == 'site':
            c['url_big'] = upsize(c['url'])
    return {'name': school['name'], 'fylke': school['fylke'],
            'site': school.get('url'), 'candidates': cands}


def main():
    data = json.load(open(DATA))
    # build_dataset deliberately writes no coordinates — geocode restores them
    # afterwards. Run on the bare intermediate and every tier that proves a
    # photo belongs to OUR school (wiki distance, Commons geosearch) silently
    # returns nothing, which looks exactly like "no photos exist". It has
    # happened; refuse instead.
    if not any(s.get('lat') for s in data['schools']):
        sys.exit('schools.json has no coordinates — run tools/geocode.py first')
    todo = [s for s in data['schools'] if not s.get('photo')]
    if len(sys.argv) > 1:
        todo = [s for s in todo if s['fylke'].lower().startswith(sys.argv[1].lower())]
    print(f'{len(todo)} schools without a photo')
    res = []
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for r in ex.map(hunt, todo):
            good = [c for c in r['candidates'] if c.get('url')]
            tiers = ','.join(sorted({c['tier'] for c in good})) or 'NONE'
            print(f"  {r['fylke']:<10} {r['name'][:34]:<36} {len(good):>2} [{tiers}]")
            res.append(r)
    os.makedirs(STAGE, exist_ok=True)
    json.dump(res, open(os.path.join(STAGE, 'candidates.json'), 'w'),
              ensure_ascii=False, indent=1)
    n = sum(1 for r in res if [c for c in r['candidates'] if c.get('url')])
    print(f'\n{n}/{len(res)} schools have at least one candidate')


if __name__ == '__main__':
    main()
