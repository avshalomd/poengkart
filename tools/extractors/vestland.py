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
        pages_parsed = 0
        for page in pdf.pages:
            words = page.extract_words()
            cols = _columns(words)
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


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    files = sorted((f for f in os.listdir(SRC) if f.endswith('.pdf')), reverse=True)
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
        cells = _parse(os.path.join(SRC, primary), warn)
        alt = (_parse(os.path.join(SRC, rounds['3']), warn)
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
    return out, warn
