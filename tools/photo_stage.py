#!/usr/bin/env python3
"""Download every candidate from photo_hunt.py, measure it, keep the ones that
could plausibly be a building photo, and record which one is best.

Rejects on measurement, not on hope: a 200x60 PNG is a logo whatever the
og:image tag calls it, and a 1:1 crop is a portrait or a badge. Candidates are
tried in score order, so the first one that measures up is the proposal.
"""
import concurrent.futures as cf
import hashlib
import io
import json
import os
import threading
import time
import urllib.request

from PIL import Image

STAGE = os.environ.get('PHOTO_STAGE', '/private/tmp/claude-501/'
                       '-Users-avshalom-projects/b6cc5fd7-b026-44c5-803f-f7c99fea7cf5/'
                       'scratchpad/photohunt')
IMGS = os.path.join(STAGE, 'img')
UA = {'User-Agent': 'poengkart/0.1 (school photo lookup)'}
# images a human already looked at and turned down (a class photo, a stock
# image, the wrong building). Without this every re-run re-proposes them.
REJECTED = set(json.load(open(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'photos-rejected.json'))))
MIN_W, MIN_H, MIN_AR, MAX_AR = 560, 300, 1.05, 3.6

# Wikimedia 429s a burst of parallel thumbnail requests and the failure looks
# exactly like a missing file, which is how 37 perfectly good free-licence
# school photos were nearly thrown away. Serialise and back off.
WM_LOCK = threading.Lock()


def measure(url):
    wikimedia = 'wikimedia.org' in url
    for attempt in range(3 if wikimedia else 1):
        try:
            if wikimedia:
                with WM_LOCK:
                    time.sleep(0.6 + attempt * 2.0)
                    req = urllib.request.Request(url, headers=UA)
                    blob = urllib.request.urlopen(req, timeout=30).read(15_000_000)
            else:
                req = urllib.request.Request(url, headers=UA)
                with urllib.request.urlopen(req, timeout=25) as r:
                    blob = r.read(15_000_000)
            im = Image.open(io.BytesIO(blob))
            im.load()
            return im, None
        except Exception as e:
            err = f'{type(e).__name__} {getattr(e, "code", "")}'.strip()
    return None, err


def grab(args):
    i, k, cand = args
    for u in (cand.get('url'), cand.get('url_big')):
        if u in REJECTED:
            return {**cand, 'ok': False, 'reason': 'turned down in review'}
    # the upsized rendition is cosmetic; never lose the school over it
    for url in [u for u in (cand.get('url_big'), cand.get('url')) if u][:2]:
        im, err = measure(url)
        if im is None:
            reason = err
            continue
        w, h = im.size
        ar = w / h if h else 0
        if w < MIN_W or h < MIN_H:
            reason = f'small {w}x{h}'
            continue
        if not (MIN_AR <= ar <= MAX_AR):
            reason = f'aspect {ar:.2f} ({w}x{h})'
            continue
        path = os.path.join(IMGS, f'{i:03d}_{k}.jpg')
        im.convert('RGB').resize((520, int(520 / ar)), Image.LANCZOS).save(path, quality=82)
        return {**cand, 'ok': True, 'final_url': url, 'w': w, 'h': h, 'thumb': path}
    return {**cand, 'ok': False, 'reason': reason}


def dedupe(rows):
    """Drop template art. A county CMS serves the same hero illustration on
    every one of its schools' sites (Akershus ships a cartoon of a person with
    a laptop), and it scores exactly as well as a real photo would. An image
    that appears for three or more different schools is furniture, not a
    photograph of any of them."""
    digest, count = {}, {}
    for r in rows:
        for c in r['tried']:
            if not c.get('ok') or not c.get('thumb') or not os.path.exists(c['thumb']):
                continue
            h = hashlib.md5(open(c['thumb'], 'rb').read()).hexdigest()
            c['hash'] = h
            digest.setdefault(h, set()).add(r['name'])
    shared = {h: len(names) for h, names in digest.items() if len(names) >= 3}
    for r in rows:
        for c in r['tried']:
            if c.get('hash') in shared:
                c['ok'] = False
                c['reason'] = f"boilerplate (same image on {shared[c['hash']]} schools)"
    if shared:
        print(f'{len(shared)} template images dropped, '
              f'{sum(shared.values())} school slots freed')
    return rows


def repick(rows):
    for r in rows:
        oks = [c for c in r['tried'] if c.get('ok')]
        r['best'] = oks[0] if oks else None
        r['alts'] = oks[1:4]
    return rows


def main():
    os.makedirs(IMGS, exist_ok=True)
    rows = json.load(open(os.path.join(STAGE, 'candidates.json')))
    jobs = []
    for i, r in enumerate(rows):
        cands = sorted([c for c in r['candidates'] if c.get('url')],
                       key=lambda c: -c.get('score', 0))
        for k, c in enumerate(cands):
            jobs.append((i, k, c))
    print(f'{len(jobs)} candidate images from {len(rows)} schools')
    done = {}
    with cf.ThreadPoolExecutor(max_workers=10) as ex:
        for job, res in zip(jobs, ex.map(grab, jobs)):
            done.setdefault(job[0], []).append(res)
    # Wikimedia still 429s under any parallelism, and those are the free-licence
    # photos we most want to keep, so give them a slow serial second chance.
    retry = [(i, k, c) for i, cs in done.items() for k, c in enumerate(cs)
             if not c['ok'] and 'wikimedia.org' in (c.get('url') or '')]
    if retry:
        print(f'retrying {len(retry)} rate-limited Wikimedia images serially')
        for i, k, c in retry:
            time.sleep(1.5)
            done[i][k] = grab((i, f'{k}r', c))
            print(f"   {'ok  ' if done[i][k]['ok'] else 'fail'} {rows[i]['name'][:36]}")

    for i, r in enumerate(rows):
        r['tried'] = done.get(i, [])
    repick(dedupe(rows))
    json.dump(rows, open(os.path.join(STAGE, 'staged.json'), 'w'),
              ensure_ascii=False, indent=1)
    have = [r for r in rows if r['best']]
    import collections
    print(f'{len(have)}/{len(rows)} schools have a measurable landscape image')
    print(collections.Counter(r['best']['tier'] for r in have))
    for r in rows:
        if not r['best']:
            why = '; '.join(f"{c['tier']}:{c.get('reason')}" for c in r['tried'][:3]) or 'no candidates'
            print(f"  MISS {r['fylke']:<10} {r['name'][:34]:<36} {why[:70]}")


if __name__ == '__main__':
    main()
