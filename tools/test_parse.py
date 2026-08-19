#!/usr/bin/env python3
"""Regression tests for the parsed dataset.

Every assertion here encodes a defect found by the 2026-08-19 QA audit, which
verified values independently (pdfplumber coordinates + rendered PDF pages).
Run after any parser change:  .venv/bin/python3 tools/test_parse.py
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(HERE, '..', 'web', 'data', 'schools.json')))
SCHOOLS = {s['name']: s for s in DATA['schools']}

fails, checks = [], 0


def check(desc, cond, detail=''):
    global checks
    checks += 1
    if not cond:
        fails.append(f'{desc}' + (f' — {detail}' if detail else ''))


def progs(school_sub, prog_sub=None, level=None):
    out = []
    for name, s in SCHOOLS.items():
        if school_sub.lower() not in name.lower():
            continue
        for p in s['programs']:
            if prog_sub and prog_sub.lower() not in p['program'].lower():
                continue
            if level and p['level'] != level:
                continue
            out.append(p)
    return out


def value(school_sub, prog_exact, year, level=None):
    for p in progs(school_sub, prog_exact, level):
        if p['program'].lower() == prog_exact.lower() and str(year) in p['values']:
            return p['values'][str(year)]
    return None


# --- shape -------------------------------------------------------------
check('25 schools', len(DATA['schools']) == 25, f'got {len(DATA["schools"])}')
check('years 2018-2025', DATA['years'] == list(range(2018, 2026)), str(DATA['years']))
cells = [(s['name'], p, y, v) for s in DATA['schools'] for p in s['programs']
         for y, v in p['values'].items()]
check('>= 3400 cells', len(cells) >= 3400, f'got {len(cells)}')
n2018 = sum(1 for _, _, y, _ in cells if y == '2018')
check('2018 coverage restored (>= 340 cells)', n2018 >= 340, f'got {n2018}')
check('all schools geocoded',
      all(s.get('lat') for s in DATA['schools']),
      str([s['name'] for s in DATA['schools'] if not s.get('lat')]))

# --- QA D2: two tables on one page were merged under one school --------
check('St.Olav does not carry Sola flyfag', not progs('St.Olav', 'flyfag'))
check('St.Olav does not carry Sola avionikk', not progs('St.Olav', 'avionik'))
check('Katedralskole does not carry Offshore brønnteknikk',
      not progs('Katedralskole', 'brønnteknikk'))
check('Sola keeps its own flyfag', bool(progs('Sola videregående', 'flyfag')))
check('Offshore keeps brønnteknikk', bool(progs('Offshore', 'brønnteknikk')))
check('St.Olav studiespes 2019 = 39.4', value('St.Olav', 'Studiespesialisering', 2019) == 39.4,
      str(value('St.Olav', 'Studiespesialisering', 2019)))
check('St.Olav studiespes 2020 = 43.0', value('St.Olav', 'Studiespesialisering', 2020) == 43.0,
      str(value('St.Olav', 'Studiespesialisering', 2020)))
check('Sola idrettsfag 2019 = 34.7',
      value('Sola videregående', 'Idrettsfag', 2019, 'Vg1') == 34.7,
      str(value('Sola videregående', 'Idrettsfag', 2019, 'Vg1')))

# --- QA D3: Kopervik 2024 lost to a source header typo -----------------
kop2024 = [p for p in progs('Kopervik') if '2024' in p['values']]
check('Kopervik has 2024 data', len(kop2024) >= 10, f'{len(kop2024)} programs')
check('Kopervik Realfag 2024 = 36.7', value('Kopervik', 'Realfag', 2024) == 36.7,
      str(value('Kopervik', 'Realfag', 2024)))
check('Kopervik Idrettsfag Vg1 2024 = open',
      value('Kopervik', 'Idrettsfag', 2024, 'Vg1') == 'open',
      str(value('Kopervik', 'Idrettsfag', 2024, 'Vg1')))

# --- QA D1: 2019-2020 file column collapse -----------------------------
check('Dalane Elenergi 2018 = 34.4', value('Dalane', 'Elenergi', 2018) == 34.4,
      str(value('Dalane', 'Elenergi', 2018)))
check('Dalane Elenergi 2019 = 36.7', value('Dalane', 'Elenergi', 2019) == 36.7,
      str(value('Dalane', 'Elenergi', 2019)))
check('Åkrehamn Elenergi 2019 = 44.4', value('Åkrehamn', 'Elenergi', 2019) == 44.4,
      str(value('Åkrehamn', 'Elenergi', 2019)))
check('Ølen Elektrofag 2019 = 35.6', value('Ølen', 'Elektrofag', 2019) == 35.6,
      str(value('Ølen', 'Elektrofag', 2019)))

# --- QA D4: garbage rows / absurd values -------------------------------
bad_names = [f'{s}: {p["program"]}' for s, p, _, _ in cells
             if re.search(r'\s\d+(?:,\d+)?$', p['program'])]
check('no threshold glued onto a program name', not bad_names, str(bad_names[:3]))
glued = [f'{s}: {p["program"]}' for s, p, _, _ in cells
         if re.search(r'ventelis|fortrinn|fortinn|utgår|ledige|dokumentasjon',
                      p['program'], re.I)]
check('no value token glued into a program name', not glued, str(glued[:3]))
absurd = [(s, p['program'], y, v) for s, p, y, v in cells
          if isinstance(v, (int, float)) and not (8 <= v <= 65)]
check('no absurd thresholds', not absurd, str(absurd[:3]))
uncat = sorted({f'{s}: {p["program"]}' for s, p, _, _ in cells if p['category'] == 'annet'})
check('every program categorised', not uncat, str(uncat[:5]))

# --- known-good values that must never regress -------------------------
check('Bryne ST 2023 = 38.8', value('Bryne', 'Studiespesialisering', 2023) == 38.8)
check('Bryne ST 2024 = 36.5', value('Bryne', 'Studiespesialisering', 2024) == 36.5)
check('Bryne ST 2025 = 37.7', value('Bryne', 'Studiespesialisering', 2025) == 37.7)
check('Bergeland ST discontinued in 2019',
      value('Bergeland', 'Studiespesialisering', 2019) == 'U',
      str(value('Bergeland', 'Studiespesialisering', 2019)))
check('Sauda Ambulansefag 2025 = 53.8', value('Sauda', 'Ambulansefag', 2025) == 53.8,
      str(value('Sauda', 'Ambulansefag', 2025)))

# --- semantics ---------------------------------------------------------
statuses = {v for _, _, _, v in cells if isinstance(v, str)}
check('only known statuses', statuses <= {'open', 'F', 'U', 'D'}, str(statuses))
check('documentation status present (IB/toppidrett)',
      any(v == 'D' for _, _, _, v in cells))

print(f'{checks - len(fails)}/{checks} checks passed')
for f in fails:
    print('  FAIL:', f)
sys.exit(1 if fails else 0)
