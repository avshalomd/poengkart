#!/usr/bin/env python3
"""Backfill photographer and licence for every Wikimedia photo in the registry.

Commons images are almost all CC-licensed, and those licences require naming
the author — a bare "Wikimedia Commons" credit does not discharge that. The
harvester asks for `extmetadata` as it goes, but when Commons rate-limits that
call it falls back to the generic label, so this fills the gaps afterwards.
Serialised on purpose: Commons 429s bursts, and a 429 here looks like a file
with no author.
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
AUTO = os.path.join(HERE, 'photos-auto.json')
UA = {'User-Agent': 'poengkart/0.1 (photo attribution)'}


def api(params):
    url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            time.sleep(0.8 + attempt * 3.0)
            with urllib.request.urlopen(
                    urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except Exception as e:
            if getattr(e, 'code', None) != 429:
                return None
    return None


def main():
    auto = json.load(open(AUTO))
    todo = [(k, v) for k, v in auto.items()
            if 'upload.wikimedia.org' in (v.get('photo') or '')
            and not (v.get('credit') or '').startswith('Foto:')]
    print(f'{len(todo)} Wikimedia photos without a named photographer')
    fixed = 0
    for name, e in todo:
        m = re.search(r'/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/]+)', e['photo'])
        if not m:
            print(f'  ?? {name}: cannot derive the file name')
            continue
        fname = urllib.parse.unquote(m.group(1))
        d = api({'action': 'query', 'format': 'json', 'titles': f'File:{fname}',
                 'prop': 'imageinfo', 'iiprop': 'url|extmetadata'})
        if not d:
            print(f'  !! {name}: Commons would not answer')
            continue
        pages = list((d.get('query') or {}).get('pages', {}).values())
        info = (pages[0].get('imageinfo') or [{}])[0] if pages else {}
        ex = info.get('extmetadata') or {}
        artist = re.sub(r'<[^>]+>', '', (ex.get('Artist') or {}).get('value', '')).strip()
        artist = re.sub(r'\s+', ' ', artist)
        lic = (ex.get('LicenseShortName') or {}).get('value', '')
        if artist:
            e['credit'] = f"Foto: {artist}{' (' + lic + ')' if lic else ''}"
            fixed += 1
        if lic:
            e['license'] = lic
        if info.get('descriptionurl'):
            e['page'] = info['descriptionurl']
        print(f"  {name}: {e.get('credit')}")
    json.dump(dict(sorted(auto.items())), open(AUTO, 'w'), ensure_ascii=False, indent=1)
    print(f'{fixed}/{len(todo)} now name their photographer')


if __name__ == '__main__':
    main()
