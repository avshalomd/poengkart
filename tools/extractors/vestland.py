#!/usr/bin/env python3
"""Vestland — the deepest archive in Norway: 2020/21 through 2026/27.

Simple three-column PDFs (skule | programområde | nedre poenggrense) at fixed
x-positions, published for BOTH 1. and 3. inntaksomgang. We take 1. inntak as
the canonical series — it is the round Oslo and Akershus also publish, so a
future "compare on round 1" view can span all three — and keep 3. inntak in
`values_r3`.

The PDFs state their own scope: "Nedre poenggrense på vg1 gjeld alle med
ungdomsrett i sitt inntaksområde" — Vestland uses intake areas, so a threshold
applies to applicants resident in that area, not to everyone in the county.
"""
import os
import re
import sys

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', '..', '..', 'poenggrenser', 'data', 'vestland')

META = {
    'code': '46', 'fylke': 'Vestland', 'round': '1', 'rights': 'ungdomsrett',
    'free_choice': False,          # inntaksområde
    'levels': 'Vg1 (+ later levels where listed)',
    'source': ('https://www.vestlandfylke.no/utdanning-og-karriere/elev/'
               'soknad-inntak/test-poenggrenser/'),
    'also_publishes': '3. inntak (kept in values_r3)',
    'round_note': ('1. inntak for every year except 2023, where the county '
                   'published only a 3. inntak file'),
}
LEVEL_RE = re.compile(r'^Vg\s?([1-4])\b', re.I)


def _cluster(words, tol=2.5):
    lines, cur, last = [], [], None
    for w in sorted(words, key=lambda w: (w['top'], w['x0'])):
        if last is None or w['top'] - last <= tol:
            cur.append(w)
        else:
            lines.append(cur)
            cur = [w]
        last = w['top']
    if cur:
        lines.append(cur)
    return lines


def _columns(words):
    """x-positions of the header columns, across three layout generations:
       2021-22  Skole navn | Programområde navn | Vg1  | Nedre poenggrense
       2022-26  Skule namn | Programområde namn | Nivå | Nedre poenggrense
       2025-26  Skule namn | Programområde namn |      | Nedre poenggrense
    """
    prog = niva = val = school = None
    for w in words:
        t = common.norm(w['text'])
        tl = t.lower()
        if tl.startswith('programområde'):
            prog = w['x0']
        elif tl in ('nivå', 'vg1', 'nivaa'):
            niva = w['x0']
        elif tl == 'nedre':
            val = w['x0']
        elif tl in ('skule', 'skole') and school is None:
            school = w['x0']
    if prog is None or val is None:
        return None
    # a Nivå column only counts if it sits between programme and value
    if niva is not None and not (prog < niva < val):
        niva = None
    return {'school': school or 0, 'program': prog, 'niva': niva, 'value': val}


def _parse(path, warn):
    """-> {(school, program, level): value}"""
    found, level = {}, 'Vg1'
    with pdfplumber.open(path) as pdf:
        pages_parsed, cols = 0, None
        for page in pdf.pages:
            words = page.extract_words()
            # the header is printed only on the first page of each Vg block;
            # carry the last-seen geometry forward or 2/3 of every file is lost
            cols = _columns(words) or cols
            if not cols:
                continue
            pages_parsed += 1
            for line in _cluster(words):
                text = common.squash(' '.join(common.norm(w['text']) for w in line))
                if not text:
                    continue
                m = LEVEL_RE.match(text)
                if m:
                    level = f'Vg{m.group(1)}'
                    continue
                low = text.lower()
                if low.startswith(('skule', 'skole', 'oversikt', 'nedre poenggrense')):
                    continue
                toks = sorted(line, key=lambda w: w['x0'])
                # take the value from the RIGHT: the header's Nivå and Nedre
                # columns sit 23pt apart while their data does not, so an
                # x-boundary swallows the level digit into the value
                val, vi = None, None
                for k in range(1, min(4, len(toks)) + 1):
                    cand = common.squash(' '.join(common.norm(w['text']) for w in toks[-k:]))
                    c = common.classify_cell(cand, min_value=0)
                    if c is not None:
                        val, vi = c, len(toks) - k
                if val is None or vi is None or vi == 0:
                    continue
                body = toks[:vi]
                row_level = level
                if body and common.norm(body[-1]['text']) in ('1', '2', '3', '4') \
                        and body[-1]['x0'] > cols['program']:
                    row_level = f'Vg{common.norm(body[-1]["text"])}'
                    body = body[:-1]
                school = common.squash(' '.join(
                    common.norm(w['text']) for w in body if w['x0'] < cols['program'] - 4))
                program = common.canon_program(' '.join(
                    common.norm(w['text']) for w in body if w['x0'] >= cols['program'] - 4))
                if not school or not program:
                    continue
                v = val
                found[(school, program, row_level)] = v
        if not pages_parsed:
            warn.append(f'{os.path.basename(path)}: no parsable header found '
                        f'(rotated-text layout?) — skipped')
    return found



