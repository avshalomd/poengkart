#!/usr/bin/env python3
"""Turn reviewed candidates into tools/photos-auto.json.

Only indices listed in DECISIONS (reviewed on the contact sheets) are written.
Nothing here is automatic: a school with a candidate that was not reviewed and
accepted stays without a photo, which is the correct outcome — a wrong or
pupil-featuring photo is worse than the location map we fall back to.

Usage:  photo_accept.py <accepted.json>
        accepted.json = {"accept": [0, 3, 7, ...], "alt": {"12": 1}, "top": [4, 9]}
          accept — staged index to publish
          alt    — publish alternate candidate N instead of `best`
          top    — needs object-position:top (subject high, people low)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'photos-auto.json')
STAGE = os.environ.get('PHOTO_STAGE', '/private/tmp/claude-501/'
                       '-Users-avshalom-projects/b6cc5fd7-b026-44c5-803f-f7c99fea7cf5/'
                       'scratchpad/photohunt')

# who to credit when the photo is the school's own, off its own website
OWNER = {'Oslo': 'Oslo kommune / Utdanningsetaten'}


def owner(fylke):
    return OWNER.get(fylke, f'{fylke} fylkeskommune')


def full_name(school_name):
    """Counties publish short names ("Bjertnes"); a credit line should carry
    the school's registered name."""
    for s in json.load(open(os.path.join(HERE, '..', 'web', 'data',
                                         'schools.json')))['schools']:
        if s['name'] == school_name:
            nsr = s.get('nsr_name') or ''
            return nsr if nsr and not nsr.startswith('(') else school_name
    return school_name


def main():
    dec = json.load(open(sys.argv[1]))
    # merge: review happens in rounds, and an earlier round's decisions stand
    out_existing = json.load(open(OUT)) if os.path.exists(OUT) else {}
    rows = json.load(open(os.path.join(STAGE, 'staged.json')))
    alt = {int(k): v for k, v in (dec.get('alt') or {}).items()}
    top = set(dec.get('top') or [])
    out = {}
    for i in dec['accept']:
        r = rows[i]
        c = r['alts'][alt[i] - 1] if i in alt else r['best']
        if not c:
            print(f'  !! index {i} ({r["name"]}) has no image — skipped')
            continue
        e = {'photo': c.get('final_url') or c['url'], 'source': c['tier']}
        if c['tier'] in ('wikipedia', 'commons'):
            e['page'] = c.get('page')
            e['credit'] = c.get('credit') or 'Wikimedia Commons'
            e['license'] = c.get('license') or 'se Commons'
            if c.get('wiki_url'):
                e['wiki_url'] = c['wiki_url']
            if c.get('wiki_extract'):
                e['wiki_extract'] = c['wiki_extract']
        else:
            e['page'] = r['site'] if str(r['site']).startswith('http') \
                else 'https://' + str(r['site']).lstrip('/')
            e['credit'] = f"Foto: {full_name(r['name'])} / {owner(r['fylke'])}"
            e['license'] = f"© {owner(r['fylke'])}"
        if i in top:
            e['position'] = 'top'
        out[r['name']] = e
    merged = {**out_existing, **out}
    json.dump(dict(sorted(merged.items())), open(OUT, 'w'),
              ensure_ascii=False, indent=1)
    print(f'{len(out)} accepted this round; {len(merged)} reviewed photos -> {OUT}')


if __name__ == '__main__':
    main()
