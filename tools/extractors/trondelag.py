#!/usr/bin/env python3
"""Trøndelag — five regional PDFs, one per inntaksregion, Vg1.

A wide matrix whose columns are Grep programområdekoder (BABAT1----); the human
labels in the header are wrapped and mangled, so codes are resolved against
Udir's Grep registry instead (tools/fetch_grep.py).

Rows carry the Vigo school number glued to the name ("50010Heimdal videregående
skole"). The county's own legend defines the one symbol used:
    "* Alle med ungdomsrett som hadde søkt på skolen kom inn"  -> open

Thresholds apply to applicants resident in the region: "Poengsummen som vises i
tabellen er laveste inntatt søker som har tilhørighet i regionen."
"""
import json
import os
import re
import sys

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', '..', 'poenggrenser', 'data', 'trondelag')
GREP = os.path.join(HERE, '..', 'grep-programomraader.json')

META = {
    'code': '50', 'fylke': 'Trøndelag', 'round': None, 'rights': 'ungdomsrett',
    'round_note': 'the PDFs do not state which intake round the figures are from',
    'free_choice': False,          # 5 inntaksregioner
    'levels': 'Vg1',
    'source': 'https://www.vilbli.no/nb/trondelag/a/poengsum-og-karakterer-6',
    'note': 'thresholds apply to applicants resident in the intake region',
}
CODE_RE = re.compile(r'^[A-ZÆØÅ]{4,6}\d-{0,6}$')
SCHOOLNR_RE = re.compile(r'^(\d{5})(.*)$')
# the county's own PDFs misspell these
SCHOOL_FIXES = {
    'Kyrsæterøra videregående skole': 'Kyrksæterøra videregående skole',
    'Verdal videregåendende skole': 'Verdal videregående skole',
    'Inderøy videregåendende skole': 'Inderøy videregående skole',
}
REGION_NAMES = {'trondheim': 'Trondheim', 'fosen': 'Fosen', 'namdal': 'Namdal',
                'innherred-vaernes': 'Innherred-Værnes', 'trondelag-sor': 'Trøndelag sør'}


def _grep():
    try:
        return json.load(open(GREP))
    except Exception:
        return {}


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    grep = _grep()
    if not grep:
        warn.append('Grep registry missing — run tools/fetch_grep.py')
    for fname in sorted(os.listdir(SRC), reverse=True):
        if not fname.endswith('.pdf'):
            continue
        m = re.search(r'(20\d\d)-\d\d_(.+)\.pdf', fname)
        if not m:
            warn.append(f'{fname}: cannot read year/region from filename')
            continue
        year, region = int(m.group(1)), REGION_NAMES.get(m.group(2), m.group(2))
        rows = []
        with pdfplumber.open(os.path.join(SRC, fname)) as pdf:
            for page in pdf.pages:
                words = page.extract_words()
                cols = sorted(((w['x0'], common.norm(w['text'])) for w in words
                               if CODE_RE.match(common.norm(w['text']))), key=lambda c: c[0])
                if not cols:
                    continue
                for line in _cluster(words):
                    toks = sorted(line, key=lambda w: w['x0'])
                    first = common.norm(toks[0]['text'])
                    if not re.fullmatch(r'\d{8}', first):     # data rows start with the school year
                        continue
                    name_parts, values = [], []
                    for w in toks[1:]:
                        t = common.norm(w['text'])
                        sn = SCHOOLNR_RE.match(t)
                        if sn and not name_parts:
                            if sn.group(2):
                                name_parts.append(sn.group(2))
                            continue
                        if re.fullmatch(r'\d{1,2}(?:,\d)?|\*', t):
                            values.append(((w['x0'] + w['x1']) / 2, t))
                        else:
                            name_parts.append(t)
                    school = common.squash(' '.join(name_parts))
                    school = SCHOOL_FIXES.get(school, school)
                    if not school:
                        continue
                    for x, raw in values:   # x is the value's centre
                        code = None       # values are centred on the column
                        for cx, c in cols:
                            if cx <= x + 8:
                                code = c
                            else:
                                break
                        if not code:
                            continue
                        name = (grep.get(code, {}) or {}).get('nob')
                        if not name:
                            warn.append(f'{fname}: unknown Grep code {code}')
                            continue
                        v = 'open' if raw == '*' else common.classify_cell(raw, min_value=0)
                        if v is None:
                            continue
                        program = common.canon_program(name)
                        rows.append({'school': school, 'program': program,
                                     'level': common.guess_level(program, 'Vg1'),
                                     'values': {year: v}, 'region': region,
                                     'county': META['fylke'], 'round': META['round']})
        out.append((fname, rows))
    return out, warn


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
