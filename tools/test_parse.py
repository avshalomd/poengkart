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
# Rogaland-specific assertions are scoped to Rogaland so they keep meaning as
# other counties are added; national invariants are checked over everything.
ROGALAND = [s for s in DATA['schools'] if s.get('fylke', 'Rogaland') == 'Rogaland']
SCHOOLS = {s['name']: s for s in ROGALAND}

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
check('Rogaland has 25 schools', len(ROGALAND) == 25, f'got {len(ROGALAND)}')
check('years cover 2018-2025 contiguously',
      set(range(2018, 2026)) <= set(DATA['years'])
      and DATA['years'] == sorted(set(DATA['years'])), str(DATA['years']))
cells = [(s['name'], p, y, v) for s in ROGALAND for p in s['programs']
         for y, v in p['values'].items()]
nat_cells = [(s['name'], p, y, v) for s in DATA['schools'] for p in s['programs']
             for y, v in p['values'].items()]
check('>= 3400 cells', len(cells) >= 3400, f'got {len(cells)}')
n2018 = sum(1 for _, _, y, _ in cells if y == '2018')
check('2018 coverage restored (>= 340 cells)', n2018 >= 340, f'got {n2018}')
# one school (Mo og Øyrane, merged away) has no locatable address in NSR,
# Kartverket addresses or the place-name register
UNLOCATABLE = {'Mo og Øyrane vidaregåande skule'}
ungeocoded = [s['name'] for s in DATA['schools'] if not s.get('lat')]
check('every locatable school is geocoded',
      set(ungeocoded) <= UNLOCATABLE, str(ungeocoded[:5]))
