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

import collections
import json
import os
import re
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'web', 'data', 'schools.json')
AUTO = os.path.join(HERE, 'photos-auto.json')
REJECTED = os.path.join(HERE, 'photos-rejected.json')

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


# Probe verdicts survive across runs: a rendition URL that served an image
# once is immutable for practical purposes, and re-asking for ~200 of them —
# each Wikimedia probe behind a mandatory politeness sleep — cost four minutes
# of every refresh while changing nothing. Only positives are cached; a
# refusal is retried next run, and link rot is photo_check.py's job.
_PROBE_CACHE = os.path.join(HERE, '.cache', 'photo-probe.json')
try:
    _PROBE_OK = set(json.load(open(_PROBE_CACHE)))
except (OSError, ValueError):
    _PROBE_OK = set()
_PROBE_DIRTY = False


def _save_probes():
    if _PROBE_DIRTY:
        os.makedirs(os.path.dirname(_PROBE_CACHE), exist_ok=True)
        tmp = _PROBE_CACHE + '.tmp'
        json.dump(sorted(_PROBE_OK), open(tmp, 'w'))
        os.replace(tmp, _PROBE_CACHE)


def _serves_image(url):
    """Wikimedia rate-limits probes hard, and a 429 is indistinguishable from
    "this width is not served" — which silently keeps the oversized original.
    Retry before believing a refusal."""
    global _PROBE_DIRTY
    if url in _PROBE_OK:
        return True
    wiki = 'upload.wikimedia.org' in url
    for attempt in range(4):
        # the pause is Wikimedia's price of admission; county servers do not
        # need it, and 150 of them at a second each is a long build
        if wiki or attempt:
            time.sleep(1.0 + attempt * 3.0)
        try:
            r = urllib.request.urlopen(urllib.request.Request(
                url, headers={'User-Agent': 'poengkart/0.1 (prototype)',
                              'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8'}),
                timeout=30)
            ok = r.status == 200 and r.headers.get('content-type', '').startswith('image')
            if ok:
                _PROBE_OK.add(url)
                _PROBE_DIRTY = True
            return ok
        except Exception as e:
            if getattr(e, 'code', None) != 429:
                return False
    return False


# The header this photo lands in is 168 px tall and at most 480 px wide, so a
# 2x phone is served by roughly a thousand pixels. Counties were handing over
# their originals instead — one of them 7.9 MB — and a family on mobile data
# paid for every one of them. Ask each host for a display-sized rendition; the
# result is checked before it is kept, so a host that ignores the request just
# keeps its original URL.
DISPLAY_W = 960


def shrink_url(url):
    if 'upload.wikimedia.org' in url:
        return re.sub(r'/\d+px-', f'/{DISPLAY_W}px-', url)
    if 'v.imgi.no' in url:
        return re.sub(r'__w=\d+', f'__w={DISPLAY_W}', url)
    # Rogaland's bv.ashx renditions are signed: a width in the path 404s and a
    # width in the query is ignored, so there is nothing to ask for.
    if '/bv.ashx/' in url:
        return url
    p = urllib.parse.urlparse(url)
    if not p.path.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
        return url
    q = urllib.parse.parse_qs(p.query)
    q['width'] = [str(DISPLAY_W)]
    q['quality'] = ['75']
    if p.path.lower().endswith('.png'):
        q['format'] = ['jpg']          # a photograph has no business being a PNG
    return urllib.parse.urlunparse(p._replace(query=urllib.parse.urlencode(q, doseq=True)))


def commons_thumb(url, width=DISPLAY_W):
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


REJECTED_URLS = set(json.load(open(REJECTED))) if os.path.exists(REJECTED) else set()


def load_auto():
    if not os.path.exists(AUTO):
        return {}
    raw = json.load(open(AUTO))
    # A photo can be rejected in review after it was staged. photo_stage.py
    # checks the list when it proposes candidates, which is too early to help
    # anything already accepted, so the list is enforced here as well — where
    # it decides what actually gets published.
    return {name: {k: v for k, v in e.items() if k != 'source'}
            for name, e in raw.items() if e.get('photo') not in REJECTED_URLS}


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
        # A photo can also reach the dataset from an earlier run — build_dataset
        # carries photo fields across rebuilds — so a rejection has to take one
        # away, not merely decline to add it.
        if s.get('photo') in REJECTED_URLS and name not in OVERRIDES:
            for field in ('photo', 'photo_page', 'photo_credit',
                          'photo_license', 'photo_position'):
                s.pop(field, None)
            s.pop('photo_source', None)
            changed.append(f'{name}: photo withdrawn (on the reject list)')
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
        # ...and every other host is asked for a display-sized rendition too
        if s.get('photo'):
            small = shrink_url(s['photo'])
            if small != s['photo'] and _serves_image(small):
                s['photo'] = small
                changed.append(f'{name}: display-sized photo')

    json.dump(data, open(DATA, 'w'), ensure_ascii=False, indent=1)
    _save_probes()
    have = sum(1 for s in data['schools'] if s.get('photo'))
    print(f'{len(changed)} changes; {have}/{len(data["schools"])} schools have a photo')
    for c in changed:
        print('  ', c)
    # A new county's schools arrive photo-less BY DESIGN (nothing publishes
    # without review), and that has now been missed more than once because
    # nothing said so. Say so, loudly, with the counties named.
    missing = collections.Counter(s['fylke'] for s in data['schools'] if not s.get('photo'))
    if missing:
        print('PHOTO GAP: ' + ', '.join(f'{f}: {n}' for f, n in missing.most_common())
              + ' schools without a photo — run photo_hunt/photo_stage/photo_sheets, '
                'review the sheets, then photo_accept')


if __name__ == '__main__':
    main()
