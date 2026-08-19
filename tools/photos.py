#!/usr/bin/env python3
"""Curated school photo + identity overrides.

The automatic enrichment in enrich.py matches by name and by geosearch, which
produced wrong-school and wrong-subject results (QA 2026-08-19): Commons
geosearch returns the *nearest* photo, not the school's, and the Wikipedia
title search hits same-name schools in other counties. This module holds the
human-verified truth and always wins over enrich.py.

Run after parse/geocode/enrich:  python3 tools/photos.py
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'web', 'data', 'schools.json')

# photo: direct image URL · page: source page for the credit link
# credit: attribution text shown on the image · license: for our own records
# position: CSS object-position when the subject is not centred
OVERRIDES = {
    # --- wrong school entirely (name collision with another county) -------
    'St.Olav videregående skole': {
        'wiki_url': 'https://no.wikipedia.org/wiki/St._Olav_videreg%C3%A5ende_skole_(Stavanger)',
        'wiki_extract': ('St. Olav videregående skole er en videregående skole i '
                         'Stavanger, og er den største videregående skolen i '
                         'Rogaland. Skolen tilbyr studiespesialisering.'),
        # school is mid-rebuild; only an architect rendering exists publicly
        'photo': ('https://www.st-olav.vgs.no/handlers/bv.ashx/'
                  'ia92c2792-e136-41cd-a65f-75c2f1bedd0f/enscape_2024-04-19-13-49-20.jpg'),
        'page': 'https://www.st-olav.vgs.no/',
        'credit': 'Illustrasjon: nybygget – St. Olav vgs / Rogaland fylkeskommune',
        'license': '© Rogaland fylkeskommune (illustrasjon)',
    },
    'Stavanger Offshore Tekniske skole': {
        # previously showed Bergeland's article and photo (no.wiki redirect)
        'wiki_url': None, 'wiki_extract': None,
        'photo': ('https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/'
                  '20180811_Kalhammaren_fra_sj%C3%B8siden.jpg/1280px-'
                  '20180811_Kalhammaren_fra_sj%C3%B8siden.jpg'),
        'page': ('https://commons.wikimedia.org/wiki/File:'
                 '20180811_Kalhammaren_fra_sj%C3%B8siden.jpg'),
        'credit': 'Foto: Arne Kvitrud (CC BY-SA 4.0)',
        'license': 'CC BY-SA 4.0',
        'position': 'top',   # school sits in the upper half of the frame
    },

    # --- wrong subject, replacement found --------------------------------
    'Randaberg videregående skole': {   # was a screen-photo of a person
        'photo': ('https://www.randaberg.vgs.no/handlers/bv.ashx/e1/'
                  'i2bb6310d-23f3-485e-af3e-2175f4c9ffb8/skolen.jpg'),
        'page': 'https://www.randaberg.vgs.no/',
        'credit': 'Foto: Randaberg vgs / Rogaland fylkeskommune',
        'license': '© Rogaland fylkeskommune',
    },
    'Strand videregående skole': {      # was Sentrum vgs, Kongsvinger
        'photo': ('https://www.strand.vgs.no/handlers/bv.ashx/'
                  'i6333f9a5-98fe-4e44-b832-9606ed97d9f1/strand-vgs-ute.jpg'),
        'page': 'https://www.strand.vgs.no/',
        'credit': 'Foto: Strand vgs / Rogaland fylkeskommune',
        'license': '© Rogaland fylkeskommune',
    },
    'Sauda vidaregåande skule': {       # was a county road landscape
        'photo': ('https://www.sauda.vgs.no/handlers/bv.ashx/'
                  'i48bc0158-5ab6-41a5-9db6-27825ba0d132/lofthus.jpg'),
        'page': 'https://www.sauda.vgs.no/',
        'credit': 'Foto: Sauda vgs / Rogaland fylkeskommune',
        'license': '© Rogaland fylkeskommune',
    },
    'Åkrehamn vidaregåande skole': {    # was Åkra church
        'photo': ('https://www.akrehamn.vgs.no/handlers/bv.ashx/e1/'
                  'i00d766e4-87b2-496e-8844-41628920d27c/avgs.jpg'),
        'page': 'https://www.akrehamn.vgs.no/',
        'credit': 'Foto: Åkrehamn vgs / Rogaland fylkeskommune',
        'license': '© Rogaland fylkeskommune',
    },

    # --- had no photo at all ---------------------------------------------
    'Bryne vidaregåande skule': {
        'photo': ('https://www.bryne.vgs.no/handlers/bv.ashx/e1/'
                  'i9657a695-1e84-4f22-be41-16af6e421321/skulen-reed7.jpg'),
        'page': 'https://www.bryne.vgs.no/',
        'credit': 'Foto: Bryne vgs / Rogaland fylkeskommune',
        'license': '© Rogaland fylkeskommune',
    },
    'Dalane videregående skole': {
        # 800px variant: the original is a 2.9 MB PNG, too heavy for a header
        'photo': ('https://www.dalane.vgs.no/handlers/bv.ashx/e1/'
                  'i90447595-a2e2-4985-bbe8-94b6fa947462/w800/h550/q35672/'
                  'k80e3d0596c62/fasade-var-2.png'),
        'page': 'https://www.dalane.vgs.no/',
        'credit': 'Foto: Dalane vgs / Rogaland fylkeskommune',
        'license': '© Rogaland fylkeskommune',
    },
    'Øksnevad vidaregåande skole': {
        'photo': ('https://www.oksnevad.vgs.no/handlers/bv.ashx/e1/'
                  'ifb3a296b-8169-4f23-bed0-adfbd77a4f7a/oksnevad-1.jpg'),
        'page': 'https://www.oksnevad.vgs.no/',
        'credit': 'Foto: Øksnevad vgs / Rogaland fylkeskommune',
        'license': '© Rogaland fylkeskommune',
    },

    # --- wrong subject, nothing freely available: show the gradient -------
    'Hetland videregående skole': {'photo': None, 'note': 'no free photo found (previous image was Strand vgs interior)'},
    'Karmsund videregående skole': {'photo': None, 'note': 'no free photo found (previous image was a bike path)'},
    'Skeisvang videregående skole': {'photo': None, 'note': 'no free photo found (previous image was a concert hall)'},
}

# NSR stores an e-mail address in the website field for these schools
URL_FIXES = {
    'Øksnevad vidaregåande skole': 'https://www.oksnevad.vgs.no/',
    'Vardafjell videregående skole': 'https://www.vardafjell.vgs.no/',
}

COMMONS_FILE_RE = re.compile(
    r'^https://upload\.wikimedia\.org/wikipedia/commons/(?!thumb/)([0-9a-f])/([0-9a-f]{2})/(.+)$')


def _serves_image(url):
    time.sleep(1.0)                       # Wikimedia rate-limits rapid probes
    try:
        r = urllib.request.urlopen(urllib.request.Request(
            url, headers={'User-Agent': 'poengkart/0.1 (prototype)'}), timeout=30)
        return r.status == 200 and r.headers.get('content-type', '').startswith('image')
    except Exception:
        return False


def commons_thumb(url, width=1280):
    """Rewrite a full-size Commons original to a sized thumbnail.

    Commons only serves a short list of thumbnail widths per file (1280 is the
    reliable one; 640/800/1024 are commonly refused) and never a width above
    the source. Probe once and keep the original if the thumb is not served.
    """
    url = (url or '').split('?')[0]        # drop utm tracking params
    if 'upload.wikimedia.org' not in url or '/thumb/' in url:
        return url
    tail = url.split('/wikipedia/commons/')[-1].split('/')
    if len(tail) < 3 or tail[2].lower().endswith(('.svg', '.gif')):
        return url
    a, ab, fname = tail[0], tail[1], tail[2]
    thumb = (f'https://upload.wikimedia.org/wikipedia/commons/thumb/{a}/{ab}/'
             f'{fname}/{width}px-{fname}')
    return thumb if _serves_image(thumb) else url


def main():
    data = json.load(open(DATA))
    changed = []
    for s in data['schools']:
        name = s['name']
        if name in URL_FIXES and '@' in (s.get('url') or ''):
            s['url'] = URL_FIXES[name]
            changed.append(f'{name}: url (was an e-mail address)')
        ov = OVERRIDES.get(name)
        if ov:
            for field, key in (('photo', 'photo'), ('photo_page', 'page'),
                               ('photo_credit', 'credit'), ('photo_license', 'license'),
                               ('photo_position', 'position'),
                               ('wiki_url', 'wiki_url'), ('wiki_extract', 'wiki_extract')):
                if key in ov:
                    if ov[key] is None:
                        s.pop(field, None)
                    else:
                        s[field] = ov[key]
            s['photo_source'] = 'curated'
            if ov.get('note'):
                s['photo_note'] = ov['note']
            changed.append(f'{name}: {"photo removed" if ov.get("photo", 1) is None else "photo/identity set"}')
        # lighten any remaining full-size Commons originals
        if s.get('photo') and s.get('photo_source') != 'curated':
            clean = s['photo'].split('?')[0] if 'upload.wikimedia.org' in s['photo'] else s['photo']
            thumb = commons_thumb(clean)
            if thumb != s['photo']:
                s['photo'] = thumb
                changed.append(f'{name}: commons thumbnail')

    json.dump(data, open(DATA, 'w'), ensure_ascii=False, indent=1)
    have = sum(1 for s in data['schools'] if s.get('photo'))
    print(f'{len(changed)} changes; {have}/{len(data["schools"])} schools have a photo')
    for c in changed:
        print('  ', c)


if __name__ == '__main__':
    main()
