#!/usr/bin/env python3
"""Oslo — one HTML table per school, Vg1, after the FIRST intake round.

Municipal schools only. The page's own footnotes define the symbols:
  *   "Til Vg1 musikk, dans og drama og Vg1 stud[iespesialisering med
      toppidrett] rangeres søkerne etter flere kriterier enn karakterer"  -> D
  **  "Alle/de aller fleste som hadde søkt på skolen kom inn."            -> open
  *** "Til IB rangeres søkerne etter flere kriterier enn karakterer."     -> D
"""
import os
import re
import sys

import pdfplumber
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', '..', '..', 'poenggrenser', 'data', 'oslo')

META = {
    'code': '03', 'fylke': 'Oslo', 'round': '1', 'rights': 'ungdomsrett',
    'free_choice': True, 'levels': 'Vg1',
    'note': 'municipal schools only',
    'source': ('https://www.oslo.kommune.no/skole-og-utdanning/videregaende-skole/'
               'soke-videregaende-skole/poengtabeller-for-videregaende-skoler-i-oslo/'),
}
SYMBOLS = {'*': 'D', '**': 'open', '***': 'D'}
# the PDF and HTML editions name the same school differently
SCHOOL_ALIASES = {
    'bjørnholt skole': 'Bjørnholt videregående skole',
    'oslo handelsgym.': 'Oslo Handelsgymnasium',
    'oslo handelsgym': 'Oslo Handelsgymnasium',
    'oslo handelsgymnasium': 'Oslo Handelsgymnasium',
    'vika videregående': 'Vika videregående skole',
}


def _school(name):
    n = common.squash(name)
    return SCHOOL_ALIASES.get(n.lower(), n)


VIGO_RE = re.compile(r'^\d{4}$')
CELL_RE = re.compile(r'^\d{1,2}(?:,\d{1,2})?$|^\*{1,3}$')


def _parse_pdf(path, year, warn):
    """2020-2025 editions are a wide matrix whose column headers are drawn
    rotated (bottom-to-top), so extract_words() shreds them. Columns are found
    from where the values actually sit, then each header is rebuilt from the
    glyphs standing above that column."""
    rows = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            words = page.extract_words()
            vigo = [w for w in words if VIGO_RE.match(common.norm(w['text'])) and w['x0'] < 60]
            if not vigo:
                continue
            first = min(w['top'] for w in vigo)
            cells = [w for w in words if w['top'] >= first - 2
                     and CELL_RE.match(common.norm(w['text']))
                     and (w['x0'] + w['x1']) / 2 > 100]
            centres = []
            for x in sorted((w['x0'] + w['x1']) / 2 for w in cells):
                if centres and x - centres[-1][-1] <= 8:
                    centres[-1].append(x)
                else:
                    centres.append([x])
            cols = [sum(c) / len(c) for c in centres]
            labels = {}
            for c in cols:
                band = [ch for ch in page.chars
                        if 55 < ch['top'] < first - 4
                        and c - 9 <= (ch['x0'] + ch['x1']) / 2 <= c + 9]
                # a long rotated label wraps into several vertical lines placed
                # side by side; group by x first, or the lines interleave
                sublines = []
                for ch in sorted(band, key=lambda ch: (ch['x0'] + ch['x1']) / 2):
                    cx = (ch['x0'] + ch['x1']) / 2
                    if sublines and cx - sublines[-1][-1][1] <= 3:
                        sublines[-1].append((ch, cx))
                    else:
                        sublines.append([(ch, cx)])
                parts = []
                for sub in sublines:
                    glyphs = sorted((ch for ch, _ in sub), key=lambda ch: -ch['top'])
                    txt = []
                    for i, ch in enumerate(glyphs):
                        # the page title sits above the header block: cut at the
                        # first big vertical gap so it cannot bleed into a label
                        if i and glyphs[i - 1]['top'] - ch['top'] > 12:
                            break
                        txt.append(ch['text'])
                    parts.append(''.join(txt))
                labels[c] = common.canon_program(''.join(parts))
            for w in vigo:
                line = sorted((x for x in words if abs(x['top'] - w['top']) < 3),
                              key=lambda x: x['x0'])
                name = common.squash(' '.join(
                    common.norm(x['text']) for x in line
                    if 30 < x['x0'] < 120 and not CELL_RE.match(common.norm(x['text']))))
                name = _school(re.sub(r'\bvg\.\s*skole$', 'videregående skole', name))
                if not name:
                    continue
                for x in line:
                    t = common.norm(x['text'])
                    if not CELL_RE.match(t) or (x['x0'] + x['x1']) / 2 <= 100:
                        continue
                    cx = (x['x0'] + x['x1']) / 2
                    col = min(cols, key=lambda c: abs(c - cx))
                    if abs(col - cx) > 12:
                        continue
                    program = labels.get(col)
                    if not program or len(program) < 4:
                        continue
                    v = SYMBOLS.get(t) or common.classify_cell(t, min_value=0)
                    if v is None:
                        continue
                    rows.append({'school': name, 'program': program,
                                 'level': common.guess_level(program, 'Vg1'),
                                 'values': {year: v}, 'county': META['fylke'],
                                 'round': META['round']})
    if not rows:
        warn.append(f'{os.path.basename(path)}: no rows parsed')
    return rows


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    for fname in sorted(os.listdir(SRC), reverse=True):
        m = re.search(r'(20\d\d)', fname)
        if not m:
            warn.append(f'{fname}: cannot read year')
            continue
        year = int(m.group(1))
        if fname.endswith('.pdf'):
            if '2inntak' in fname:          # the 2009 file is a 2. inntak table
                continue
            out.append((fname, _parse_pdf(os.path.join(SRC, fname), year, warn)))
            continue
        if not fname.endswith('.html'):
            continue
        soup = BeautifulSoup(open(os.path.join(SRC, fname), encoding='utf-8',
                                  errors='replace').read(), 'lxml')
        rows = []
        for tb in soup.find_all('table'):
            head = tb.find_previous(['h2', 'h3', 'h4'])
            school = _school(head.get_text(' ', strip=True)) if head else ''
            if 'skole' not in school.lower() and 'gymnas' not in school.lower():
                continue
            for tr in tb.find_all('tr')[1:]:
                tds = tr.find_all(['td', 'th'])
                if len(tds) < 2:
                    continue
                program = common.canon_program(tds[0].get_text(' ', strip=True))
                raw = common.squash(tds[1].get_text(' ', strip=True))
                v = SYMBOLS.get(raw) or common.classify_cell(raw, min_value=0, loose=True)
                if not program or v is None:
                    continue
                rows.append({'school': school, 'program': program,
                             'level': common.guess_level(program, 'Vg1'),
                             'values': {year: v},
                             'county': META['fylke'], 'round': META['round']})
        out.append((fname, rows))
    return out, warn