def _matrix(path, warn):
    """The 2020/21 editions are not the later three-column list at all: they
    are a wide grid, schools down the side and programmes written up the page
    as rotated column headers. The grid is ruled, so the cells come out cleanly
    — the work is rebuilding each header from its glyphs, read bottom-to-top.

    As everywhere in this county, the header is drawn only on the first page of
    a block and the continuation pages carry none, so the geometry has to be
    carried forward or the tail of the document is silently lost.
    """
    found, cols = {}, None
    settings = {'vertical_strategy': 'lines', 'horizontal_strategy': 'lines'}
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            tables = page.find_tables(settings)
            if not tables:
                continue
            tbl = tables[0]
            rows = tbl.extract()
            header_here = rows and len(rows) > 1 and (rows[1][0] or '').strip() == 'Skulenamn'
            if header_here:
                band = tbl.rows[0].cells
                top, bottom = band[0][1], band[0][3]
                cols = []
                for i, cell in enumerate(band[1:], 1):
                    if not cell:
                        continue
                    x0, _, x1, _ = cell
                    ch = [c for c in page.chars if top - 1 <= c['top'] <= bottom + 1
                          and x0 - 1 <= (c['x0'] + c['x1']) / 2 <= x1 + 1]
                    ch.sort(key=lambda c: (-c['top'], c['x0']))
                    label = common.squash(''.join(c['text'] for c in ch))
                    if label:
                        cols.append((i, label))
            if not cols:
                continue
            for row in rows[2 if header_here else 0:]:
                school = common.squash(row[0] or '')
                if not school or school == 'Skulenamn':
                    continue
                for i, program in cols:
                    if i >= len(row):
                        continue
                    v = common.classify_cell(row[i] or '', loose=True)
                    if v is not None:
                        found[(school, common.canon_program(program), 'Vg1')] = v
    return found



