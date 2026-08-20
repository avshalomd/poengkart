#!/usr/bin/env python3
"""School photo + identity overrides.

Two layers, both human-reviewed:

  photos-auto.json  — the national harvest. tools/photo_hunt.py proposes
      candidates, tools/photo_stage.py measures them, and every one was looked
      at on a contact sheet before being written here. Regenerate with
      photo_hunt -> photo_stage -> photo_sheets -> photo_accept.
  OVERRIDES (below) — hand-written entries that carry a reason: a name
      collision, a photo of identifiable pupils, a crop that must not centre.
      These always win over the harvest.

Nothing about a photo is inferred at publish time. The automatic matching in
enrich.py returned the wrong school on a name collision and the *nearest*
Commons photo rather than the school's (QA 2026-08-19), so a candidate that
nobody looked at is not published at all — the location map stands in.

Run as part of the pipeline:  python3 tools/refresh.py
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'web', 'data', 'schools.json')
AUTO = os.path.join(HERE, 'photos-auto.json')

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

    # --- found on a second, deeper sweep (incl. the Wayback image index) ---
    'Hetland videregående skole': {
        'photo': ('https://www.hetland.vgs.no/handlers/bv.ashx/'
                  'i8b8c75a0-4c44-48c3-ae6f-d5b5756b0e38/dji_0058-2.jpg'),
        'page': 'https://www.hetland.vgs.no/',
        'credit': 'Foto: Hetland vgs / Rogaland fylkeskommune',
        'license': '© Rogaland fylkeskommune',
    },
    'Karmsund videregående skole': {
        # no longer linked from any live page; still served by the CMS handler
        'photo': ('https://www.karmsund.vgs.no/handlers/bv.ashx/'
                  'ia700f80a-fa6d-4320-9c82-bb39571eb572/'
                  'kamsund-vgs-foto-laringkompaniet-rogaland.jpg'),
        'page': 'https://www.karmsund.vgs.no/',
        'credit': 'Foto: Læringkompaniet Rogaland / Rogaland fylkeskommune',
        'license': '© Rogaland fylkeskommune',
    },
    'Skeisvang videregående skole': {
        'photo': ('https://www.skeisvang.vgs.no/handlers/bv.ashx/'
                  'i2ff70c0d-f281-48d7-b217-6690bf7c31bf/fasade-003.jpg'),
        'page': ('https://www.skeisvang.vgs.no/hovedmeny/skolen-var/om-skolen/'
                 'skolens-historie/'),
        'credit': 'Foto: Skeisvang vgs / Rogaland fylkeskommune',
        'license': '© Rogaland fylkeskommune',
    },
    'St.Svithun videregående skole': {
        # the full frame has identifiable pupils along the bottom; the header
        # crop shows only the top third, so anchor it there and never centre it
        'photo': ('https://www.svithun.vgs.no/handlers/bv.ashx/'
                  'i6ef39085-71f6-4866-8efd-017a7945aa66/stsvithun_evt-framside.jpg'),
        'page': 'https://www.svithun.vgs.no/',
        'credit': 'Foto: St. Svithun vgs / Rogaland fylkeskommune',
        'license': '© Rogaland fylkeskommune',
        'position': 'top',
    },

    # --- nothing usable exists: the location map stands in ------------------
    # (Godalen was here until the national sweep found an exterior on the
    # school's own site; it is now in photos-auto.json)
    'Ølen vidaregåande skule': {'photo': None,
        'note': 'no exterior photograph found anywhere (site, Wayback, Commons, Flickr)'},
}

# NSR's website field is unreliable: sometimes an e-mail address, often a URL
# that 404s or no longer resolves (county sites moved from viken.no, and the
# www host does not always exist). Every value here was fetched and returned
# 200. Applied unconditionally — a dead link in the sidebar is a visible bug.
URL_FIXES = {
    'Øksnevad vidaregåande skole': 'https://www.oksnevad.vgs.no/',
    'Vardafjell videregående skole': 'https://www.vardafjell.vgs.no/',
}
URL_REPLACE = {
    'Eidsvoll': 'https://afk.no/eidsvoll-vgs',
    'Roald Amundsen': 'https://afk.no/roaldamundsen-vgs',
    'Buskerud': 'https://bfk.no/buskerud-vgs',
    'Ål': 'https://bfk.no/al-vgs',
    'Kongshavn videregående skole': 'https://kongshavn.vgs.no/',
    'Mølla videregående skole': 'https://molla.vgs.no/',
    'Vika videregående skole': 'https://vika.vgs.no/',
    'Fitjar vidaregåande skule': 'https://www.fitjar.vgs.no/',
    'Odda vidaregåande skule': 'https://www.odda.vgs.no/',
    'Voss vidaregåande skule': 'https://www.voss.vgs.no/',
    'Stend vidaregåande skule': 'https://www.stend.vgs.no/',
}

COMMONS_FILE_RE = re.compile(
    r'^https://upload\.wikimedia\.org/wikipedia/commons/(?!thumb/)([0-9a-f])/([0-9a-f]{2})/(.+)$')


def _serves_image(url):
    """Wikimedia rate-limits probes hard, and a 429 is indistinguishable from
    "this width is not served" — which silently keeps the oversized original.
    Retry before believing a refusal."""
    for attempt in range(4):
        time.sleep(1.0 + attempt * 3.0)
        try:
            r = urllib.request.urlopen(urllib.request.Request(
                url, headers={'User-Agent': 'poengkart/0.1 (prototype)',
                              'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8'}),
                timeout=30)
            return r.status == 200 and r.headers.get('content-type', '').startswith('image')
        except Exception as e:
            if getattr(e, 'code', None) != 429:
                return False
    return False


def commons_thumb(url, width=1280):
    """Rewrite a Commons image URL to a sized thumbnail.

    Commons only serves a short list of thumbnail widths per file (1280 is the
    reliable one; 640/800/1024 are commonly refused) and never a width above
    the source. Probe once and keep the original if the thumb is not served.

    Two shapes arrive here. A full-size original has to be turned into a thumb
    URL. An *existing* thumb can be far too big: when the Commons API call
    fails we fall back to the Wikipedia summary API's image, and that is often
    a 3840 px rendition — several megabytes pushed into a 380 px sidebar
    header. Narrow those in place.
    """
    url = (url or '').split('?')[0]        # drop utm tracking params
    if 'upload.wikimedia.org' not in url:
        return url
    if '/thumb/' in url:
        m = re.search(r'/(\d+)px-', url)
        if not m or int(m.group(1)) <= width:
            return url
        smaller = url.replace(f'/{m.group(1)}px-', f'/{width}px-')
        return smaller if _serves_image(smaller) else url
    tail = url.split('/wikipedia/commons/')[-1].split('/')
    if len(tail) < 3 or tail[2].lower().endswith(('.svg', '.gif')):
        return url
    a, ab, fname = tail[0], tail[1], tail[2]
    thumb = (f'https://upload.wikimedia.org/wikipedia/commons/thumb/{a}/{ab}/'
             f'{fname}/{width}px-{fname}')
    return thumb if _serves_image(thumb) else url


def load_auto():
    if not os.path.exists(AUTO):
        return {}
    raw = json.load(open(AUTO))
    return {name: {k: v for k, v in e.items() if k != 'source'}
            for name, e in raw.items()}


def main():
    data = json.load(open(DATA))
    auto = load_auto()
    changed = []
    for s in data['schools']:
        name = s['name']
        if name in URL_FIXES and '@' in (s.get('url') or ''):
            s['url'] = URL_FIXES[name]
            changed.append(f'{name}: url (was an e-mail address)')
        if name in URL_REPLACE and s.get('url') != URL_REPLACE[name]:
            s['url'] = URL_REPLACE[name]
            changed.append(f'{name}: url (previous one did not resolve)')
        if name in auto and name not in OVERRIDES:
            a = auto[name]
            for field, key in (('photo', 'photo'), ('photo_page', 'page'),
                               ('photo_credit', 'credit'), ('photo_license', 'license'),
                               ('photo_position', 'position'),
                               ('wiki_url', 'wiki_url'), ('wiki_extract', 'wiki_extract')):
                if key in a and a[key]:
                    s[field] = a[key]
            s['photo_source'] = 'reviewed'
            changed.append(f'{name}: photo (reviewed harvest)')
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
        # lighten any remaining full-size Commons originals. Only Wikimedia:
        # commons_thumb() drops the query string, and a county CMS serves its
        # rendition through exactly that query — stripping it silently swapped
        # a reviewed image for an unreviewed full-size original.
        if (s.get('photo') and s.get('photo_source') != 'curated'
                and 'upload.wikimedia.org' in s['photo']):
            thumb = commons_thumb(s['photo'].split('?')[0])
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
