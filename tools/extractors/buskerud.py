#!/usr/bin/env python3
"""Buskerud — one wide HTML matrix per year: school rows x programme columns, Vg1.

The page states no intake round, so `round` is None and the UI says so rather
than implying comparability with counties that do state it.

Footnotes (verbatim on the page) mark how a place was won, not the threshold:
  *   YSK dobbelkompetanse — interview + grades
  **  musikk/dans/drama — up to 50% on skill + grades
  *** toppidrett — up to 50% on skill + grades
so the number beside the asterisk is a real threshold and is kept.

2012-2014 come from the county's «Statistikkhefte – inntak til videregående
opplæring», chapter 4 «Nedre poenggrense for inntak til Vg1», whose table is a
scanned image; it is read from a hand transcription of the page
(`buskerud-<year>-1inntak.transcribed.csv`, see common.read_transcription).
Those editions state their round: «1. inntak» (2012/13), «hovedinntaket» (the
main intake, 2013/14 and 2014/15), so their rows carry round '1' while the
county's current pages state none. Their symbols, from the booklet's legend:
  alle / Alle        everyone who applied was admitted -> open (a number
                     printed beside it is the lowest admitted, not a cutoff)
  M, Da, Dr          the music, dance and drama queues
  Q, E, N            forskerlinje, entreprenørskap, internasjonalisering
  D-fotb, E-hånd(b), T-BHT, U-uthold./U-L-S   Drammen's four sport queues,
                     which the county names «toppidrett, fotball / håndball /
                     bandy/hopp/turn / langrenn/svømming» today; U- is one
                     queue under two labels (utholdenhet, then L-S)
  YSK, Stud          the 4-year YSK model and the studiekompetanse variant
  FL                 printed at Ål's Naturbruk without explanation; ignored
The booklet says the MDD thresholds, and Drammen's and Ringerike's sport
thresholds, are for applicants without tilleggspoeng; so are today's.
"""
import os
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'sources', 'buskerud')

# one queue inside a shared cell: a figure, an optional «(+ tilleggspoeng)», the
# queue's own name, the footnote asterisks
QUEUE = re.compile(r'(\d{1,2},\d)\s*(?:\(\+ tilleggspoeng\)\s*)?([^\d*][^*]*?)\s*\**')

META = {
    'code': '33', 'fylke': 'Buskerud', 'round': None, 'rights': 'ungdomsrett',
    'free_choice': False, 'levels': 'Vg1',
    'round_note': 'the county does not state which intake round the figures are from',
    'source': 'https://bfk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/',
}


# 2012-14: the booklet's short names, where today's name differs
OLD_SCHOOLS = {'Rosthaug': 'Buskerud'}
# Røyken was a Buskerud school then and is filed under Akershus today; the
# school, not the county, is the series' identity
MOVED = {'Røyken': 'Akershus'}
OLD_COLUMNS = {
    'studiespes. med formgiving': 'Studiespesialisering med formgivingsfag',
    'studiespes. medformgiving': 'Studiespesialisering med formgivingsfag',
    'teknikk og industriell prod.': 'Teknikk og industriell produksjon',
    'helse og sosialfag': 'Helse- og sosialfag',
    'musikk dans og drama': 'Musikk, dans og drama',
}
QUEUES = {
    'Musikk, dans og drama': [(r'^(M|Mu)$', 'musikk'), (r'^(D|Da)$', 'dans'),
                              (r'^(Dr|DR|Dra)$', 'drama')],
    'Idrettsfag': [(r'^D-\s*fotb', 'toppidrett, fotball'), (r'^E-\s*hånd', 'toppidrett, håndball'),
                   (r'^T-\s*B\s*H\s*T', 'toppidrett, bandy/hopp/turn'),
                   (r'^U-', 'toppidrett, langrenn/svømming')],
    'Studiespesialisering': [(r'^Q', 'forskerlinje'), (r'^E$', 'entreprenørskap'),
                             (r'^N$', 'internasjonalisering')],
    'Helse- og oppvekstfag': [(r'^YSK$', 'YSK 4 år'), (r'^Stud$', 'studiekompetanse')],
    'Service og samferdsel': [(r'^YSK$', 'YSK 4 år')],
    'Naturbruk': [(r'^FL$', None)],
}
PRINTED = re.compile(r'^(?P<num>\d{1,2}(?:[.,]\d{1,2})?)?\s*(?P<alle>alle)?\s*(?P<mark>.*)$', re.I)


def _booklet(path, warn):
    meta, cells = common.read_transcription(path)
    rnd = common.stated_round(meta)
    rows = []
    for c in cells:
        col = common.squash(c['program'])
        program = common.canon_program(OLD_COLUMNS.get(col.lower(), col))
        m = PRINTED.match(common.squash(c['printed']))
        if not m or not (m.group('num') or m.group('alle')):
            warn.append(f'{os.path.basename(path)}: unread cell {c["school"]} {col} {c["printed"]!r}')
            continue
        mark = m.group('mark').strip()
        if mark:
            rules = QUEUES.get(str(program), [])
            hit = next((q for pat, q in rules if re.search(pat, mark)), False)
            if hit is False:
                warn.append(f'{os.path.basename(path)}: unknown marker {mark!r} at {c["school"]} {col}')
                continue
            if hit:
                program = common.canon_program(f'{program}, {hit}')
        v = 'open' if m.group('alle') else float(m.group('num').replace(',', '.'))
        school = OLD_SCHOOLS.get(c['school'], c['school'])
        row = {'school': school, 'program': program,
               'level': common.guess_level(str(program), 'Vg1'),
               'values': {c['year']: v},
               'county': MOVED.get(school, META['fylke']), 'round': rnd}
        if school in MOVED:
            # the figure was set in Buskerud's intake: the model counts it in
            # Buskerud's year, and the school's page says whose table it is
            row['former_county'] = META['fylke']
        rows.append(row)
    return rows


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    for fname in sorted(os.listdir(SRC), reverse=True):
        if fname.endswith('.transcribed.csv'):
            out.append((fname, _booklet(os.path.join(SRC, fname), warn)))
            continue
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
                    # One cell, several queues: «51,3 fotball / 46,5 håndball /
                    # 35,7 bandy/hopp/turn / 39,8 langrenn/svømming***» is four
                    # admissions, and «35,0 (+ tilleggspoeng) musikk / 39,2 … dans
                    # / 41,1 … drama**» three. Reading the cell as one number kept
                    # the first, so Drammen's toppidrett stood at the football
                    # figure, the highest of four. Each queue is its own row, named
                    # as the other counties name theirs («…, musikk», «…, dans»).
                    queues = [QUEUE.fullmatch(part) for part in raw.split(' / ')]
                    if len(queues) > 1 and all(queues):
                        for m in queues:
                            rows.append({'school': school, 'program': f'{head[i]}, {m.group(2)}',
                                         'level': common.guess_level(head[i], 'Vg1'),
                                         'values': {year: float(m.group(1).replace(',', '.'))},
                                         'county': META['fylke'], 'round': META['round']})
                        continue
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