# --- Hordaland, the county Vestland replaced in 2020 -------------------------
# Two press releases survive only in the Wayback Machine. They cover far less
# than the later series — Vg1 studiespesialisering, public schools in the
# Bergen area, 1. inntaksomgang — but each one prints last year's figure beside
# this year's, so the pair carries 2017, 2018 and 2019. The 2018 column appears
# in both files and agrees to the decimal, which is the cross-check that makes
# them safe to use.
HORDALAND = {
    'hordaland_2019_1inntak_bergen-st.pdf': 2019,
    'hordaland_2018_1inntak_bergen-st.pdf': 2018,
}
# the press releases use short forms; the register names are what we publish
HORDALAND_NAMES = {
    'amalie skram vgs': 'Amalie Skram videregående skole',
    'arna vgs': 'Arna vidaregåande skule',
    'askøy vgs': 'Askøy videregående skole',
    'bergen katedralskole': 'Bergen katedralskole',
    'fyllingsdalen vgs': 'Fyllingsdalen videregående skole',
    'knarvik vgs': 'Knarvik vidaregåande skule',
    'langhaugen vgs': 'Langhaugen videregående skole',
    'nordahl grieg vgs': 'Nordahl Grieg videregående skole',
    'olsvikåsen vgs': 'Olsvikåsen videregående skole',
    'os gymnas': 'Os gymnas',
    'osterøy vgs': 'Osterøy vidaregåande skule',
    'sandsli vgs': 'Sandsli videregående skole',
    'sotra vgs': 'Sotra vidaregåande skule',
    'tertnes vgs': 'Tertnes vidaregåande skule',
    'årstad vgs': 'Årstad videregående skole',
}
# "Amalie Skram vgs 49,40: « (i fjor: 48,80)" and
# "Amalie Skram videregående skole: 48,3 (i fjor 49,4)" are the same line in
# two years' house styles. One period-for-comma typo is in the source.
HORD_RE = re.compile(
    r'^(?P<name>[^:0-9]+?)[:\s]+(?P<now>\d{2}[.,]\d{1,2})\s*(?:poeng)?\s*[:«\s]*'
    r'\(i fjor:?\s*(?P<prev>\d{2}[.,]\d{1,2})\)')


def _hordaland_name(raw):
    n = common.squash(raw).rstrip(':').strip()
    n = re.sub(r'\bvidereg[åa]ende skole$|\bvidareg[åa]ande skule$|\bvgs\.?$', 'vgs', n, flags=re.I)
    n = re.sub(r'\s+', ' ', n).strip().lower()
    return HORDALAND_NAMES.get(n)


def _hordaland(path, year, warn):
    rows = []
    with pdfplumber.open(path) as pdf:
        text = '\n'.join((p.extract_text() or '') for p in pdf.pages)
    for line in text.split('\n'):
        m = HORD_RE.match(common.squash(line))
        if not m:
            continue
        name = _hordaland_name(m.group('name'))
        if not name:
            warn.append(f'{os.path.basename(path)}: unknown school {m.group("name")!r}')
            continue
        for y, g in ((year, 'now'), (year - 1, 'prev')):
            v = common.classify_cell(m.group(g).replace('.', ','))
            if v is None:
                continue
            rows.append({'school': name, 'program': 'Studiespesialisering',
                         'level': 'Vg1', 'values': {y: v},
                         'county': META['fylke'], 'round': '1'})
    if not rows:
        warn.append(f'{os.path.basename(path)}: no rows parsed')
    return rows


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    files = sorted((f for f in os.listdir(SRC)
                    if f.endswith('.pdf') and f not in HORDALAND), reverse=True)
    by_year = {}
    for fname in files:
        m = re.search(r'(20\d\d)-\d\d_(\d)inntak', fname)
        if not m:
            warn.append(f'{fname}: cannot read year/round from filename')
            continue
        by_year.setdefault(int(m.group(1)), {})[m.group(2)] = fname

    for year in sorted(by_year, reverse=True):
        rounds = by_year[year]
        primary = rounds.get('1') or rounds.get('3')
        read = _matrix if year <= 2020 else _parse
        cells = read(os.path.join(SRC, primary), warn)
        alt = (read(os.path.join(SRC, rounds['3']), warn)
               if ('1' in rounds and '3' in rounds) else {})
        rows = []
        if not cells:
            continue
        for (school, program, level), v in cells.items():
            row = {'school': school, 'program': program, 'level': level,
                   'values': {year: v}, 'county': META['fylke'],
                   'round': '1' if '1' in rounds else '3'}
            if (school, program, level) in alt:
                row['values_r3'] = {year: alt[(school, program, level)]}
            rows.append(row)
        out.append((primary, rows))

    for fname, year in HORDALAND.items():
        path = os.path.join(SRC, fname)
        if os.path.exists(path):
            out.append((fname, _hordaland(path, year, warn)))
    return out, warn
