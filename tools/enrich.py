#!/usr/bin/env python3
"""Enrich schools.json with contact info (NSR) and photo/summary (Wikipedia +
Wikimedia Commons).

- NSR detail: website URL, email, phone, visiting address.
- no.wikipedia.org: title search -> summary -> photo/extract/page URL (retried
  with backoff; the REST API throttles bursts).
- Photo fallback: Commons geosearch around the school's coordinates, preferring
  filenames that look school-related.
Idempotent: re-running refreshes fields in place.
"""

import json
import os
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'web', 'data', 'schools.json')
UA = {'User-Agent': 'poengkart-prototype/0.1 (personal project; contact via github)', 'Accept': 'application/json'}
ORGNR_FALLBACK = {'øksnevad vidaregåande skole': '974624451'}


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(4 + 8 * i)


def nsr_contact(orgnr):
    try:
        det = get(f'https://data-nsr.udir.no/v3/enhet/{orgnr}')
    except Exception:
        return {}
    out = {}
    for key in ('Url', 'Internettadresse', 'Hjemmeside'):
        if det.get(key):
            out['url'] = det[key]
            break
    if det.get('Epost'):
        out['email'] = det['Epost']
    if det.get('Telefon'):
        out['phone'] = det['Telefon']
    adr = det.get('Beliggenhetsadresse') or {}
    if adr.get('Adresse'):
        out['address'] = f"{adr['Adresse']}, {adr.get('Postnr', '')} {adr.get('Poststed', '')}".strip()
    return out


def wiki_lookup(name):
    out = {}
    for wl in ('no', 'nn'):
        try:
            q = urllib.parse.urlencode({'q': name, 'limit': 1})
            hits = get(f'https://{wl}.wikipedia.org/w/rest.php/v1/search/title?{q}').get('pages', [])
            if not hits:
                continue
            title = (hits[0].get('title') or '').lower()
            if not any(w in title for w in ('skole', 'skule', 'gymnas', 'katedral')):
                continue
            key = hits[0]['key']
            s = get(f'https://{wl}.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(key)}')
            img = (s.get('originalimage') or {}).get('source') or (s.get('thumbnail') or {}).get('source')
            if img and not out.get('photo'):
                out['photo'] = img
                out['photo_source'] = 'wikipedia'
            if s.get('extract') and not out.get('wiki_extract'):
                out['wiki_extract'] = s['extract'][:400]
            if s.get('content_urls', {}).get('desktop', {}).get('page') and not out.get('wiki_url'):
                out['wiki_url'] = s['content_urls']['desktop']['page']
            if out.get('photo'):
                break
            time.sleep(0.8)
        except Exception as e:
            print(f'    wiki({wl}) fail for {name}: {e}')
    return out


def commons_photo(lat, lon, school_name):
    """Nearest Commons image around the school; prefer school-looking filenames."""
    try:
        q = urllib.parse.urlencode({
            'action': 'query', 'format': 'json', 'generator': 'geosearch',
            'ggscoord': f'{lat}|{lon}', 'ggsradius': 200, 'ggslimit': 12, 'ggsnamespace': 6,
            'prop': 'imageinfo', 'iiprop': 'url', 'iiurlwidth': 900,
        })
        d = get(f'https://commons.wikimedia.org/w/api.php?{q}')
        pages = list((d.get('query') or {}).get('pages', {}).values())
        if not pages:
            # no geotagged photos nearby: full-text file search on the name
            q2 = urllib.parse.urlencode({
                'action': 'query', 'format': 'json', 'generator': 'search',
                'gsrsearch': school_name, 'gsrnamespace': 6, 'gsrlimit': 8,
                'prop': 'imageinfo', 'iiprop': 'url', 'iiurlwidth': 900,
            })
            d = get(f'https://commons.wikimedia.org/w/api.php?{q2}')
            pages = list((d.get('query') or {}).get('pages', {}).values())
            pages = [p for p in pages if not p.get('title', '').lower().endswith(('.svg', '.pdf', '.ogg', '.webm'))]
        if not pages:
            return {}
        words = [w for w in school_name.lower().replace('.', ' ').split()
                 if len(w) > 3 and w not in ('videregående', 'vidaregåande', 'skole', 'skule')]
        def score(p):
            t = p.get('title', '').lower()
            s = sum(3 for w in words if w in t)
            s += 2 if any(k in t for k in ('skole', 'skule', 'vgs', 'gymnas')) else 0
            if any(k in t for k in ('interiør', 'interior', 'kart', 'map', 'logo')):
                s -= 2
            return s
        pages.sort(key=score, reverse=True)
        best = pages[0]
        info = (best.get('imageinfo') or [{}])[0]
        if info.get('thumburl'):
            return {'photo': info['thumburl'], 'photo_source': 'commons',
                    'photo_page': info.get('descriptionurl', '')}
    except Exception as e:
        print(f'    commons fail for {school_name}: {e}')
    return {}


def main():
    data = json.load(open(DATA))
    for s in data['schools']:
        info = {}
        orgnr = s.get('orgnr') or ORGNR_FALLBACK.get(s['name'].lower())
        if orgnr and not s.get('url'):
            info.update(nsr_contact(orgnr))
            time.sleep(0.5)
        if not s.get('wiki_url'):
            info.update(wiki_lookup(s['name']))
            time.sleep(2.0)
        if not (s.get('photo') or info.get('photo')) and s.get('lat'):
            info.update(commons_photo(s['lat'], s['lon'], s['name']))
            time.sleep(2.0)
        s.update(info)
        print(f"{s['name'][:38]:<40} url={'y' if s.get('url') else '-'} "
              f"photo={s.get('photo_source', '-'):<9} wiki={'y' if s.get('wiki_url') else '-'}")
    json.dump(data, open(DATA, 'w'), ensure_ascii=False, indent=1)
    n_photo = sum(1 for s in data['schools'] if s.get('photo'))
    n_url = sum(1 for s in data['schools'] if s.get('url'))
    print(f'\nphotos: {n_photo}/{len(data["schools"])}, websites: {n_url}/{len(data["schools"])}')


if __name__ == '__main__':
    main()
