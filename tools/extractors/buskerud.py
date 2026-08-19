#!/usr/bin/env python3
"""Buskerud — one wide HTML matrix per year: school rows x programme columns, Vg1.

The page states no intake round, so `round` is None and the UI says so rather
than implying comparability with counties that do state it.

Footnotes (verbatim on the page) mark how a place was won, not the threshold:
  *   YSK dobbelkompetanse — interview + grades
  **  musikk/dans/drama — up to 50% on skill + grades
  *** toppidrett — up to 50% on skill + grades
so the number beside the asterisk is a real threshold and is kept.
"""
import os
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', '..', '..', 'poenggrenser', 'data', 'buskerud')

META = {
    'code': '33', 'fylke': 'Buskerud', 'round': None, 'rights': 'ungdomsrett',
    'free_choice': False, 'levels': 'Vg1',
    'round_note': 'the county does not state which intake round the figures are from',
    'source': 'https://bfk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/',
}


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    for fname in sorted(os.listdir(SRC), reverse=True):
        if not fname.endswith('.html'):
            continue
        m = re.search(r'(20\d\d)-20\d\d', fname)
        if not m:
            warn.append(f'{fname}: cannot read year')
            continue
        year = int(m.group(1))
        soup = BeautifulSoup(open(os.path.join(SRC, fname), encoding='utf-8',
                                  errors='replace').read(), 'lxml')
        rows = []
        for tb in soup.find_all('table'):
            trs = tb.find_all('tr')
            if len(trs) < 3:
                continue
            head = [common.canon_program(c.get_text(' ', strip=True))
                    for c in trs[0].find_all(['th', 'td'])]
            for tr in trs[1:]:
                tds = tr.find_all(['td', 'th'])
                school = common.squash(tds[0].get_text(' ', strip=True))
                if not school:
                    continue
                for i, td in enumerate(tds[1:], start=1):
                    if i >= len(head) or not head[i]:
                        continue
                    raw = common.squash(td.get_text(' ', strip=True))
                    # 2024-25 suppressed some thresholds entirely, leaving only
                    # the marker: admission there mixes skill/interview + grades
                    v = ('D' if raw in ('*', '**', '***')
                         else common.classify_cell(raw, min_value=0, loose=True))
                    if v is None:
                        continue
                    rows.append({'school': school, 'program': head[i],
                                 'level': common.guess_level(head[i], 'Vg1'),
                                 'values': {year: v},
                                 'county': META['fylke'], 'round': META['round']})
        out.append((fname, rows))
    return out, warn
