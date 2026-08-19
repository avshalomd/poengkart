#!/usr/bin/env python3
"""Cache Udir's Grep registry: programområdekode -> official name.

Trøndelag's PDFs key their columns by Grep code (BABAT1----), and the codes are
the only unambiguous programme identifier any county publishes. Cached to
tools/grep-programomraader.json so builds stay offline and reproducible.
"""
import json
import os
import urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'grep-programomraader.json')
URL = 'https://data.udir.no/kl06/v201906/programomraader'


def main():
    req = urllib.request.Request(URL, headers={'User-Agent': 'poengkart/0.1',
                                               'Accept': 'application/json'})
    data = json.load(urllib.request.urlopen(req, timeout=90))
    out = {}
    for e in data:
        code = e.get('kode')
        if not code:
            continue
        titles = {t['spraak']: t['verdi'] for t in e.get('tittel', [])}
        out[code] = {
            'nob': titles.get('nob') or titles.get('default'),
            'nno': titles.get('nno'),
            'eng': titles.get('eng'),
        }
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print(f'{len(out)} programområder -> {OUT}')


if __name__ == '__main__':
    main()