check('at least 99% of schools are on the map',
      len(ungeocoded) <= max(1, len(DATA['schools']) // 100), f'{len(ungeocoded)} missing')

# --- national invariants (hold for every county) -----------------------
check('every school has a county', all(s.get('fylke') for s in DATA['schools']),
      str([s['name'] for s in DATA['schools'] if not s.get('fylke')][:5]))
# Buskerud and Trøndelag genuinely do not state a round; that must be
# declared in the county metadata rather than silently assumed
noted = {c['fylke'] for c in DATA['counties'] if c.get('round') or c.get('round_note')}
check('every county states its intake round or documents that it does not',
      {s['fylke'] for s in DATA['schools']} <= noted,
      str(sorted({s['fylke'] for s in DATA['schools']} - noted)))
check('counties metadata present and counted',
      bool(DATA.get('counties')) and all(c.get('schools') for c in DATA['counties']),
      str(DATA.get('counties')))
check('coordinates inside Norway',
      all(57 < s['lat'] < 72 and 4 < s['lon'] < 32 for s in DATA['schools'] if s.get('lat')),
      str([(s['name'], s.get('lat'), s.get('lon')) for s in DATA['schools']
           if s.get('lat') and not (57 < s['lat'] < 72 and 4 < s['lon'] < 32)][:3]))
nat_statuses = {v for _, _, _, v in nat_cells if isinstance(v, str)}
check('only known statuses nationally', nat_statuses <= {'open', 'F', 'U', 'D'}, str(nat_statuses))
# 0,0 is a real published value in Akershus ("flere med 0,0 i poengsum står
# igjen på venteliste og ikke har fått plass"), so the national floor is 0
nat_absurd = [(s, p['program'], y, v) for s, p, y, v in nat_cells
              if isinstance(v, (int, float)) and not (0 <= v <= 65)]
check('no out-of-range thresholds nationally', not nat_absurd, str(nat_absurd[:3]))
zero_counties = {s['fylke'] for s in DATA['schools'] for p in s['programs']
                 for v in p['values'].values() if v == 0}
# verified against each source: Akershus documents it in a footnote, and
# Innlandet/Vestland print a literal 0 in the table
check('0,0 appears only where the source publishes it',
      zero_counties <= {'Akershus', 'Innlandet', 'Vestland'}, str(sorted(zero_counties)))
nat_uncat = sorted({f'{s}: {p["program"]}' for s, p, _, _ in nat_cells if p['category'] == 'annet'})
check('every programme categorised nationally', not nat_uncat, str(nat_uncat[:5]))
check('no duplicate (county, school)',
      len({(s['fylke'], s['name']) for s in DATA['schools']}) == len(DATA['schools']))

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

# --- national QA audit 2026-08-20: defects that must not come back ------
def county(name):
    return [s for s in DATA['schools'] if s['fylke'] == name]


def ccells(name):
    return [(s['name'], p, y, v) for s in county(name) for p in s['programs']
            for y, v in p['values'].items()]

# Vestland: the parser skipped every page that did not repeat the header,
# losing 68% of the county and four schools outright
vest = {s['name'] for s in county('Vestland')}
check('Vestland keeps header-less continuation pages', len(ccells('Vestland')) > 2500,
      f'{len(ccells("Vestland"))} cells')
for missing in ('Bergen katedralskole', 'Langhaugen', 'Os gymnas', 'Firda'):
    check(f'Vestland includes {missing}', any(missing in n for n in vest))

# Trøndelag: a too-narrow Grep code pattern slid values onto the previous
# column, publishing music/dance/drama under "Kunst, design og arkitektur"
tr_progs = {p['program'] for s in county('Trøndelag') for p in s['programs']}
check('Trøndelag has music/dance/drama', any('Musikk' in p for p in tr_progs), str(sorted(tr_progs)[:6]))
tr_pairs = [(s['name'], p['program']) for s in county('Trøndelag') for p in s['programs']]
check('Trøndelag has no duplicate school+programme', len(tr_pairs) == len(set(tr_pairs)))

# Oslo: the page title bled into the rotated column headers for 2022
oslo_progs = {p['program'] for s in county('Oslo') for p in s['programs']}
check('Oslo programme names are clean',
      not [p for p in oslo_progs if p[:1].islower() or len(p) < 5],
      str([p for p in oslo_progs if p[:1].islower() or len(p) < 5][:4]))
blindern = [p for s in county('Oslo') if 'Blindern' in s['name']
            for p in s['programs'] if p['program'] == 'Studiespesialisering']
check('Oslo 2022 lands on the right series',
      bool(blindern) and blindern[0]['values'].get('2022') == 44.6,
      str(blindern[0]['values'] if blindern else None))

# Innlandet: "Intervju" was dropped instead of being read as documentation
check('Innlandet keeps interview-admitted programmes',
      any(v == 'D' for _, _, _, v in ccells('Innlandet')))

# Hordaland's two press releases each print last year's figure beside this
# year's, so they overlap on 2018 — and they were published a year apart, by
# hand, in different house styles. If the parse of either is wrong they will
# disagree. This is the only cross-check in the dataset where two independent
# documents state the same cell.
hord = [(s['name'], p['values'].get('2018'), p['values'].get('2019'))
        for s in county('Vestland') for p in s['programs']
        if p['program'] == 'Studiespesialisering' and '2018' in p['values']]
check('Hordaland press releases give 2017-2019 for the Bergen area',
      len(hord) >= 14, f'{len(hord)} schools carry a 2018 figure')
check('the recovered Hordaland years are plausible thresholds',
      all(20 <= v <= 55 for _, v, _ in hord if isinstance(v, (int, float))),
      str(sorted(v for _, v, _ in hord if isinstance(v, (int, float)))[:4]))
early = {int(y) for s in county('Vestland') for p in s['programs'] for y in p['values']}
check('Vestland now reaches back to 2017', min(early) == 2017, str(sorted(early)))

# The page's own copy carries headline numbers (meta description, the
# noscript fallback, the alt text for the share card). Those are read by people
# and by link previews, not rendered from the data, so they rot silently when a
# county or a year is added. Assert that *every* copy of each number is right,
# not merely that a right one exists somewhere.
html = open(os.path.join(HERE, '..', 'web', 'index.html'), encoding='utf-8').read()
head = (html[:html.index('</head>')]
        + html[html.index('<noscript>'):html.index('</noscript>')])
n_schools, y0, y1 = len(DATA['schools']), DATA['years'][0], DATA['years'][-1]
NORSK = {5: 'fem', 6: 'seks', 7: 'sju', 8: 'åtte', 9: 'ni', 10: 'ti'}
n_fylker = NORSK.get(len(DATA['counties']), str(len(DATA['counties'])))

counts = re.findall(r'(\d{2,4})\s+(?:videregående skoler|skoler|schools)', head)
check('every school count in the page copy matches the dataset',
      counts and all(int(c) == n_schools for c in counts),
      f'found {counts}, dataset has {n_schools}')
spans = re.findall(r'\b(20\d\d)[–-](20\d\d)\b', head)
check('every year span in the page copy matches the dataset',
      spans and all((int(a), int(b)) == (y0, y1) for a, b in spans),
      f'found {spans}, dataset has {y0}-{y1}')
fylker = re.findall(r'\b([a-zæøå]+|\d+)\s+(?:fylker|counties)\b', head)
check('every county count in the page copy matches the dataset',
      fylker and all(f in (n_fylker, str(len(DATA['counties']))) for f in fylker),
      f'found {fylker}, dataset has {n_fylker}')
check('the share card has been built',
      os.path.exists(os.path.join(HERE, '..', 'web', 'og.png')))

# --- taxonomy: the categories are Udir's, not ours ----------------------
# Each of these encodes a defect the keyword classifier had, or an invariant
# that keeps the register-backed one honest. See docs/programme-categories.md.
sys.path.insert(0, HERE)
import taxonomy   # noqa: E402

ALL_PROGS = [(s['name'], p) for s in DATA['schools'] for p in s['programs']]
unresolved = sorted({p['program'] for _, p in ALL_PROGS
                     if taxonomy.resolve(p['program'])[0] is None})
check('every programme name resolves against the Grep register', not unresolved,
      f'{len(unresolved)} unresolved, e.g. {unresolved[:4]} — see the note at '
      f'the top of tools/taxonomy.py')
stray = sorted({p['category'] for _, p in ALL_PROGS} - set(taxonomy.CATEGORIES))
check('every category is one Udir publishes', not stray, str(stray))
missing_en = sorted({p['program'] for _, p in ALL_PROGS if not p.get('program_en')})
check('every programme has an English name', not missing_en, str(missing_en[:4]))

# the four the keyword list got wrong, each for a different reason
def cat_of(sub):
    hits = {p['category'] for _, p in ALL_PROGS if sub.lower() in p['program'].lower()}
    return hits

check('gartnernæring is agriculture, not food',           # 'ernæring' substring
      cat_of('gartnernæring') == {'NA'}, str(cat_of('gartnernæring')))
check('anleggsmaskinmekaniker is industry, not building',
      cat_of('anleggsmaskinmekaniker') == {'TP'}, str(cat_of('anleggsmaskinmekaniker')))
check('smed is crafts, not industry',
      cat_of('smed,') == {'DT'}, str(cat_of('smed,')))
check('energioperatør is electrical, not industry',
      cat_of('energi operatør') == {'EL'}, str(cat_of('energi operatør')))
check('toppidrett inside general studies stays general studies',
      cat_of('studiespesialisering, toppidrett') == {'ST'},
      str(cat_of('studiespesialisering, toppidrett')))
check('the two crafts programmes are separate categories',
      {'FD', 'DT'} <= {p['category'] for _, p in ALL_PROGS})

print(f'{checks - len(fails)}/{checks} checks passed')
for f in fails:
    print('  FAIL:', f)
sys.exit(1 if fails else 0)
