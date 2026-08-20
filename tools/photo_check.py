#!/usr/bin/env python3
"""Verify every published photo still serves, and lay them all out for audit.

County CMS URLs rot: images are re-uploaded under a new GUID when a page is
edited, and the old one starts 404ing without anything else changing. This
catches that before a visitor does. --sheets also renders every published
photo as contact sheets, so the whole published set can be re-checked by eye
(right school? no identifiable pupils?) in one sitting.
"""
import concurrent.futures as cf
import io
import json
import os
import sys
import threading
import time
import urllib.request

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'web', 'data', 'schools.json')
STAGE = os.environ.get('PHOTO_STAGE', '/private/tmp/claude-501/'
                       '-Users-avshalom-projects/b6cc5fd7-b026-44c5-803f-f7c99fea7cf5/'
                       'scratchpad/photohunt')
OUT = os.path.join(STAGE, 'published')
UA = {'User-Agent': 'poengkart/0.1 (photo link check)',
      'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8'}
# Wikimedia 429s a burst of parallel requests, and a 429 here reads exactly
# like a dead link — which would send someone hunting for a replacement photo
# that was never missing. Serialise those.
WM_LOCK = threading.Lock()


def fetch_bytes(url):
    if 'wikimedia.org' not in url:
        with urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=25) as r:
            return r.read(15_000_000), r.headers.get('content-type', '')
    for attempt in range(4):
        try:
            with WM_LOCK:
                time.sleep(1.0 + attempt * 4.0)
                with urllib.request.urlopen(
                        urllib.request.Request(url, headers=UA), timeout=30) as r:
                    return r.read(15_000_000), r.headers.get('content-type', '')
        except Exception as e:
            err = e
    raise err


def check(s):
    try:
        blob, ctype = fetch_bytes(s['photo'])
        im = Image.open(io.BytesIO(blob))
        im.load()
        if '--sheets' in sys.argv:
            os.makedirs(OUT, exist_ok=True)
            ar = im.width / im.height
            im.convert('RGB').resize((520, int(520 / ar)), Image.LANCZOS).save(
                os.path.join(OUT, f"{s['name'][:40].replace('/', '-')}.jpg"), quality=82)
        return s, None, f'{im.width}x{im.height} {ctype}'
    except Exception as e:
        code = getattr(e, 'code', None)
        # 429 is Wikimedia throttling *us*; the file is fine (browsers load it).
        # Reporting it as a dead link would send someone hunting for a
        # replacement photo that was never missing.
        kind = 'THROTTLED' if code == 429 else 'DEAD'
        return s, (kind, f'{type(e).__name__} {code or ""}'.strip()), ''


def main():
    data = json.load(open(DATA))
    have = [s for s in data['schools'] if s.get('photo')]
    print(f'{len(have)}/{len(data["schools"])} schools have a photo')
    bad, throttled = [], []
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for s, err, ok in ex.map(check, have):
            if err:
                kind, detail = err
                (throttled if kind == 'THROTTLED' else bad).append((s, detail))
                print(f"  {kind:<9} {s['fylke']:<10} {s['name'][:34]:<36} {detail}")
    missing = [s for s in data['schools'] if not s.get('photo')]
    for s in missing:
        print(f"  none {s['fylke']:<10} {s['name'][:34]:<36} "
              f"{s.get('photo_note', '')[:50]}")
    print(f'\n{len(bad)} dead, {len(throttled)} throttled (not a problem), '
          f'{len(missing)} without a photo')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
