#!/usr/bin/env python3
"""Attach each school's kommune and post town (sted) to the dataset.

    .venv/bin/python3 tools/places.py [--refresh]

Readers look for a school by where it is: «Sandnes» has to find Gand and
Vågen, and «Bærum» the schools whose post town is Hosle or Gjettum. The post
town comes from the school's own address ("Bispeveien 10, 1362, HOSLE"); the
kommune from NSR's record for the school's orgnr, then from Brønnøysund's
register for an orgnr NSR has dropped, and last from another school with the
same postcode. Answers are cached in tools/kommuner.json, so a rebuild needs
no network.
"""

import json
import os
import re
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'web', 'public', 'data', 'schools.json')
CACHE = os.path.join(HERE, 'kommuner.json')
UA = {'User-Agent': 'poengkart/0.1 (prototype)', 'Accept': 'application/json'}

# schools with no orgnr, or none that any register knows, placed by hand
MANUAL = {
    # closed in 2019 and gone from NSR; the building stands in Ålesund
    ('15', 'fagerlia videregående skole'): 'Ålesund',
    ('15', 'herøy vidaregåande skule, avd. vanylven'): 'Vanylven',
    ('34', 'nord-gudbrandsdal vgs, avd. dombås'): 'Dovre',
    ('34', 'nord-gudbrandsdal vgs, avd. lom'): 'Lom',
}

SMALL = {'i', 'og', 'på'}


def title(s):
    """«BØ I TELEMARK» → «Bø i Telemark», «SØR-ODAL» → «Sør-Odal». A register
    tells two kommuner of one name apart by county, «Herøy (Møre og Romsdal)»,
    which the dataset already does; the Sámi half of a double name goes too."""
    s = re.sub(r'\s*\(.*\)$', '', s.split(' - ')[0]).strip()
    def word(w, first):
        if not first and w.lower() in SMALL:
            return w.lower()
        return '-'.join(p[:1].upper() + p[1:].lower() for p in w.split('-'))
    return ' '.join(word(w, i == 0) for i, w in enumerate(s.split()))


def sted(address):
    """The post town of an NSR address: "Street 1, 1362, HOSLE" or "2660 Dombås"."""
    if not address:
        return None
    parts = [p.strip() for p in address.split(',') if p.strip()]
    last = re.sub(r'^\d{4}\s*', '', parts[-1]).strip() if parts else ''
    last = re.sub(r'\s+[NSØV]$', '', last)                 # «KRISTIANSUND N»
    if not last or re.fullmatch(r'\d+', last):
        return None
    return title(last)


def postnr(address):
    m = re.search(r'\b(\d{4})\b', address or '')
    return m.group(1) if m else None


def get(url, timeout=30):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout))


def lookup(orgnr):
    """(kommune, kommunenummer) for one orgnr, or None."""
    try:
        k = get(f'https://data-nsr.udir.no/v3/enhet/{orgnr}').get('Kommune') or {}
        if k.get('Navn'):
            return title(k['Navn']), k.get('Kommunenr')
    except Exception:
        pass
    for kind in ('underenheter', 'enheter'):
        try:
            a = get(f'https://data.brreg.no/enhetsregisteret/api/{kind}/{orgnr}')
            a = a.get('beliggenhetsadresse') or a.get('forretningsadresse') or {}
            if a.get('kommune'):
                return title(a['kommune']), a.get('kommunenummer')
        except Exception:
            pass
    return None


def main():
    refresh = '--refresh' in sys.argv
    cache = {} if refresh or not os.path.exists(CACHE) else json.load(open(CACHE))
    data = json.load(open(DATA))
    for s in data['schools']:
        o = s.get('orgnr')
        if o and o not in cache:
            hit = lookup(o)
            cache[o] = {'kommune': hit[0], 'kommunenr': hit[1]} if hit else None
            time.sleep(0.1)
    by_post = {}
    for s in data['schools']:
        c = cache.get(s.get('orgnr') or '')
        if c and postnr(s.get('address')):
            by_post.setdefault(postnr(s['address']), c['kommune'])
    missing = []
    for s in data['schools']:
        c = cache.get(s.get('orgnr') or '')
        k = MANUAL.get((s.get('fylkesnummer'), s['name'].lower())) \
            or (c or {}).get('kommune') or by_post.get(postnr(s.get('address')))
        st = sted(s.get('address'))
        for f, v in (('kommune', k), ('sted', st or k)):
            if v:
                s[f] = v
            else:
                s.pop(f, None)
        if not k:
            missing.append(s['name'])
    json.dump(dict(sorted(cache.items())), open(CACHE, 'w'), ensure_ascii=False, indent=1)
    with open(DATA, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    n = len(data['schools'])
    print(f'kommune on {n - len(missing)} of {n} schools'
          + (f'; none for {", ".join(missing)}' if missing else ''))
    if missing:
        sys.exit(1)


if __name__ == '__main__':
    main()
